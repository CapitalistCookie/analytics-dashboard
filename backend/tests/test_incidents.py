"""Tests for incident management endpoints."""

import pytest
from datetime import datetime, timedelta


class TestIncidentTypes:
    """Test incident type endpoints."""

    def test_get_incident_types(self, client):
        """Test getting incident types."""
        response = client.get("/api/incidents/types")
        assert response.status_code == 200
        types = response.json()["types"]
        assert "complaint" in types
        assert "spill" in types
        assert "theft" in types

    def test_get_severity_levels(self, client):
        """Test getting severity levels."""
        response = client.get("/api/incidents/severities")
        assert response.status_code == 200
        severities = response.json()["severities"]
        assert "low" in severities
        assert "critical" in severities

    def test_get_status_options(self, client):
        """Test getting status options."""
        response = client.get("/api/incidents/statuses")
        assert response.status_code == 200
        statuses = response.json()["statuses"]
        assert "open" in statuses
        assert "resolved" in statuses


class TestListIncidents:
    """Test incident listing functionality."""

    def test_list_incidents_empty(self, client):
        """Test listing incidents when empty."""
        response = client.get("/api/incidents")
        assert response.status_code == 200
        assert response.json() == []

    def test_list_incidents_with_data(self, client, sample_incident):
        """Test listing incidents with data."""
        response = client.get("/api/incidents")
        assert response.status_code == 200
        incidents = response.json()
        assert len(incidents) == 1
        assert incidents[0]["title"] == "Test Incident"

    def test_list_incidents_filter_status(self, client, db, sample_incident):
        """Test filtering incidents by status."""
        response = client.get("/api/incidents?status=open")
        assert response.status_code == 200
        assert len(response.json()) == 1

        response = client.get("/api/incidents?status=resolved")
        assert response.status_code == 200
        assert len(response.json()) == 0

    def test_list_incidents_filter_severity(self, client, sample_incident):
        """Test filtering incidents by severity."""
        response = client.get("/api/incidents?severity=medium")
        assert response.status_code == 200
        assert len(response.json()) == 1

        response = client.get("/api/incidents?severity=critical")
        assert response.status_code == 200
        assert len(response.json()) == 0

    def test_list_incidents_pagination(self, client, db, sample_zone, admin_user):
        """Test incident pagination."""
        from models import Incident

        for i in range(5):
            inc = Incident(
                title=f"Incident {i}",
                incident_type="complaint",
                severity="low",
                status="open",
                reported_by=admin_user.id
            )
            db.add(inc)
        db.commit()

        response = client.get("/api/incidents?skip=0&limit=3")
        assert response.status_code == 200
        assert len(response.json()) == 3


class TestCreateIncident:
    """Test incident creation functionality."""

    def test_create_incident_success(self, client, sample_zone, sample_staff):
        """Test successful incident creation."""
        response = client.post(
            "/api/incidents",
            json={
                "title": "New Incident",
                "description": "Description here",
                "incident_type": "spill",
                "severity": "high",
                "zone_id": sample_zone.id,
                "assigned_to": sample_staff.id
            }
        )
        assert response.status_code == 201
        data = response.json()
        assert data["title"] == "New Incident"
        assert data["incident_type"] == "spill"
        assert data["severity"] == "high"
        assert data["status"] == "open"

    def test_create_incident_minimal(self, client):
        """Test creating incident with minimal data."""
        response = client.post(
            "/api/incidents",
            json={
                "title": "Minimal Incident",
                "incident_type": "other"
            }
        )
        assert response.status_code == 201
        data = response.json()
        assert data["title"] == "Minimal Incident"
        assert data["severity"] == "medium"  # Default

    def test_create_incident_invalid_zone(self, client):
        """Test creating incident with invalid zone."""
        response = client.post(
            "/api/incidents",
            json={
                "title": "Bad Zone",
                "incident_type": "complaint",
                "zone_id": 9999
            }
        )
        assert response.status_code == 400
        assert "Zone not found" in response.json()["detail"]

    def test_create_incident_invalid_staff(self, client):
        """Test creating incident with invalid staff."""
        response = client.post(
            "/api/incidents",
            json={
                "title": "Bad Staff",
                "incident_type": "complaint",
                "assigned_to": 9999
            }
        )
        assert response.status_code == 400
        assert "Staff member not found" in response.json()["detail"]


class TestGetIncident:
    """Test get single incident functionality."""

    def test_get_incident_success(self, client, sample_incident):
        """Test getting an incident by ID."""
        response = client.get(f"/api/incidents/{sample_incident.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == sample_incident.id
        assert data["title"] == "Test Incident"

    def test_get_incident_not_found(self, client):
        """Test getting non-existent incident."""
        response = client.get("/api/incidents/9999")
        assert response.status_code == 404


class TestUpdateIncident:
    """Test incident update functionality."""

    def test_update_incident_success(self, client, sample_incident):
        """Test successful incident update."""
        response = client.put(
            f"/api/incidents/{sample_incident.id}",
            json={
                "title": "Updated Title",
                "severity": "critical"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Updated Title"
        assert data["severity"] == "critical"

    def test_update_incident_status(self, client, sample_incident):
        """Test updating incident status."""
        response = client.put(
            f"/api/incidents/{sample_incident.id}",
            json={"status": "investigating"}
        )
        assert response.status_code == 200
        assert response.json()["status"] == "investigating"

    def test_update_incident_not_found(self, client):
        """Test updating non-existent incident."""
        response = client.put(
            "/api/incidents/9999",
            json={"title": "Test"}
        )
        assert response.status_code == 404


class TestDeleteIncident:
    """Test incident deletion functionality."""

    def test_delete_incident_success(self, client, sample_incident):
        """Test successful incident deletion."""
        response = client.delete(f"/api/incidents/{sample_incident.id}")
        assert response.status_code == 200
        assert response.json()["success"] is True

        # Verify deletion
        response = client.get(f"/api/incidents/{sample_incident.id}")
        assert response.status_code == 404

    def test_delete_incident_not_found(self, client):
        """Test deleting non-existent incident."""
        response = client.delete("/api/incidents/9999")
        assert response.status_code == 404


class TestResolveIncident:
    """Test incident resolution functionality."""

    def test_resolve_incident(self, client, sample_incident):
        """Test resolving an incident."""
        response = client.post(
            f"/api/incidents/{sample_incident.id}/resolve",
            params={"resolution_notes": "Issue fixed"}
        )
        assert response.status_code == 200
        assert response.json()["success"] is True

        # Verify status changed
        response = client.get(f"/api/incidents/{sample_incident.id}")
        assert response.json()["status"] == "resolved"
        assert response.json()["resolution_notes"] == "Issue fixed"

    def test_resolve_nonexistent(self, client):
        """Test resolving non-existent incident."""
        response = client.post("/api/incidents/9999/resolve")
        assert response.status_code == 404


class TestAssignIncident:
    """Test incident assignment functionality."""

    def test_assign_incident(self, client, db, sample_staff):
        """Test assigning an incident to staff."""
        from models import Incident

        incident = Incident(title="Unassigned", incident_type="complaint")
        db.add(incident)
        db.commit()

        response = client.post(
            f"/api/incidents/{incident.id}/assign",
            params={"staff_id": sample_staff.id}
        )
        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_assign_invalid_staff(self, client, sample_incident):
        """Test assigning to invalid staff."""
        response = client.post(
            f"/api/incidents/{sample_incident.id}/assign",
            params={"staff_id": 9999}
        )
        assert response.status_code == 400


class TestAttachClip:
    """Test attaching Frigate clips to incidents."""

    def test_attach_clip(self, client, sample_incident):
        """Test attaching a Frigate clip."""
        response = client.post(
            f"/api/incidents/{sample_incident.id}/attach-clip",
            params={"frigate_event_id": "event123"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "event123" in data["clip_url"]


class TestIncidentStats:
    """Test incident statistics endpoint."""

    def test_get_stats_empty(self, client):
        """Test getting stats with no incidents."""
        response = client.get("/api/incidents/stats/summary")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["open"] == 0

    def test_get_stats_with_data(self, client, sample_incident):
        """Test getting stats with incidents."""
        response = client.get("/api/incidents/stats/summary")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["open"] == 1
        assert "by_severity" in data
        assert "by_type" in data


class TestExportIncidents:
    """Test incident export functionality."""

    def test_export_json(self, client, sample_incident):
        """Test exporting incidents as JSON."""
        # Export endpoint requires days parameter to avoid 422
        response = client.get("/api/incidents/export?format=json&days=30")
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        assert data[0]["title"] == "Test Incident"

    def test_export_csv(self, client, sample_incident):
        """Test exporting incidents as CSV."""
        response = client.get("/api/incidents/export?format=csv&days=30")
        assert response.status_code == 200
        assert "text/csv" in response.headers["content-type"]
        content = response.text
        assert "ID" in content
        assert "Test Incident" in content
