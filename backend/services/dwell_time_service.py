"""Dwell Time Service - Calculate dwell time statistics from PersonSighting data."""

from datetime import datetime, timedelta
from typing import Optional
import logging
from collections import defaultdict

from sqlalchemy import func, and_, or_
from sqlalchemy.orm import Session

from models import PersonSighting, TrackedPerson

logger = logging.getLogger(__name__)


class DwellTimeService:
    """Service for calculating dwell time analytics from SQLite PersonSighting data."""

    @staticmethod
    def _calculate_dwell_seconds(enter_time: datetime, exit_time: Optional[datetime]) -> int:
        """Calculate dwell time in seconds."""
        if exit_time:
            return int((exit_time - enter_time).total_seconds())
        else:
            # Still in venue, calculate from now
            return int((datetime.utcnow() - enter_time).total_seconds())

    @classmethod
    def get_average_dwell_time(
        cls,
        db: Session,
        date: Optional[str] = None,
        days: int = 1,
        zone: Optional[str] = None,
        completed_only: bool = True
    ) -> dict:
        """Get average dwell time across all sightings.

        Args:
            db: Database session
            date: Optional specific date (YYYY-MM-DD)
            days: Number of days to query if date not specified
            zone: Optional zone filter
            completed_only: Only include sightings with exit_time

        Returns:
            Dict with avg_seconds, avg_minutes, total_events
        """
        try:
            # Build date filter
            if date:
                target_date = datetime.strptime(date, "%Y-%m-%d")
                start_time = target_date
                end_time = target_date + timedelta(days=1)
            else:
                end_time = datetime.utcnow()
                start_time = end_time - timedelta(days=days)

            # Build query
            query = db.query(PersonSighting).filter(
                PersonSighting.enter_time >= start_time,
                PersonSighting.enter_time < end_time
            )

            if zone:
                query = query.filter(PersonSighting.zone_name == zone)

            if completed_only:
                query = query.filter(PersonSighting.exit_time.isnot(None))

            sightings = query.all()

            if not sightings:
                return {
                    "avg_seconds": 0,
                    "avg_minutes": 0,
                    "total_events": 0
                }

            # Calculate dwell times
            dwell_times = [
                cls._calculate_dwell_seconds(s.enter_time, s.exit_time)
                for s in sightings
            ]

            avg_seconds = sum(dwell_times) / len(dwell_times)

            return {
                "avg_seconds": round(avg_seconds, 1),
                "avg_minutes": round(avg_seconds / 60, 1),
                "total_events": len(dwell_times)
            }

        except Exception as e:
            logger.error(f"Error calculating average dwell time: {e}")
            return {"avg_seconds": 0, "avg_minutes": 0, "total_events": 0}

    @classmethod
    def get_dwell_by_zone(
        cls,
        db: Session,
        date: Optional[str] = None,
        days: int = 1,
        completed_only: bool = True
    ) -> list[dict]:
        """Get average dwell times grouped by zone.

        Returns:
            List of {zone, avg_dwell_seconds, avg_dwell_minutes, count} dicts
        """
        try:
            # Build date filter
            if date:
                target_date = datetime.strptime(date, "%Y-%m-%d")
                start_time = target_date
                end_time = target_date + timedelta(days=1)
            else:
                end_time = datetime.utcnow()
                start_time = end_time - timedelta(days=days)

            # Build query
            query = db.query(PersonSighting).filter(
                PersonSighting.enter_time >= start_time,
                PersonSighting.enter_time < end_time,
                PersonSighting.zone_name.isnot(None)
            )

            if completed_only:
                query = query.filter(PersonSighting.exit_time.isnot(None))

            sightings = query.all()

            # Group by zone
            zone_dwell = defaultdict(list)
            for s in sightings:
                dwell = cls._calculate_dwell_seconds(s.enter_time, s.exit_time)
                zone_dwell[s.zone_name].append(dwell)

            # Calculate averages
            results = []
            for zone, dwells in zone_dwell.items():
                avg_seconds = sum(dwells) / len(dwells)
                results.append({
                    "zone": zone,
                    "avg_dwell_seconds": round(avg_seconds, 1),
                    "avg_dwell_minutes": round(avg_seconds / 60, 1),
                    "count": len(dwells)
                })

            # Sort by dwell time descending
            results.sort(key=lambda x: x["avg_dwell_seconds"], reverse=True)

            return results

        except Exception as e:
            logger.error(f"Error calculating dwell by zone: {e}")
            return []

    @classmethod
    def get_dwell_distribution(
        cls,
        db: Session,
        date: Optional[str] = None,
        days: int = 1,
        completed_only: bool = True
    ) -> list[dict]:
        """Get dwell time distribution in buckets.

        Returns:
            List of {bucket, count, percentage} dicts
        """
        try:
            # Build date filter
            if date:
                target_date = datetime.strptime(date, "%Y-%m-%d")
                start_time = target_date
                end_time = target_date + timedelta(days=1)
            else:
                end_time = datetime.utcnow()
                start_time = end_time - timedelta(days=days)

            # Build query
            query = db.query(PersonSighting).filter(
                PersonSighting.enter_time >= start_time,
                PersonSighting.enter_time < end_time
            )

            if completed_only:
                query = query.filter(PersonSighting.exit_time.isnot(None))

            sightings = query.all()

            # Define buckets (in seconds)
            buckets = {
                "0-30s": {"min": 0, "max": 30, "count": 0},
                "30s-2min": {"min": 30, "max": 120, "count": 0},
                "2-5min": {"min": 120, "max": 300, "count": 0},
                "5-15min": {"min": 300, "max": 900, "count": 0},
                "15-30min": {"min": 900, "max": 1800, "count": 0},
                "30+min": {"min": 1800, "max": float('inf'), "count": 0},
            }

            # Bucket the dwell times
            total = 0
            for s in sightings:
                dwell = cls._calculate_dwell_seconds(s.enter_time, s.exit_time)
                total += 1

                for bucket_data in buckets.values():
                    if bucket_data["min"] <= dwell < bucket_data["max"]:
                        bucket_data["count"] += 1
                        break

            # Convert to list with percentages
            distribution = []
            for bucket_name, bucket_data in buckets.items():
                distribution.append({
                    "bucket": bucket_name,
                    "count": bucket_data["count"],
                    "percentage": round((bucket_data["count"] / total * 100) if total > 0 else 0, 1)
                })

            return distribution

        except Exception as e:
            logger.error(f"Error calculating dwell distribution: {e}")
            return []

    @classmethod
    def get_visit_duration_stats(
        cls,
        db: Session,
        date: Optional[str] = None,
        days: int = 1
    ) -> dict:
        """Get visit duration statistics (total time in venue per person).

        Returns:
            Dict with avg_visit_minutes, min_visit_minutes, max_visit_minutes, total_visits
        """
        try:
            # Build date filter
            if date:
                target_date = datetime.strptime(date, "%Y-%m-%d")
                start_time = target_date
                end_time = target_date + timedelta(days=1)
            else:
                end_time = datetime.utcnow()
                start_time = end_time - timedelta(days=days)

            # Get tracked persons with sightings in the time range
            persons = db.query(TrackedPerson).filter(
                TrackedPerson.first_seen >= start_time,
                TrackedPerson.first_seen < end_time
            ).all()

            if not persons:
                return {
                    "avg_visit_minutes": 0,
                    "min_visit_minutes": 0,
                    "max_visit_minutes": 0,
                    "total_visits": 0
                }

            # Calculate visit durations
            visit_durations = []
            for p in persons:
                if p.last_seen and p.first_seen:
                    duration = (p.last_seen - p.first_seen).total_seconds() / 60
                    visit_durations.append(duration)

            if not visit_durations:
                return {
                    "avg_visit_minutes": 0,
                    "min_visit_minutes": 0,
                    "max_visit_minutes": 0,
                    "total_visits": 0
                }

            return {
                "avg_visit_minutes": round(sum(visit_durations) / len(visit_durations), 1),
                "min_visit_minutes": round(min(visit_durations), 1),
                "max_visit_minutes": round(max(visit_durations), 1),
                "total_visits": len(visit_durations)
            }

        except Exception as e:
            logger.error(f"Error calculating visit duration stats: {e}")
            return {
                "avg_visit_minutes": 0,
                "min_visit_minutes": 0,
                "max_visit_minutes": 0,
                "total_visits": 0
            }

    @classmethod
    def get_hourly_dwell_trend(
        cls,
        db: Session,
        date: Optional[str] = None
    ) -> list[dict]:
        """Get average dwell time by hour of day.

        Returns:
            List of {hour, avg_dwell_minutes, count} dicts for each hour
        """
        try:
            # Determine date
            if date:
                target_date = datetime.strptime(date, "%Y-%m-%d")
            else:
                target_date = datetime.utcnow().date()
                target_date = datetime.combine(target_date, datetime.min.time())

            start_time = target_date
            end_time = target_date + timedelta(days=1)

            # Query sightings for the day
            sightings = db.query(PersonSighting).filter(
                PersonSighting.enter_time >= start_time,
                PersonSighting.enter_time < end_time,
                PersonSighting.exit_time.isnot(None)
            ).all()

            # Group by hour
            hourly_data = {h: [] for h in range(24)}
            for s in sightings:
                hour = s.enter_time.hour
                dwell = cls._calculate_dwell_seconds(s.enter_time, s.exit_time)
                hourly_data[hour].append(dwell)

            # Calculate averages
            results = []
            for hour in range(24):
                dwells = hourly_data[hour]
                avg_seconds = sum(dwells) / len(dwells) if dwells else 0
                results.append({
                    "hour": f"{hour:02d}:00",
                    "avg_dwell_minutes": round(avg_seconds / 60, 1),
                    "count": len(dwells)
                })

            return results

        except Exception as e:
            logger.error(f"Error calculating hourly dwell trend: {e}")
            return [{"hour": f"{h:02d}:00", "avg_dwell_minutes": 0, "count": 0} for h in range(24)]

    @classmethod
    def get_dwell_summary(
        cls,
        db: Session,
        date: Optional[str] = None,
        days: int = 1
    ) -> dict:
        """Get comprehensive dwell time summary.

        Returns:
            Dict with all dwell time metrics
        """
        avg_dwell = cls.get_average_dwell_time(db, date, days)
        visit_stats = cls.get_visit_duration_stats(db, date, days)
        zone_stats = cls.get_dwell_by_zone(db, date, days)

        # Find busiest zone by dwell count
        busiest_zone = zone_stats[0]["zone"] if zone_stats else "N/A"
        longest_dwell_zone = zone_stats[0]["zone"] if zone_stats else "N/A"

        return {
            "avg_dwell_seconds": avg_dwell["avg_seconds"],
            "avg_dwell_minutes": avg_dwell["avg_minutes"],
            "total_sightings": avg_dwell["total_events"],
            "avg_visit_minutes": visit_stats["avg_visit_minutes"],
            "total_visits": visit_stats["total_visits"],
            "longest_dwell_zone": longest_dwell_zone,
            "busiest_zone": busiest_zone,
            "zones": zone_stats
        }
