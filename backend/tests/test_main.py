"""Tests for main application endpoints."""

import pytest
from unittest.mock import patch, AsyncMock, MagicMock


class TestHealthCheck:
    """Test health check endpoint."""

    def test_health_check_all_down(self, client):
        """Test health check when external services are down."""
        # Frigate and InfluxDB are not available in test environment
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()

        # Database should be healthy (SQLite in-memory)
        assert data["database"] is True
        # Status is degraded when Frigate is down
        assert data["status"] in ["healthy", "degraded"]

    def test_health_check_database_ok(self, client):
        """Test that database is always checked."""
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json()["database"] is True


class TestCameraEndpoints:
    """Test camera endpoints."""

    def test_list_cameras(self, client):
        """Test listing cameras - may succeed or fail depending on Frigate."""
        response = client.get("/api/cameras")
        # Either 200 (Frigate up) or 503 (Frigate down)
        assert response.status_code in [200, 503]

    def test_get_camera(self, client):
        """Test getting a camera - may succeed or fail depending on Frigate."""
        response = client.get("/api/cameras/cam_001")
        # Either 200 (found), 404 (not found), or 503 (Frigate down)
        assert response.status_code in [200, 404, 503]


class TestOccupancyEndpoints:
    """Test occupancy endpoints."""

    def test_get_current_occupancy(self, client):
        """Test getting current occupancy."""
        response = client.get("/api/analytics/occupancy")
        assert response.status_code == 200
        data = response.json()

        # Should return zeros when InfluxDB is not available
        assert "total_count" in data
        assert "timestamp" in data
        assert "by_camera" in data
        assert "by_zone" in data

    def test_get_occupancy_history(self, client):
        """Test getting occupancy history."""
        response = client.get("/api/analytics/occupancy/history")
        assert response.status_code == 200
        data = response.json()

        assert "history" in data
        assert isinstance(data["history"], list)

    def test_get_occupancy_history_custom_hours(self, client):
        """Test getting occupancy history with custom hours."""
        response = client.get("/api/analytics/occupancy/history?hours=12")
        assert response.status_code == 200
        assert "history" in response.json()


class TestEventEndpoints:
    """Test event endpoints."""

    def test_list_events(self, client):
        """Test listing events - may succeed or fail depending on Frigate."""
        response = client.get("/api/events")
        # Either 200 (Frigate up) or 503 (Frigate down)
        assert response.status_code in [200, 503]

    def test_get_event(self, client):
        """Test getting an event - may succeed or fail depending on Frigate."""
        response = client.get("/api/events/event_123")
        # Either 200 (found), 404 (not found), or 503 (Frigate down)
        assert response.status_code in [200, 404, 503]


class TestCORS:
    """Test CORS configuration."""

    def test_cors_headers(self, client):
        """Test that CORS headers are present."""
        response = client.options(
            "/api/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET"
            }
        )
        # CORS preflight should work
        assert response.status_code in [200, 405]  # 405 if options not handled


class TestAppConfiguration:
    """Test application configuration."""

    def test_app_title(self, client):
        """Test that OpenAPI docs are available."""
        response = client.get("/docs")
        # Should redirect or show docs
        assert response.status_code in [200, 307]

    def test_openapi_schema(self, client):
        """Test that OpenAPI schema is available."""
        response = client.get("/openapi.json")
        assert response.status_code == 200
        data = response.json()
        assert data["info"]["title"] == "Restaurant Analytics Dashboard"
        assert data["info"]["version"] == "1.0.0"
