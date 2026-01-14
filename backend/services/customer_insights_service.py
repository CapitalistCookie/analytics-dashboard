"""Customer Insights Service for return visitor detection and loyalty tracking."""

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
import numpy as np
import json
import logging

from models import CustomerProfile, TrackedPerson, PersonSighting, PersonEmbedding

logger = logging.getLogger(__name__)

# Similarity threshold for return visitor matching (slightly lower than same-day matching)
RETURN_VISITOR_THRESHOLD = 0.82

# Loyalty tier definitions
LOYALTY_TIERS = {
    "new": {"min_visits": 1, "max_visits": 1},
    "occasional": {"min_visits": 2, "max_visits": 4},
    "regular": {"min_visits": 5, "max_visits": 14},
    "vip": {"min_visits": 15, "max_visits": float('inf')}
}


class CustomerInsightsService:
    """Service for customer insights, return visitor detection, and loyalty tracking."""

    @staticmethod
    def find_or_create_profile(
        db: Session,
        person: TrackedPerson,
        embedding: np.ndarray
    ) -> Tuple[CustomerProfile, bool]:
        """
        Find existing customer profile or create new one.
        Returns (profile, is_returning_customer)
        """
        # Search existing profiles
        profiles = db.query(CustomerProfile).all()

        best_match: Optional[CustomerProfile] = None
        best_similarity = 0.0

        for profile in profiles:
            if profile.representative_embedding:
                try:
                    stored_emb = np.frombuffer(profile.representative_embedding, dtype=np.float32)
                    # Normalize if needed
                    if len(stored_emb) == len(embedding):
                        similarity = float(np.dot(embedding, stored_emb))

                        if similarity > best_similarity and similarity >= RETURN_VISITOR_THRESHOLD:
                            best_similarity = similarity
                            best_match = profile
                except Exception as e:
                    logger.warning(f"Error comparing embeddings for profile {profile.profile_id}: {e}")
                    continue

        if best_match:
            # Returning customer - update profile
            best_match.last_visit = datetime.utcnow()
            best_match.total_visits += 1
            best_match.loyalty_tier = CustomerInsightsService._calculate_tier(best_match.total_visits)
            best_match.loyalty_points += 10  # Points per visit

            # Update linked persons
            try:
                linked = json.loads(best_match.linked_person_ids or "[]")
            except json.JSONDecodeError:
                linked = []

            if person.id not in linked:
                linked.append(person.id)
                best_match.linked_person_ids = json.dumps(linked)

            # Update representative embedding (running average: 80% old + 20% new)
            try:
                stored_emb = np.frombuffer(best_match.representative_embedding, dtype=np.float32)
                updated_emb = 0.8 * stored_emb + 0.2 * embedding
                updated_emb = updated_emb / (np.linalg.norm(updated_emb) + 1e-8)
                best_match.representative_embedding = updated_emb.astype(np.float32).tobytes()
            except Exception as e:
                logger.warning(f"Error updating embedding for profile {best_match.profile_id}: {e}")

            db.commit()
            logger.info(f"Return visitor detected: {best_match.profile_id} (visit #{best_match.total_visits})")
            return best_match, True

        # New customer - create profile
        profile_count = db.query(func.count(CustomerProfile.id)).scalar() or 0
        new_profile = CustomerProfile(
            profile_id=f"C-{profile_count + 1:05d}",
            representative_embedding=embedding.astype(np.float32).tobytes(),
            first_visit=datetime.utcnow(),
            last_visit=datetime.utcnow(),
            total_visits=1,
            loyalty_tier="new",
            loyalty_points=10,
            linked_person_ids=json.dumps([person.id])
        )
        db.add(new_profile)
        db.commit()

        logger.info(f"New customer profile created: {new_profile.profile_id}")
        return new_profile, False

    @staticmethod
    def _calculate_tier(visits: int) -> str:
        """Calculate loyalty tier based on visit count."""
        for tier, bounds in LOYALTY_TIERS.items():
            if bounds["min_visits"] <= visits <= bounds["max_visits"]:
                return tier
        return "vip"

    @staticmethod
    def update_profile_stats(db: Session, profile_id: int) -> None:
        """Update aggregated stats for a customer profile."""
        profile = db.query(CustomerProfile).filter(CustomerProfile.id == profile_id).first()
        if not profile:
            return

        try:
            linked_ids = json.loads(profile.linked_person_ids or "[]")
        except json.JSONDecodeError:
            linked_ids = []

        if not linked_ids:
            return

        # Get all sightings for linked persons
        sightings = db.query(PersonSighting).filter(
            PersonSighting.person_id.in_(linked_ids)
        ).all()

        if not sightings:
            return

        # Calculate avg dwell time
        dwell_times = []
        for s in sightings:
            if s.exit_time and s.enter_time:
                dwell = (s.exit_time - s.enter_time).total_seconds() / 60
                if dwell > 0:
                    dwell_times.append(dwell)

        if dwell_times:
            profile.avg_dwell_minutes = round(sum(dwell_times) / len(dwell_times), 1)
            profile.total_spend_minutes = round(sum(dwell_times), 1)

        # Find favorite zone
        zone_counts: Dict[str, int] = {}
        for s in sightings:
            if s.zone_name:
                zone_counts[s.zone_name] = zone_counts.get(s.zone_name, 0) + 1

        if zone_counts:
            profile.favorite_zone = max(zone_counts, key=zone_counts.get)

        db.commit()

    @staticmethod
    def get_insights_summary(db: Session) -> Dict:
        """Get overall customer insights summary."""
        profiles = db.query(CustomerProfile).all()

        # Tier distribution
        tier_counts = {"new": 0, "occasional": 0, "regular": 0, "vip": 0}
        for p in profiles:
            tier = p.loyalty_tier or "new"
            tier_counts[tier] = tier_counts.get(tier, 0) + 1

        # Recent visitors (last 7 days)
        week_ago = datetime.utcnow() - timedelta(days=7)
        recent = [p for p in profiles if p.last_visit and p.last_visit >= week_ago]
        returning_recent = [p for p in recent if p.total_visits > 1]

        # Calculate averages
        total_profiles = len(profiles)
        avg_visits = sum(p.total_visits for p in profiles) / total_profiles if total_profiles else 0
        avg_dwell = sum(p.avg_dwell_minutes or 0 for p in profiles) / total_profiles if total_profiles else 0

        return {
            "total_customers": total_profiles,
            "tier_distribution": tier_counts,
            "recent_visitors_7d": len(recent),
            "returning_rate_7d": round(len(returning_recent) / len(recent) * 100, 1) if recent else 0,
            "avg_visits_per_customer": round(avg_visits, 1),
            "avg_dwell_minutes": round(avg_dwell, 1),
            "vip_count": tier_counts.get("vip", 0),
            "regular_count": tier_counts.get("regular", 0)
        }

    @staticmethod
    def get_top_customers(db: Session, limit: int = 20) -> List[Dict]:
        """Get top customers by visits and loyalty."""
        profiles = db.query(CustomerProfile).order_by(
            desc(CustomerProfile.total_visits)
        ).limit(limit).all()

        return [{
            "profile_id": p.profile_id,
            "total_visits": p.total_visits,
            "loyalty_tier": p.loyalty_tier,
            "loyalty_points": p.loyalty_points,
            "first_visit": p.first_visit.isoformat() if p.first_visit else None,
            "last_visit": p.last_visit.isoformat() if p.last_visit else None,
            "avg_dwell_minutes": p.avg_dwell_minutes,
            "favorite_zone": p.favorite_zone,
            "days_since_last_visit": (datetime.utcnow() - p.last_visit).days if p.last_visit else None
        } for p in profiles]

    @staticmethod
    def get_visit_frequency(db: Session, days: int = 30) -> Dict:
        """Analyze visit frequency patterns."""
        cutoff = datetime.utcnow() - timedelta(days=days)

        profiles = db.query(CustomerProfile).filter(
            CustomerProfile.last_visit >= cutoff
        ).all()

        # Group by visits per period
        frequency_buckets = {
            "once": 0,
            "2-3_times": 0,
            "4-7_times": 0,
            "8+_times": 0
        }

        for p in profiles:
            # Estimate visits in period
            if p.first_visit and p.first_visit >= cutoff:
                visits_in_period = p.total_visits
            else:
                # Prorate based on time
                total_days = (datetime.utcnow() - p.first_visit).days if p.first_visit else days
                visits_in_period = int(p.total_visits * (days / max(total_days, 1)))

            if visits_in_period == 1:
                frequency_buckets["once"] += 1
            elif visits_in_period <= 3:
                frequency_buckets["2-3_times"] += 1
            elif visits_in_period <= 7:
                frequency_buckets["4-7_times"] += 1
            else:
                frequency_buckets["8+_times"] += 1

        return {
            "period_days": days,
            "frequency_distribution": frequency_buckets,
            "total_active_customers": len(profiles)
        }

    @staticmethod
    def get_customer_journey_patterns(db: Session, profile_id: str) -> Dict:
        """Get journey patterns for a specific customer."""
        profile = db.query(CustomerProfile).filter(
            CustomerProfile.profile_id == profile_id
        ).first()

        if not profile:
            return {"error": "Profile not found"}

        try:
            linked_ids = json.loads(profile.linked_person_ids or "[]")
        except json.JSONDecodeError:
            linked_ids = []

        # Get all journeys
        sightings = db.query(PersonSighting).filter(
            PersonSighting.person_id.in_(linked_ids)
        ).order_by(PersonSighting.enter_time).all()

        # Analyze patterns
        zone_time: Dict[str, float] = {}
        visit_times: List[int] = []

        for s in sightings:
            # Zone time
            if s.exit_time and s.enter_time:
                dwell = (s.exit_time - s.enter_time).total_seconds() / 60
                if s.zone_name:
                    zone_time[s.zone_name] = zone_time.get(s.zone_name, 0) + dwell

            # Visit time of day
            if s.enter_time:
                visit_times.append(s.enter_time.hour)

        # Calculate preferred time
        preferred_time = "unknown"
        if visit_times:
            avg_hour = sum(visit_times) / len(visit_times)
            if avg_hour < 12:
                preferred_time = "morning"
            elif avg_hour < 17:
                preferred_time = "afternoon"
            else:
                preferred_time = "evening"

        return {
            "profile_id": profile_id,
            "total_visits": profile.total_visits,
            "zone_time_minutes": {k: round(v, 1) for k, v in zone_time.items()},
            "preferred_time": preferred_time,
            "favorite_zone": profile.favorite_zone,
            "loyalty_tier": profile.loyalty_tier,
            "loyalty_points": profile.loyalty_points,
            "first_visit": profile.first_visit.isoformat() if profile.first_visit else None,
            "last_visit": profile.last_visit.isoformat() if profile.last_visit else None
        }

    @staticmethod
    def get_retention_analysis(db: Session) -> Dict:
        """Analyze customer retention over time."""
        now = datetime.utcnow()

        periods = {
            "7d": now - timedelta(days=7),
            "30d": now - timedelta(days=30),
            "90d": now - timedelta(days=90)
        }

        results = {}

        for period_name, cutoff in periods.items():
            # Customers who visited in period
            visited = db.query(CustomerProfile).filter(
                CustomerProfile.last_visit >= cutoff
            ).all()

            # Of those, how many are returning
            returning = [p for p in visited if p.total_visits > 1]

            results[period_name] = {
                "total_visitors": len(visited),
                "returning_visitors": len(returning),
                "new_visitors": len(visited) - len(returning),
                "retention_rate": round(len(returning) / len(visited) * 100, 1) if visited else 0
            }

        return results

    @staticmethod
    def get_churn_risk(db: Session, days_threshold: int = 30) -> List[Dict]:
        """Identify customers at risk of churning (haven't visited recently)."""
        cutoff = datetime.utcnow() - timedelta(days=days_threshold)

        # Regular/VIP customers who haven't visited
        at_risk = db.query(CustomerProfile).filter(
            CustomerProfile.loyalty_tier.in_(["regular", "vip"]),
            CustomerProfile.last_visit < cutoff
        ).all()

        return [{
            "profile_id": p.profile_id,
            "loyalty_tier": p.loyalty_tier,
            "total_visits": p.total_visits,
            "last_visit": p.last_visit.isoformat() if p.last_visit else None,
            "days_since_visit": (datetime.utcnow() - p.last_visit).days if p.last_visit else None,
            "loyalty_points": p.loyalty_points
        } for p in at_risk]

    @staticmethod
    def get_dashboard(db: Session) -> Dict:
        """Get complete insights dashboard data."""
        return {
            "summary": CustomerInsightsService.get_insights_summary(db),
            "top_customers": CustomerInsightsService.get_top_customers(db, 10),
            "retention": CustomerInsightsService.get_retention_analysis(db),
            "churn_risk": CustomerInsightsService.get_churn_risk(db, 30)[:10],
            "frequency": CustomerInsightsService.get_visit_frequency(db, 30)
        }
