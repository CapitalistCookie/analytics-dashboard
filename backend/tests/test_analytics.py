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
