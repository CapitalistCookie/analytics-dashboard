"""
Staff Analytics Service - Operations efficiency tracking for staff members.

Provides analytics for:
- Staff activity tracking
- Zone coverage analysis
- Efficiency metrics
- Service time estimates
- Shift performance comparisons
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional
from collections import defaultdict
import logging

from sqlalchemy.orm import Session
from sqlalchemy import func, or_

logger = logging.getLogger(__name__)


class StaffAnalyticsService:
    """Service for staff-specific analytics."""

    @staticmethod
    def get_staff_summary(db: Session, hours: int = 24) -> Dict:
        """Get summary of all staff activity."""
        from models import TrackedPerson, PersonSighting, PersonAction, Staff

        cutoff = datetime.utcnow() - timedelta(hours=hours)

        # Get all staff persons (either person_type='staff' or has staff_id)
        staff_persons = db.query(TrackedPerson).filter(
            or_(
                TrackedPerson.person_type == "staff",
                TrackedPerson.staff_id.isnot(None)
            ),
            TrackedPerson.first_seen >= cutoff
        ).all()

        summary = {
            "period_hours": hours,
            "total_staff_detected": len(staff_persons),
            "staff": []
        }

        for person in staff_persons:
            # Get staff name from Staff table if linked
            staff_name = None
            if person.staff_id:
                staff = db.query(Staff).filter(Staff.id == person.staff_id).first()
                if staff:
                    staff_name = staff.name

            # Get sightings
            sightings = db.query(PersonSighting).filter(
                PersonSighting.person_id == person.id,
                PersonSighting.enter_time >= cutoff
            ).all()

            # Calculate total tracked time
            total_time = 0
            for s in sightings:
                if s.exit_time:
                    total_time += (s.exit_time - s.enter_time).total_seconds()

            # Get unique zones visited
            zones_visited = list(set(s.zone_name for s in sightings if s.zone_name))

            # Get actions breakdown
            actions = db.query(PersonAction).filter(
                PersonAction.person_id == person.id,
                PersonAction.started_at >= cutoff
            ).all()

            action_breakdown = defaultdict(float)
            for a in actions:
                if a.duration_seconds:
                    action_breakdown[a.action] += a.duration_seconds

            summary["staff"].append({
                "person_id": person.id,
                "display_id": person.display_id,
                "staff_name": staff_name or person.name,
                "staff_id": person.staff_id,
                "first_seen": person.first_seen.isoformat() if person.first_seen else None,
                "last_seen": person.last_seen.isoformat() if person.last_seen else None,
                "total_time_minutes": round(total_time / 60, 1),
                "zones_visited": zones_visited,
                "zone_count": len(zones_visited),
                "action_breakdown": {
                    k: round(v / 60, 1) for k, v in action_breakdown.items()
                },
                "sighting_count": len(sightings),
            })

        return summary

    @staticmethod
    def get_coverage_analysis(db: Session, hours: int = 8) -> Dict:
        """Analyze staff coverage across zones."""
        from models import TrackedPerson, PersonSighting

        cutoff = datetime.utcnow() - timedelta(hours=hours)

        # Define zones that need staff coverage (customer-facing)
        customer_zones = ["entrance", "seating", "bar_lounge", "cashier", "food_pickup"]

        # Track staff sightings by zone and hour
        coverage = defaultdict(lambda: defaultdict(int))
        gaps = []

        # Query staff sightings
        staff_sightings = db.query(PersonSighting).join(TrackedPerson).filter(
            or_(
                TrackedPerson.person_type == "staff",
                TrackedPerson.staff_id.isnot(None)
            ),
            PersonSighting.enter_time >= cutoff
        ).all()

        for s in staff_sightings:
            if s.zone_name:
                hour = s.enter_time.hour
                coverage[s.zone_name][hour] += 1

        # Find coverage gaps (hours with no staff in customer zones)
        current_hour = datetime.utcnow().hour
        for zone in customer_zones:
            zone_coverage = coverage.get(zone, {})
            # Check business hours (8am to 11pm)
            for hour in range(8, 23):
                if zone_coverage.get(hour, 0) == 0:
                    # Only flag gaps in past hours or current hour
                    if hour <= current_hour:
                        gaps.append({
                            "zone": zone,
                            "hour": hour,
                            "severity": "high" if zone in ["cashier", "entrance"] else "medium"
                        })

        # Calculate coverage score per zone (percentage of business hours covered)
        zone_scores = {}
        for zone in customer_zones:
            zone_hours = coverage.get(zone, {})
            # Count hours with any coverage between 8am-11pm
            covered_hours = sum(1 for h in range(8, 23) if zone_hours.get(h, 0) > 0)
            total_hours = 15  # 8am to 11pm
            zone_scores[zone] = round((covered_hours / total_hours) * 100, 1)

        overall_score = round(sum(zone_scores.values()) / len(zone_scores), 1) if zone_scores else 0

        return {
            "period_hours": hours,
            "coverage_by_zone": {k: dict(v) for k, v in coverage.items()},
            "zone_scores": zone_scores,
            "coverage_gaps": gaps[:20],  # Top 20 gaps
            "overall_score": overall_score
        }

    @staticmethod
    def get_efficiency_metrics(db: Session, hours: int = 24) -> List[Dict]:
        """Calculate efficiency metrics per staff member."""
        from models import TrackedPerson, PersonSighting, PersonAction, Staff

        cutoff = datetime.utcnow() - timedelta(hours=hours)

        # Get staff persons
        staff_persons = db.query(TrackedPerson).filter(
            or_(
                TrackedPerson.person_type == "staff",
                TrackedPerson.staff_id.isnot(None)
            ),
            TrackedPerson.first_seen >= cutoff
        ).all()

        metrics = []

        for person in staff_persons:
            # Get staff name
            staff_name = None
            if person.staff_id:
                staff = db.query(Staff).filter(Staff.id == person.staff_id).first()
                if staff:
                    staff_name = staff.name

            # Get actions with duration
            actions = db.query(PersonAction).filter(
                PersonAction.person_id == person.id,
                PersonAction.started_at >= cutoff,
                PersonAction.duration_seconds.isnot(None)
            ).all()

            if not actions:
                continue

            total_time = sum(a.duration_seconds for a in actions)
            if total_time == 0:
                continue

            # Active actions: walking, bending, reaching
            active_time = sum(
                a.duration_seconds for a in actions
                if a.action in ["walking", "bending", "reaching"]
            )

            # Idle actions: standing, sitting
            idle_time = sum(
                a.duration_seconds for a in actions
                if a.action in ["standing", "sitting"]
            )

            # Calculate activity rate
            activity_rate = (active_time / total_time * 100) if total_time > 0 else 0

            # Get zone transitions (mobility indicator)
            sightings = db.query(PersonSighting).filter(
                PersonSighting.person_id == person.id,
                PersonSighting.enter_time >= cutoff
            ).order_by(PersonSighting.enter_time).all()

            zone_changes = 0
            prev_zone = None
            for s in sightings:
                if prev_zone and s.zone_name != prev_zone:
                    zone_changes += 1
                prev_zone = s.zone_name

            # Mobility score: more zone transitions = more mobile (capped at 100)
            mobility_score = min(100, zone_changes * 10)

            # Efficiency score: 70% activity rate + 30% mobility
            efficiency_score = round((activity_rate * 0.7) + (mobility_score * 0.3), 1)

            metrics.append({
                "person_id": person.id,
                "display_id": person.display_id,
                "staff_name": staff_name or person.name,
                "staff_id": person.staff_id,
                "total_time_minutes": round(total_time / 60, 1),
                "active_time_minutes": round(active_time / 60, 1),
                "idle_time_minutes": round(idle_time / 60, 1),
                "activity_rate": round(activity_rate, 1),
                "zone_transitions": zone_changes,
                "mobility_score": mobility_score,
                "efficiency_score": efficiency_score
            })

        # Sort by efficiency score (highest first)
        metrics.sort(key=lambda x: x["efficiency_score"], reverse=True)
        return metrics

    @staticmethod
    def get_service_times(db: Session, hours: int = 24) -> Dict:
        """
        Estimate service times based on customer dwell time in service zones.
        Customer dwell time in service zones approximates wait + service time.
        """
        from models import TrackedPerson, PersonSighting

        cutoff = datetime.utcnow() - timedelta(hours=hours)

        # Service zones where customers interact with staff
        service_zones = ["cashier", "food_pickup", "seating", "bar_lounge"]

        # Get all sightings with person type info
        sightings_with_type = db.query(PersonSighting, TrackedPerson).join(
            TrackedPerson,
            PersonSighting.person_id == TrackedPerson.id
        ).filter(
            PersonSighting.enter_time >= cutoff
        ).all()

        # Separate by type
        customer_sightings = []
        staff_sightings = []

        for sighting, person in sightings_with_type:
            is_staff = person.person_type == "staff" or person.staff_id is not None
            if is_staff:
                staff_sightings.append(sighting)
            else:
                customer_sightings.append(sighting)

        zone_service_times = {}

        for zone in service_zones:
            zone_customers = [s for s in customer_sightings if s.zone_name == zone]
            zone_staff = [s for s in staff_sightings if s.zone_name == zone]

            if not zone_customers:
                zone_service_times[zone] = {
                    "avg_dwell_seconds": None,
                    "avg_dwell_minutes": None,
                    "sample_size": 0,
                    "staff_present_count": len(zone_staff)
                }
                continue

            # Calculate dwell times for customers in this zone
            dwell_times = []
            for s in zone_customers:
                if s.exit_time:
                    dwell = (s.exit_time - s.enter_time).total_seconds()
                    if dwell > 0:  # Ignore zero/negative durations
                        dwell_times.append(dwell)

            if dwell_times:
                avg_dwell = sum(dwell_times) / len(dwell_times)
                zone_service_times[zone] = {
                    "avg_dwell_seconds": round(avg_dwell, 1),
                    "avg_dwell_minutes": round(avg_dwell / 60, 1),
                    "sample_size": len(dwell_times),
                    "staff_present_count": len(zone_staff)
                }
            else:
                zone_service_times[zone] = {
                    "avg_dwell_seconds": None,
                    "avg_dwell_minutes": None,
                    "sample_size": 0,
                    "staff_present_count": len(zone_staff)
                }

        return {
            "period_hours": hours,
            "service_zones": zone_service_times
        }

    @staticmethod
    def get_shift_comparison(db: Session, days: int = 7) -> Dict:
        """Compare staff performance across different shifts/days."""
        from models import TrackedPerson, PersonSighting

        cutoff = datetime.utcnow() - timedelta(days=days)

        # Define shifts
        shifts = {
            "morning": (6, 12),    # 6am - 12pm
            "afternoon": (12, 18),  # 12pm - 6pm
            "evening": (18, 23),    # 6pm - 11pm
        }

        shift_data = defaultdict(lambda: {
            "total_staff_hours": 0.0,
            "zones_covered": set(),
            "days_tracked": set(),
            "sighting_count": 0
        })

        # Get all staff sightings
        staff_sightings = db.query(PersonSighting).join(TrackedPerson).filter(
            or_(
                TrackedPerson.person_type == "staff",
                TrackedPerson.staff_id.isnot(None)
            ),
            PersonSighting.enter_time >= cutoff
        ).all()

        for s in staff_sightings:
            hour = s.enter_time.hour
            day = s.enter_time.date()

            for shift_name, (start, end) in shifts.items():
                if start <= hour < end:
                    data = shift_data[shift_name]
                    if s.exit_time:
                        duration_hours = (s.exit_time - s.enter_time).total_seconds() / 3600
                        data["total_staff_hours"] += duration_hours
                    if s.zone_name:
                        data["zones_covered"].add(s.zone_name)
                    data["days_tracked"].add(day)
                    data["sighting_count"] += 1
                    break

        # Format result
        result = {"period_days": days, "shifts": {}}
        for shift_name, data in shift_data.items():
            days_count = len(data["days_tracked"]) or 1
            result["shifts"][shift_name] = {
                "total_staff_hours": round(data["total_staff_hours"], 1),
                "avg_hours_per_day": round(data["total_staff_hours"] / days_count, 1),
                "zones_covered": list(data["zones_covered"]),
                "coverage_count": len(data["zones_covered"]),
                "sighting_count": data["sighting_count"]
            }

        return result

    @staticmethod
    def get_realtime_staff_positions(db: Session) -> List[Dict]:
        """Get current positions of all active staff."""
        from models import TrackedPerson, PersonSighting, Staff

        # Consider staff active if seen in last 5 minutes
        cutoff = datetime.utcnow() - timedelta(minutes=5)

        active_staff = db.query(TrackedPerson).filter(
            or_(
                TrackedPerson.person_type == "staff",
                TrackedPerson.staff_id.isnot(None)
            ),
            TrackedPerson.last_seen >= cutoff
        ).all()

        positions = []
        for person in active_staff:
            # Get staff name
            staff_name = None
            if person.staff_id:
                staff = db.query(Staff).filter(Staff.id == person.staff_id).first()
                if staff:
                    staff_name = staff.name

            # Get latest sighting
            latest = db.query(PersonSighting).filter(
                PersonSighting.person_id == person.id
            ).order_by(PersonSighting.enter_time.desc()).first()

            # Get current action from ActionService
            current_action = None
            try:
                from services.action_service import ActionService
                action_data = ActionService._current_actions.get(person.id)
                if action_data:
                    current_action = action_data[0].value
            except Exception:
                pass

            positions.append({
                "person_id": person.id,
                "display_id": person.display_id,
                "staff_name": staff_name or person.name,
                "staff_id": person.staff_id,
                "current_zone": latest.zone_name if latest else None,
                "current_camera": latest.camera_id if latest else None,
                "current_action": current_action,
                "last_seen": person.last_seen.isoformat() if person.last_seen else None
            })

        return positions

    @staticmethod
    def get_staff_dashboard(db: Session) -> Dict:
        """Get complete staff analytics dashboard data in one call."""
        return {
            "summary": StaffAnalyticsService.get_staff_summary(db, 24),
            "coverage": StaffAnalyticsService.get_coverage_analysis(db, 8),
            "efficiency": StaffAnalyticsService.get_efficiency_metrics(db, 24)[:10],
            "positions": StaffAnalyticsService.get_realtime_staff_positions(db),
            "service_times": StaffAnalyticsService.get_service_times(db, 24)
        }
