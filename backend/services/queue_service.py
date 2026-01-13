"""
Queue Detection Service - Track wait times at queue zones.

Monitors entrance zone for people waiting to be seated.
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional
from dataclasses import dataclass
from sqlalchemy.orm import Session

from models import PersonSighting, TrackedPerson


@dataclass
class QueuePerson:
    """Person currently in a queue zone."""
    person_id: int
    display_id: str
    enter_time: datetime
    wait_seconds: int


@dataclass
class QueueStatus:
    """Current status of a queue zone."""
    zone: str
    queue_length: int
    people: List[QueuePerson]
    avg_wait_seconds: float
    max_wait_seconds: int
    updated_at: datetime


# Queue zones - only entrance for now (cashier excluded per user request)
QUEUE_ZONES = {"entrance"}

# Alert thresholds
QUEUE_LENGTH_WARNING = 3  # Alert when queue > 3 people
QUEUE_LENGTH_CRITICAL = 5  # Critical when queue > 5 people
WAIT_TIME_WARNING = 120  # Alert when wait > 2 minutes
WAIT_TIME_CRITICAL = 300  # Critical when wait > 5 minutes


class QueueService:
    """Service for queue detection and wait time tracking."""

    def __init__(self, db: Session):
        self.db = db

    def get_queue_status(self, zone: str = "entrance") -> Optional[QueueStatus]:
        """
        Get current queue status for a zone.

        Returns people currently in the zone (entered but not exited).
        """
        if zone not in QUEUE_ZONES:
            return None

        now = datetime.utcnow()

        # Find active sightings in this zone (no exit_time means still there)
        # Only look at recent sightings (last 30 minutes) to avoid stale data
        cutoff = now - timedelta(minutes=30)

        active_sightings = self.db.query(PersonSighting).join(
            TrackedPerson, PersonSighting.person_id == TrackedPerson.id
        ).filter(
            PersonSighting.zone_name == zone,
            PersonSighting.exit_time.is_(None),
            PersonSighting.enter_time >= cutoff,
            TrackedPerson.is_active == True
        ).all()

        people = []
        total_wait = 0
        max_wait = 0

        for sighting in active_sightings:
            person = self.db.query(TrackedPerson).filter(
                TrackedPerson.id == sighting.person_id
            ).first()

            if person:
                wait_seconds = int((now - sighting.enter_time).total_seconds())
                total_wait += wait_seconds
                max_wait = max(max_wait, wait_seconds)

                people.append(QueuePerson(
                    person_id=person.id,
                    display_id=person.display_id,
                    enter_time=sighting.enter_time,
                    wait_seconds=wait_seconds
                ))

        # Sort by wait time (longest first)
        people.sort(key=lambda p: p.wait_seconds, reverse=True)

        avg_wait = total_wait / len(people) if people else 0

        return QueueStatus(
            zone=zone,
            queue_length=len(people),
            people=people,
            avg_wait_seconds=avg_wait,
            max_wait_seconds=max_wait,
            updated_at=now
        )

    def get_all_queues(self) -> Dict[str, QueueStatus]:
        """Get status for all queue zones."""
        result = {}
        for zone in QUEUE_ZONES:
            status = self.get_queue_status(zone)
            if status:
                result[zone] = status
        return result

    def get_queue_history(
        self,
        zone: str = "entrance",
        hours: int = 24
    ) -> List[Dict]:
        """
        Get historical queue data for analytics.

        Returns hourly averages for queue length and wait times.
        """
        now = datetime.utcnow()
        start_time = now - timedelta(hours=hours)

        # Get all sightings in this zone during the period
        sightings = self.db.query(PersonSighting).filter(
            PersonSighting.zone_name == zone,
            PersonSighting.enter_time >= start_time
        ).all()

        # Group by hour
        hourly_data = {}

        for sighting in sightings:
            hour_key = sighting.enter_time.replace(minute=0, second=0, microsecond=0)

            if hour_key not in hourly_data:
                hourly_data[hour_key] = {
                    "hour": hour_key,
                    "count": 0,
                    "total_wait": 0,
                    "completed": 0
                }

            hourly_data[hour_key]["count"] += 1

            if sighting.exit_time:
                wait = (sighting.exit_time - sighting.enter_time).total_seconds()
                hourly_data[hour_key]["total_wait"] += wait
                hourly_data[hour_key]["completed"] += 1

        # Calculate averages
        result = []
        for hour_key in sorted(hourly_data.keys()):
            data = hourly_data[hour_key]
            avg_wait = data["total_wait"] / data["completed"] if data["completed"] > 0 else 0

            result.append({
                "hour": data["hour"].isoformat(),
                "queue_count": data["count"],
                "avg_wait_seconds": round(avg_wait, 1),
                "completed_visits": data["completed"]
            })

        return result

    def get_queue_alerts(self) -> List[Dict]:
        """
        Check queue zones and return any active alerts.
        """
        alerts = []

        for zone in QUEUE_ZONES:
            status = self.get_queue_status(zone)
            if not status:
                continue

            # Check queue length
            if status.queue_length >= QUEUE_LENGTH_CRITICAL:
                alerts.append({
                    "zone": zone,
                    "type": "queue_length",
                    "severity": "critical",
                    "message": f"Queue at {zone}: {status.queue_length} people waiting",
                    "value": status.queue_length,
                    "threshold": QUEUE_LENGTH_CRITICAL
                })
            elif status.queue_length >= QUEUE_LENGTH_WARNING:
                alerts.append({
                    "zone": zone,
                    "type": "queue_length",
                    "severity": "warning",
                    "message": f"Queue building at {zone}: {status.queue_length} people",
                    "value": status.queue_length,
                    "threshold": QUEUE_LENGTH_WARNING
                })

            # Check wait times
            if status.max_wait_seconds >= WAIT_TIME_CRITICAL:
                alerts.append({
                    "zone": zone,
                    "type": "wait_time",
                    "severity": "critical",
                    "message": f"Long wait at {zone}: {status.max_wait_seconds // 60}m {status.max_wait_seconds % 60}s",
                    "value": status.max_wait_seconds,
                    "threshold": WAIT_TIME_CRITICAL
                })
            elif status.max_wait_seconds >= WAIT_TIME_WARNING:
                alerts.append({
                    "zone": zone,
                    "type": "wait_time",
                    "severity": "warning",
                    "message": f"Wait time increasing at {zone}: {status.max_wait_seconds // 60}m",
                    "value": status.max_wait_seconds,
                    "threshold": WAIT_TIME_WARNING
                })

        return alerts


def format_wait_time(seconds: int) -> str:
    """Format seconds as human-readable wait time."""
    if seconds < 60:
        return f"{seconds}s"
    minutes = seconds // 60
    secs = seconds % 60
    if minutes < 60:
        return f"{minutes}m {secs}s"
    hours = minutes // 60
    mins = minutes % 60
    return f"{hours}h {mins}m"
