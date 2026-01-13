"""Unit tests for DwellTimeService."""

import pytest
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

from services.dwell_time_service import DwellTimeService


class TestDwellTimeCalculation:
    """Test dwell time calculation helper."""

    def test_calculate_dwell_with_exit_time(self):
        """Test dwell calculation when exit time is provided."""
        enter = datetime(2024, 1, 1, 10, 0, 0)
        exit_time = datetime(2024, 1, 1, 10, 5, 30)
        dwell = DwellTimeService._calculate_dwell_seconds(enter, exit_time)
        assert dwell == 330  # 5 minutes 30 seconds

    def test_calculate_dwell_without_exit_time(self):
        """Test dwell calculation when still in venue."""
        enter = datetime.utcnow() - timedelta(minutes=10)
        dwell = DwellTimeService._calculate_dwell_seconds(enter, None)
        # Should be approximately 600 seconds (10 minutes)
        assert 595 <= dwell <= 605


class TestGetAverageDwellTime:
    """Test get_average_dwell_time method."""

    def test_returns_zeros_when_no_data(self, db_session):
        """Test returns zeros when no sightings exist."""
        result = DwellTimeService.get_average_dwell_time(db_session)
        assert result["avg_seconds"] == 0
        assert result["avg_minutes"] == 0
        assert result["total_events"] == 0

    def test_calculates_average_correctly(self, db_session, create_test_sightings):
        """Test average calculation with test data."""
        # Create sightings with known dwell times
        sightings = create_test_sightings(
            count=3,
            dwell_seconds=[60, 120, 180]  # 1, 2, 3 minutes
        )

        result = DwellTimeService.get_average_dwell_time(db_session)
        assert result["total_events"] == 3
        assert result["avg_seconds"] == 120  # Average of 60, 120, 180
        assert result["avg_minutes"] == 2.0

    def test_respects_date_filter(self, db_session, create_test_sightings):
        """Test date filtering works correctly."""
        # Create sightings for different dates
        today = datetime.utcnow().strftime("%Y-%m-%d")
        yesterday = (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%d")

        result_today = DwellTimeService.get_average_dwell_time(db_session, date=today)
        result_yesterday = DwellTimeService.get_average_dwell_time(db_session, date=yesterday)

        # Both should return valid responses
        assert "avg_seconds" in result_today
        assert "avg_seconds" in result_yesterday


class TestGetDwellByZone:
    """Test get_dwell_by_zone method."""

    def test_returns_empty_list_when_no_data(self, db_session):
        """Test returns empty list when no sightings exist."""
        result = DwellTimeService.get_dwell_by_zone(db_session)
        assert result == []

    def test_groups_by_zone(self, db_session, create_test_sightings_by_zone):
        """Test zones are grouped correctly."""
        # Create sightings in different zones
        create_test_sightings_by_zone(
            zones=["entrance", "seating_main", "cashier"],
            dwell_seconds=[60, 300, 30]
        )

        result = DwellTimeService.get_dwell_by_zone(db_session)
        assert len(result) == 3

        # Results should be sorted by dwell time descending
        zones = [r["zone"] for r in result]
        assert zones[0] == "seating_main"  # Highest dwell time


class TestGetDwellDistribution:
    """Test get_dwell_distribution method."""

    def test_returns_all_buckets(self, db_session):
        """Test all time buckets are returned."""
        result = DwellTimeService.get_dwell_distribution(db_session)
        assert len(result) == 6
        buckets = [r["bucket"] for r in result]
        assert "0-30s" in buckets
        assert "30s-2min" in buckets
        assert "2-5min" in buckets
        assert "5-15min" in buckets
        assert "15-30min" in buckets
        assert "30+min" in buckets

    def test_buckets_dwell_times_correctly(self, db_session, create_test_sightings):
        """Test dwell times are bucketed correctly."""
        # Create sightings with specific dwell times
        create_test_sightings(
            count=5,
            dwell_seconds=[10, 60, 200, 600, 2000]  # Various buckets
        )

        result = DwellTimeService.get_dwell_distribution(db_session)
        bucket_map = {r["bucket"]: r["count"] for r in result}

        assert bucket_map["0-30s"] == 1
        assert bucket_map["30s-2min"] == 1
        assert bucket_map["2-5min"] == 1
        assert bucket_map["5-15min"] == 1
        assert bucket_map["30+min"] == 1


class TestGetVisitDurationStats:
    """Test get_visit_duration_stats method."""

    def test_returns_zeros_when_no_data(self, db_session):
        """Test returns zeros when no persons exist."""
        result = DwellTimeService.get_visit_duration_stats(db_session)
        assert result["avg_visit_minutes"] == 0
        assert result["min_visit_minutes"] == 0
        assert result["max_visit_minutes"] == 0
        assert result["total_visits"] == 0


class TestGetHourlyDwellTrend:
    """Test get_hourly_dwell_trend method."""

    def test_returns_24_hours(self, db_session):
        """Test returns data for all 24 hours."""
        result = DwellTimeService.get_hourly_dwell_trend(db_session)
        assert len(result) == 24

        hours = [r["hour"] for r in result]
        assert "00:00" in hours
        assert "12:00" in hours
        assert "23:00" in hours


class TestGetDwellSummary:
    """Test get_dwell_summary method."""

    def test_returns_all_summary_fields(self, db_session):
        """Test returns all expected summary fields."""
        result = DwellTimeService.get_dwell_summary(db_session)

        assert "avg_dwell_seconds" in result
        assert "avg_dwell_minutes" in result
        assert "total_sightings" in result
        assert "avg_visit_minutes" in result
        assert "total_visits" in result
        assert "longest_dwell_zone" in result
        assert "busiest_zone" in result
        assert "zones" in result


# Pytest fixtures for dwell time tests
@pytest.fixture
def create_test_sightings(db_session):
    """Fixture to create test PersonSighting records."""
    def _create(count: int, dwell_seconds: list = None):
        from models import TrackedPerson, PersonSighting

        # Create a test person
        person = TrackedPerson(
            display_id="T1",
            first_seen=datetime.utcnow(),
            last_seen=datetime.utcnow()
        )
        db_session.add(person)
        db_session.flush()

        sightings = []
        for i in range(count):
            dwell = dwell_seconds[i] if dwell_seconds and i < len(dwell_seconds) else 60
            enter_time = datetime.utcnow() - timedelta(seconds=dwell)
            exit_time = datetime.utcnow()

            sighting = PersonSighting(
                person_id=person.id,
                camera_id=f"test_cam_{i}",
                zone_name="test_zone",
                enter_time=enter_time,
                exit_time=exit_time
            )
            db_session.add(sighting)
            sightings.append(sighting)

        db_session.commit()
        return sightings

    return _create


@pytest.fixture
def create_test_sightings_by_zone(db_session):
    """Fixture to create test sightings in specific zones."""
    def _create(zones: list, dwell_seconds: list):
        from models import TrackedPerson, PersonSighting

        # Create a test person
        person = TrackedPerson(
            display_id="T2",
            first_seen=datetime.utcnow(),
            last_seen=datetime.utcnow()
        )
        db_session.add(person)
        db_session.flush()

        sightings = []
        for i, (zone, dwell) in enumerate(zip(zones, dwell_seconds)):
            enter_time = datetime.utcnow() - timedelta(seconds=dwell)
            exit_time = datetime.utcnow()

            sighting = PersonSighting(
                person_id=person.id,
                camera_id=f"test_cam_{i}",
                zone_name=zone,
                enter_time=enter_time,
                exit_time=exit_time
            )
            db_session.add(sighting)
            sightings.append(sighting)

        db_session.commit()
        return sightings

    return _create
