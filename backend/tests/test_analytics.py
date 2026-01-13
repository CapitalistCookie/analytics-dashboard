"""Tests for analytics endpoints."""

import pytest


class TestAnalyticsSummary:
    """Test analytics summary endpoint."""

    def test_get_summary_today(self, client):
        """Test getting summary for today."""
        response = client.get("/api/analytics/summary?range=today")
        assert response.status_code == 200
        data = response.json()

        # Check expected fields (API returns table_turnover_rate not turnover_rate)
        assert "total_customers" in data
        assert "avg_wait_time" in data
        assert "table_turnover_rate" in data
        assert "staff_efficiency" in data
        assert "busiest_hour" in data
        assert "peak_occupancy" in data

    def test_get_summary_week(self, client):
        """Test getting summary for this week."""
        response = client.get("/api/analytics/summary?range=week")
        assert response.status_code == 200
        assert "total_customers" in response.json()

    def test_get_summary_month(self, client):
        """Test getting summary for this month."""
        response = client.get("/api/analytics/summary?range=month")
        assert response.status_code == 200
        assert "total_customers" in response.json()


class TestHourlyCounts:
    """Test hourly counts endpoint."""

    def test_get_hourly_counts(self, client):
        """Test getting hourly customer/staff counts."""
        response = client.get("/api/analytics/hourly-counts")
        assert response.status_code == 200
        data = response.json()

        # API returns array directly, not wrapped in "hours" key
        assert isinstance(data, list)

        if len(data) > 0:
            hour = data[0]
            assert "hour" in hour
            assert "customers" in hour
            assert "staff" in hour


class TestZoneActivity:
    """Test zone activity endpoint."""

    def test_get_zone_activity(self, client):
        """Test getting zone activity data."""
        response = client.get("/api/analytics/zone-activity")
        assert response.status_code == 200
        data = response.json()

        # API returns array directly with "zone" and "activity" keys
        assert isinstance(data, list)

        if len(data) > 0:
            zone = data[0]
            assert "zone" in zone
            assert "activity" in zone


class TestStaffPerformance:
    """Test staff performance endpoint."""

    def test_get_staff_performance(self, client):
        """Test getting staff performance data."""
        response = client.get("/api/analytics/staff-performance")
        assert response.status_code == 200
        data = response.json()

        # API returns array directly
        assert isinstance(data, list)

        if len(data) > 0:
            staff = data[0]
            assert "name" in staff
            assert "floor_time" in staff
            assert "idle_time" in staff


class TestWaitTimes:
    """Test wait times endpoint."""

    def test_get_wait_times(self, client):
        """Test getting wait time trends."""
        response = client.get("/api/analytics/wait-times")
        assert response.status_code == 200
        data = response.json()

        # API returns array with "time" and "wait_minutes" keys
        assert isinstance(data, list)

        if len(data) > 0:
            hour = data[0]
            assert "time" in hour
            assert "wait_minutes" in hour


class TestTableTurnover:
    """Test table turnover endpoint."""

    def test_get_table_turnover(self, client):
        """Test getting table turnover data."""
        response = client.get("/api/analytics/table-turnover")
        assert response.status_code == 200
        data = response.json()

        # API returns array with turnovers not turnover_rate
        assert isinstance(data, list)

        if len(data) > 0:
            table = data[0]
            assert "table_id" in table
            assert "turnovers" in table


class TestCustomerStaffBreakdown:
    """Test customer/staff breakdown endpoint."""

    def test_get_breakdown(self, client):
        """Test getting customer vs staff breakdown."""
        response = client.get("/api/analytics/customer-staff-breakdown")
        assert response.status_code == 200
        data = response.json()

        # API returns array with label/value pairs
        assert isinstance(data, list)
        assert len(data) == 2
        labels = [item["label"] for item in data]
        assert "Customers" in labels
        assert "Staff" in labels


class TestLiveOccupancy:
    """Test live occupancy endpoint."""

    def test_get_live_occupancy(self, client):
        """Test getting live occupancy data."""
        response = client.get("/api/analytics/occupancy/live")
        assert response.status_code == 200
        data = response.json()

        # API returns "total" not "count"
        assert "total" in data
        assert "timestamp" in data


class TestDateRangeFiltering:
    """Test date range filtering across analytics."""

    def test_range_today(self, client):
        """Test filtering with today range."""
        response = client.get("/api/analytics/hourly-counts?range=today")
        assert response.status_code == 200

    def test_range_week(self, client):
        """Test filtering with week range."""
        response = client.get("/api/analytics/hourly-counts?range=week")
        assert response.status_code == 200

    def test_range_month(self, client):
        """Test filtering with month range."""
        response = client.get("/api/analytics/hourly-counts?range=month")
        assert response.status_code == 200

    def test_valid_ranges_work(self, client):
        """Test that valid ranges work correctly."""
        for range_val in ["today", "week", "month"]:
            response = client.get(f"/api/analytics/summary?range={range_val}")
            assert response.status_code == 200


class TestDwellTimeEndpoints:
    """Test dwell time analytics endpoints."""

    def test_get_dwell_by_zone(self, client):
        """Test getting average dwell times by zone."""
        response = client.get("/api/analytics/dwell/by-zone")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

        if len(data) > 0:
            zone = data[0]
            assert "zone" in zone
            assert "avg_dwell_seconds" in zone
            assert "avg_dwell_minutes" in zone

    def test_get_dwell_by_zone_with_date(self, client):
        """Test getting dwell times with date filter."""
        response = client.get("/api/analytics/dwell/by-zone?date=2024-01-01")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_get_dwell_by_zone_with_days(self, client):
        """Test getting dwell times with days parameter."""
        response = client.get("/api/analytics/dwell/by-zone?days=7")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_get_average_dwell(self, client):
        """Test getting overall average dwell time."""
        response = client.get("/api/analytics/dwell/average")
        assert response.status_code == 200
        data = response.json()

        assert "avg_seconds" in data
        assert "avg_minutes" in data
        assert "total_events" in data
        assert isinstance(data["avg_seconds"], (int, float))
        assert isinstance(data["avg_minutes"], (int, float))
        assert isinstance(data["total_events"], int)

    def test_get_dwell_distribution(self, client):
        """Test getting dwell time distribution buckets."""
        response = client.get("/api/analytics/dwell/distribution")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

        if len(data) > 0:
            bucket = data[0]
            assert "bucket" in bucket
            assert "count" in bucket
            assert "percentage" in bucket

    def test_get_visit_duration_stats(self, client):
        """Test getting visit duration statistics."""
        response = client.get("/api/analytics/dwell/visit-stats")
        assert response.status_code == 200
        data = response.json()

        assert "avg_visit_minutes" in data
        assert "min_visit_minutes" in data
        assert "max_visit_minutes" in data
        assert "total_visits" in data

    def test_get_hourly_dwell_trend(self, client):
        """Test getting hourly dwell time trend."""
        response = client.get("/api/analytics/dwell/hourly-trend")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

        # Should have 24 hours
        assert len(data) == 24

        if len(data) > 0:
            hour_data = data[0]
            assert "hour" in hour_data
            assert "avg_dwell_minutes" in hour_data
            assert "count" in hour_data

    def test_get_dwell_summary(self, client):
        """Test getting comprehensive dwell time summary."""
        response = client.get("/api/analytics/dwell/summary")
        assert response.status_code == 200
        data = response.json()

        assert "avg_dwell_seconds" in data
        assert "avg_dwell_minutes" in data
        assert "total_sightings" in data
        assert "avg_visit_minutes" in data
        assert "total_visits" in data
        assert "longest_dwell_zone" in data
        assert "busiest_zone" in data
        assert "zones" in data
        assert isinstance(data["zones"], list)
