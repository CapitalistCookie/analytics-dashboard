"""
Flow Optimization Service for bottleneck analysis and staffing recommendations.

Provides:
- Bottleneck detection: Zones where people get stuck
- Path analysis: Common routes vs optimal routes
- Traffic heatmap: Time-based zone activity
- Staffing recommendations: Where to position staff by hour
- Flow score: Overall efficiency metric
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional
from collections import defaultdict
import json
import os
import logging

from sqlalchemy.orm import Session
from sqlalchemy import func

from models import PersonSighting, TrackedPerson

logger = logging.getLogger(__name__)

# Flow connections file path (inside container)
FLOW_CONNECTIONS_FILE = "/app/data/flow_connections.json"

# Default flow connections if file doesn't exist
DEFAULT_FLOW_CONNECTIONS = [
    ["entrance", "bar_lounge"],
    ["entrance", "hallway"],
    ["bar_lounge", "cashier"],
    ["bar_lounge", "seating"],
    ["bar_lounge", "bar"],
    ["bar", "food_pickup"],
    ["food_pickup", "kitchen"],
    ["kitchen", "back_hallway"],
    ["kitchen", "storage"],
    ["back_hallway", "storage"],
    ["back_hallway", "office"],
    ["back_hallway", "hallway"],
    ["hallway", "seating"],
    ["hallway", "cashier"],
    ["seating", "cashier"],
    ["seating", "patio"],
    ["cashier", "vip_room"],
    ["vip_room", "karaoke"],
]


class FlowService:
    """Service for flow optimization and bottleneck analysis."""

    @staticmethod
    def get_flow_connections() -> List[List[str]]:
        """Load flow connections from JSON file."""
        try:
            if os.path.exists(FLOW_CONNECTIONS_FILE):
                with open(FLOW_CONNECTIONS_FILE) as f:
                    return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load flow connections: {e}")
        return DEFAULT_FLOW_CONNECTIONS

    @staticmethod
    def get_adjacency_map() -> Dict[str, List[str]]:
        """Convert flow connections to bidirectional adjacency map."""
        connections = FlowService.get_flow_connections()
        adjacency = defaultdict(set)
        for conn in connections:
            if len(conn) == 2:
                adjacency[conn[0]].add(conn[1])
                adjacency[conn[1]].add(conn[0])
        return {k: list(v) for k, v in adjacency.items()}

    @staticmethod
    def get_bottlenecks(db: Session, hours: int = 24) -> List[Dict]:
        """
        Identify bottleneck zones based on:
        - High average dwell time
        - High traffic volume
        - Low exit rate
        """
        cutoff = datetime.utcnow() - timedelta(hours=hours)

        # Get zone stats using SQLite-compatible date math
        zone_stats = db.query(
            PersonSighting.zone_name,
            func.count(PersonSighting.id).label('visits'),
            func.avg(
                (func.julianday(PersonSighting.exit_time) -
                 func.julianday(PersonSighting.enter_time)) * 24 * 60
            ).label('avg_dwell_minutes')
        ).filter(
            PersonSighting.enter_time >= cutoff,
            PersonSighting.exit_time.isnot(None),
            PersonSighting.zone_name.isnot(None)
        ).group_by(PersonSighting.zone_name).all()

        bottlenecks = []
        for zone, visits, avg_dwell_minutes in zone_stats:
            if avg_dwell_minutes is None or zone is None:
                continue

            # Calculate bottleneck score (higher = worse)
            # High dwell + high traffic = bottleneck
            score = (float(avg_dwell_minutes) * 0.6) + (visits * 0.01)

            bottlenecks.append({
                "zone": zone,
                "visits": visits,
                "avg_dwell_minutes": round(float(avg_dwell_minutes), 1),
                "bottleneck_score": round(score, 2),
                "severity": "high" if score > 10 else "medium" if score > 5 else "low",
            })

        # Sort by score descending
        bottlenecks.sort(key=lambda x: x["bottleneck_score"], reverse=True)
        return bottlenecks

    @staticmethod
    def get_transition_matrix(db: Session, hours: int = 24) -> Dict:
        """
        Build transition probability matrix from actual journey data.
        Returns P(next_zone | current_zone)
        """
        cutoff = datetime.utcnow() - timedelta(hours=hours)

        # Get all sightings ordered by person and time
        sightings = db.query(PersonSighting).filter(
            PersonSighting.enter_time >= cutoff,
            PersonSighting.zone_name.isnot(None)
        ).order_by(
            PersonSighting.person_id,
            PersonSighting.enter_time
        ).all()

        # Count transitions
        transitions = defaultdict(lambda: defaultdict(int))
        prev_sighting = {}

        for s in sightings:
            if s.person_id in prev_sighting:
                prev = prev_sighting[s.person_id]
                if prev.zone_name != s.zone_name:
                    transitions[prev.zone_name][s.zone_name] += 1
            prev_sighting[s.person_id] = s

        # Convert to probabilities
        matrix = {}
        for from_zone, to_zones in transitions.items():
            total = sum(to_zones.values())
            matrix[from_zone] = {
                to_zone: round(count / total, 3)
                for to_zone, count in sorted(to_zones.items(), key=lambda x: -x[1])
            }

        return {
            "matrix": matrix,
            "total_transitions": sum(sum(t.values()) for t in transitions.values()),
            "period_hours": hours,
        }

    @staticmethod
    def get_common_paths(db: Session, hours: int = 24, min_count: int = 2) -> List[Dict]:
        """
        Find most common journey paths through the restaurant.
        """
        cutoff = datetime.utcnow() - timedelta(hours=hours)

        # Get completed journeys
        persons = db.query(TrackedPerson).filter(
            TrackedPerson.first_seen >= cutoff
        ).all()

        path_counts = defaultdict(int)

        for person in persons:
            sightings = db.query(PersonSighting).filter(
                PersonSighting.person_id == person.id,
                PersonSighting.zone_name.isnot(None)
            ).order_by(PersonSighting.enter_time).all()

            if len(sightings) >= 2:
                # Deduplicate consecutive same zones
                zones = []
                for s in sightings:
                    if not zones or zones[-1] != s.zone_name:
                        zones.append(s.zone_name)

                if len(zones) >= 2:
                    path = " → ".join(zones)
                    path_counts[path] += 1

        # Filter and sort
        common_paths = [
            {"path": path, "count": count, "zones": path.split(" → ")}
            for path, count in path_counts.items()
            if count >= min_count
        ]
        common_paths.sort(key=lambda x: x["count"], reverse=True)

        return common_paths[:20]  # Top 20 paths

    @staticmethod
    def get_hourly_heatmap(db: Session, days: int = 7) -> Dict:
        """
        Generate zone activity heatmap by hour of day.
        """
        cutoff = datetime.utcnow() - timedelta(days=days)

        sightings = db.query(PersonSighting).filter(
            PersonSighting.enter_time >= cutoff,
            PersonSighting.zone_name.isnot(None)
        ).all()

        # Count by zone and hour
        heatmap = defaultdict(lambda: defaultdict(int))

        for s in sightings:
            hour = s.enter_time.hour
            heatmap[s.zone_name][hour] += 1

        # Convert to list format for frontend
        result = []
        for zone, hours_data in heatmap.items():
            for hour, count in hours_data.items():
                result.append({
                    "zone": zone,
                    "hour": hour,
                    "count": count,
                })

        return {
            "data": result,
            "zones": list(heatmap.keys()),
            "period_days": days,
        }

    @staticmethod
    def get_staffing_recommendations(db: Session, hours: int = 168) -> List[Dict]:
        """
        Generate staffing recommendations based on traffic patterns.
        Analyzes last week to suggest staff positioning by hour.
        """
        cutoff = datetime.utcnow() - timedelta(hours=hours)

        sightings = db.query(PersonSighting).filter(
            PersonSighting.enter_time >= cutoff,
            PersonSighting.zone_name.isnot(None)
        ).all()

        # Count by zone, day of week, and hour
        patterns = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))

        for s in sightings:
            dow = s.enter_time.weekday()  # 0=Mon, 6=Sun
            hour = s.enter_time.hour
            patterns[s.zone_name][dow][hour] += 1

        # Zone priorities for staffing
        zone_priorities = {
            "entrance": 3,
            "cashier": 3,
            "seating": 2,
            "bar_lounge": 2,
            "food_pickup": 2,
            "kitchen": 1,
            "bar": 1,
            "hallway": 1,
        }

        recommendations = []
        days_in_period = hours / 24

        for zone, dow_data in patterns.items():
            # Find peak hours for this zone
            total_by_hour = defaultdict(int)
            for dow, hours_data in dow_data.items():
                for hour, count in hours_data.items():
                    total_by_hour[hour] += count

            # Get top 3 peak hours
            peak_hours = sorted(total_by_hour.items(), key=lambda x: -x[1])[:3]

            if peak_hours:
                avg_traffic = sum(h[1] for h in peak_hours) / len(peak_hours)
                priority = zone_priorities.get(zone, 1)

                recommendations.append({
                    "zone": zone,
                    "peak_hours": [h[0] for h in peak_hours],
                    "avg_peak_traffic": round(avg_traffic / days_in_period, 1) if days_in_period > 0 else 0,
                    "priority": priority,
                    "recommendation": FlowService._get_staff_recommendation(zone, avg_traffic, priority),
                })

        recommendations.sort(key=lambda x: (-x["priority"], -x["avg_peak_traffic"]))
        return recommendations

    @staticmethod
    def _get_staff_recommendation(zone: str, avg_traffic: float, priority: int) -> str:
        """Generate human-readable staffing recommendation."""
        if priority >= 3 and avg_traffic > 50:
            return f"High priority: Ensure 2+ staff at {zone} during peak hours"
        elif priority >= 2 and avg_traffic > 30:
            return f"Medium priority: Position staff near {zone} during lunch/dinner"
        elif avg_traffic > 20:
            return f"Monitor {zone} during busy periods"
        else:
            return f"Standard coverage for {zone}"

    @staticmethod
    def get_flow_score(db: Session, hours: int = 24) -> Dict:
        """
        Calculate overall flow efficiency score (0-100).
        Based on:
        - Average dwell times vs expected
        - Transition smoothness
        - Bottleneck severity
        """
        bottlenecks = FlowService.get_bottlenecks(db, hours)

        if not bottlenecks:
            return {
                "score": 100,
                "grade": "A",
                "factors": {
                    "avg_bottleneck_score": 0,
                    "high_severity_zones": 0,
                    "total_zones_analyzed": 0,
                },
                "period_hours": hours,
            }

        # Calculate component scores
        avg_bottleneck = sum(b["bottleneck_score"] for b in bottlenecks) / len(bottlenecks)
        high_severity_count = sum(1 for b in bottlenecks if b["severity"] == "high")

        # Deduct points for issues
        score = 100
        score -= min(30, avg_bottleneck * 3)  # Bottleneck penalty
        score -= high_severity_count * 10      # Severe bottleneck penalty
        score = max(0, score)

        # Grade
        if score >= 90:
            grade = "A"
        elif score >= 80:
            grade = "B"
        elif score >= 70:
            grade = "C"
        elif score >= 60:
            grade = "D"
        else:
            grade = "F"

        return {
            "score": round(score),
            "grade": grade,
            "factors": {
                "avg_bottleneck_score": round(avg_bottleneck, 2),
                "high_severity_zones": high_severity_count,
                "total_zones_analyzed": len(bottlenecks),
            },
            "period_hours": hours,
        }

    @staticmethod
    def get_flow_summary(db: Session) -> Dict:
        """Get complete flow analysis summary."""
        return {
            "score": FlowService.get_flow_score(db, 24),
            "bottlenecks": FlowService.get_bottlenecks(db, 24)[:5],
            "top_paths": FlowService.get_common_paths(db, 24)[:5],
            "staffing": FlowService.get_staffing_recommendations(db, 168)[:5],
        }
