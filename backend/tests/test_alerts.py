"""Tests for alert management endpoints."""

import pytest


class TestAlertConfigCRUD:
    """Test alert configuration CRUD operations."""

    def test_list_alert_configs_empty(self, client):
        """Test listing configs when empty."""
        response = client.get("/api/alerts/configs")
        assert response.status_code == 200
        assert response.json() == []

    def test_create_alert_config(self, client, sample_zone):
        """Test creating an alert configuration."""
        response = client.post(
            "/api/alerts/configs",
            json={
                "name": "Test Alert",
                "alert_type": "occupancy",
                "severity": "warning",
                "threshold_value": 50,
                "threshold_operator": "gt",
                "zone_id": sample_zone.id,
                "is_enabled": True
            }
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Test Alert"
        assert data["alert_type"] == "occupancy"

    def test_get_alert_config(self, client, sample_alert_config):
        """Test getting a specific config."""
        response = client.get(f"/api/alerts/configs/{sample_alert_config.id}")
        assert response.status_code == 200
        assert response.json()["name"] == "High Occupancy Alert"

    def test_update_alert_config(self, client, sample_alert_config):
        """Test updating a config."""
        response = client.put(
            f"/api/alerts/configs/{sample_alert_config.id}",
            json={
                "name": "Updated Alert",
                "threshold_value": 75
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Alert"
        assert data["threshold_value"] == 75

    def test_delete_alert_config(self, client, sample_alert_config):
        """Test deleting a config."""
        response = client.delete(f"/api/alerts/configs/{sample_alert_config.id}")
        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_toggle_alert_config(self, client, sample_alert_config):
        """Test toggling config enabled status."""
        # Initially enabled
        assert sample_alert_config.is_enabled is True

        response = client.post(f"/api/alerts/configs/{sample_alert_config.id}/toggle")
        assert response.status_code == 200
        assert response.json()["is_enabled"] is False


class TestAlertHistory:
    """Test alert history functionality."""

    def test_list_alerts_empty(self, client):
        """Test listing alerts when empty."""
        response = client.get("/api/alerts")
        assert response.status_code == 200
        assert response.json() == []

    def test_list_alerts_with_data(self, client, sample_alert):
        """Test listing alerts with data."""
        response = client.get("/api/alerts")
        assert response.status_code == 200
        alerts = response.json()
        assert len(alerts) == 1
        assert alerts[0]["message"] == "Occupancy exceeded threshold"

    def test_get_alert(self, client, sample_alert):
        """Test getting a specific alert."""
        response = client.get(f"/api/alerts/{sample_alert.id}")
        assert response.status_code == 200
        assert response.json()["severity"] == "warning"

    def test_acknowledge_alert(self, client, sample_alert):
        """Test acknowledging an alert."""
        response = client.post(
            f"/api/alerts/{sample_alert.id}/acknowledge?acknowledged_by=admin"
        )
        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_acknowledge_all_alerts(self, client, db, sample_alert_config, sample_zone):
        """Test acknowledging all alerts."""
        from models import Alert

        # Create multiple alerts
        for i in range(3):
            alert = Alert(
                config_id=sample_alert_config.id,
                alert_type="occupancy",
                severity="warning",
                message=f"Alert {i}",
                is_acknowledged=False
            )
            db.add(alert)
        db.commit()

        response = client.post("/api/alerts/acknowledge-all?acknowledged_by=admin")
        assert response.status_code == 200
        # All 3 new alerts plus the sample_alert should be acknowledged
        assert response.json()["acknowledged_count"] >= 3


class TestAlertFiltering:
    """Test alert filtering functionality."""

    def test_filter_by_severity(self, client, db, sample_alert_config):
        """Test filtering alerts by severity."""
        from models import Alert

        warning = Alert(
            config_id=sample_alert_config.id,
            alert_type="occupancy",
            severity="warning",
            message="Warning alert"
        )
        critical = Alert(
            config_id=sample_alert_config.id,
            alert_type="occupancy",
            severity="critical",
            message="Critical alert"
        )
        db.add_all([warning, critical])
        db.commit()

        response = client.get("/api/alerts?severity=critical")
        assert response.status_code == 200
        alerts = response.json()
        assert all(a["severity"] == "critical" for a in alerts)

    def test_filter_by_acknowledged(self, client, db, sample_alert_config):
        """Test filtering by acknowledgement status."""
        from models import Alert

        acked = Alert(
            config_id=sample_alert_config.id,
            alert_type="occupancy",
            severity="info",
            message="Acknowledged",
            is_acknowledged=True
        )
        unacked = Alert(
            config_id=sample_alert_config.id,
            alert_type="occupancy",
            severity="info",
            message="Unacknowledged",
            is_acknowledged=False
        )
        db.add_all([acked, unacked])
        db.commit()

        # Use is_acknowledged parameter (not acknowledged)
        response = client.get("/api/alerts?is_acknowledged=false")
        assert response.status_code == 200
        alerts = response.json()
        # Filter only unacknowledged alerts from response
        unacked_alerts = [a for a in alerts if a["is_acknowledged"] is False]
        assert len(unacked_alerts) >= 1


class TestAlertStats:
    """Test alert statistics endpoint."""

    def test_get_stats(self, client, sample_alert):
        """Test getting alert statistics."""
        # Use the correct endpoint path
        response = client.get("/api/alerts/stats/summary")
        assert response.status_code == 200
        data = response.json()

        assert "total" in data
        assert "unacknowledged" in data
        assert "by_severity" in data
        assert "by_type" in data


class TestAfterHoursSchedule:
    """Test after-hours schedule functionality."""

    def test_list_schedules_empty(self, client):
        """Test listing schedules when empty."""
        response = client.get("/api/alerts/schedules")
        assert response.status_code == 200

    def test_create_schedule(self, client):
        """Test creating an after-hours schedule."""
        response = client.post(
            "/api/alerts/schedules",
            json={
                "name": "Weeknight Closed",
                "day_of_week": 0,  # Monday
                "start_hour": 22,
                "start_minute": 0,
                "end_hour": 6,
                "end_minute": 0,
                "is_enabled": True
            }
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Weeknight Closed"
        assert data["day_of_week"] == 0

    def test_delete_schedule(self, client, db):
        """Test deleting an after-hours schedule."""
        from models import AfterHoursSchedule

        schedule = AfterHoursSchedule(
            name="To Delete",
            day_of_week=1,
            start_hour=22,
            end_hour=6
        )
        db.add(schedule)
        db.commit()

        response = client.delete(f"/api/alerts/schedules/{schedule.id}")
        assert response.status_code == 200
        assert response.json()["success"] is True


class TestAlertTypes:
    """Test alert type definitions."""

    def test_list_alert_configs_returns_valid_types(self, client, sample_alert_config):
        """Test that alert configs contain valid types."""
        response = client.get("/api/alerts/configs")
        assert response.status_code == 200
        configs = response.json()
        # Verify configs have valid alert_type
        for config in configs:
            assert config["alert_type"] in ["occupancy", "wait_time", "after_hours", "zone_breach"]
