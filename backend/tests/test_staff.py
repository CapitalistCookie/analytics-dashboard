"""Tests for staff management endpoints."""

import pytest
import io


class TestListStaff:
    """Test staff listing functionality."""

    def test_list_staff_empty(self, client):
        """Test listing staff when empty."""
        response = client.get("/api/staff")
        assert response.status_code == 200
        data = response.json()
        assert data["staff"] == []
        assert data["total"] == 0

    def test_list_staff_with_data(self, client, sample_staff):
        """Test listing staff with data."""
        response = client.get("/api/staff")
        assert response.status_code == 200
        data = response.json()
        assert len(data["staff"]) == 1
        assert data["total"] == 1
        assert data["staff"][0]["name"] == "John Doe"

    def test_list_staff_pagination(self, client, db):
        """Test staff listing pagination."""
        from models import Staff

        # Create 5 staff members
        for i in range(5):
            staff = Staff(name=f"Staff {i}", role="server", badge_id=f"EMP{i:03d}")
            db.add(staff)
        db.commit()

        # Test pagination
        response = client.get("/api/staff?skip=0&limit=3")
        assert response.status_code == 200
        data = response.json()
        assert len(data["staff"]) == 3
        assert data["total"] == 5

    def test_list_active_only(self, client, db):
        """Test filtering active staff only."""
        from models import Staff

        active = Staff(name="Active Staff", role="server", is_active=True)
        inactive = Staff(name="Inactive Staff", role="server", is_active=False)
        db.add_all([active, inactive])
        db.commit()

        response = client.get("/api/staff?active_only=true")
        assert response.status_code == 200
        data = response.json()
        assert len(data["staff"]) == 1
        assert data["staff"][0]["name"] == "Active Staff"


class TestCreateStaff:
    """Test staff creation functionality."""

    def test_create_staff_success(self, client):
        """Test successful staff creation."""
        response = client.post(
            "/api/staff",
            json={
                "name": "Jane Doe",
                "role": "host",
                "badge_id": "EMP002"
            }
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Jane Doe"
        assert data["role"] == "host"
        assert data["badge_id"] == "EMP002"
        assert data["is_active"] is True
        assert data["face_trained"] is False

    def test_create_staff_without_badge(self, client):
        """Test creating staff without badge ID."""
        response = client.post(
            "/api/staff",
            json={
                "name": "No Badge Staff",
                "role": "server"
            }
        )
        assert response.status_code == 201
        assert response.json()["badge_id"] is None

    def test_create_staff_duplicate_badge(self, client, sample_staff):
        """Test creating staff with duplicate badge ID."""
        response = client.post(
            "/api/staff",
            json={
                "name": "Another Staff",
                "role": "server",
                "badge_id": "EMP001"  # Same as sample_staff
            }
        )
        assert response.status_code == 400
        assert "already assigned" in response.json()["detail"]


class TestGetStaff:
    """Test get single staff functionality."""

    def test_get_staff_success(self, client, sample_staff):
        """Test getting a staff member by ID."""
        response = client.get(f"/api/staff/{sample_staff.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == sample_staff.id
        assert data["name"] == "John Doe"

    def test_get_staff_not_found(self, client):
        """Test getting non-existent staff member."""
        response = client.get("/api/staff/9999")
        assert response.status_code == 404


class TestUpdateStaff:
    """Test staff update functionality."""

    def test_update_staff_success(self, client, sample_staff):
        """Test successful staff update."""
        response = client.put(
            f"/api/staff/{sample_staff.id}",
            json={
                "name": "John Updated",
                "role": "manager"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "John Updated"
        assert data["role"] == "manager"
        # Badge should remain unchanged
        assert data["badge_id"] == "EMP001"

    def test_update_staff_partial(self, client, sample_staff):
        """Test partial staff update."""
        response = client.put(
            f"/api/staff/{sample_staff.id}",
            json={"role": "host"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "John Doe"  # Unchanged
        assert data["role"] == "host"  # Updated

    def test_update_staff_not_found(self, client):
        """Test updating non-existent staff."""
        response = client.put(
            "/api/staff/9999",
            json={"name": "Test"}
        )
        assert response.status_code == 404

    def test_update_staff_duplicate_badge(self, client, db, sample_staff):
        """Test updating with duplicate badge ID."""
        from models import Staff

        other = Staff(name="Other Staff", role="server", badge_id="EMP999")
        db.add(other)
        db.commit()

        response = client.put(
            f"/api/staff/{sample_staff.id}",
            json={"badge_id": "EMP999"}
        )
        assert response.status_code == 400

    def test_deactivate_staff(self, client, sample_staff):
        """Test deactivating a staff member."""
        response = client.put(
            f"/api/staff/{sample_staff.id}",
            json={"is_active": False}
        )
        assert response.status_code == 200
        assert response.json()["is_active"] is False


class TestDeleteStaff:
    """Test staff deletion functionality."""

    def test_delete_staff_success(self, client, sample_staff):
        """Test successful staff deletion."""
        response = client.delete(f"/api/staff/{sample_staff.id}")
        assert response.status_code == 200
        assert "deleted" in response.json()["message"]

        # Verify deletion
        response = client.get(f"/api/staff/{sample_staff.id}")
        assert response.status_code == 404

    def test_delete_staff_not_found(self, client):
        """Test deleting non-existent staff."""
        response = client.delete("/api/staff/9999")
        assert response.status_code == 404


class TestTrainingStatus:
    """Test training status endpoint."""

    def test_get_training_status_no_photo(self, client, sample_staff):
        """Test training status when no photo uploaded."""
        response = client.get(f"/api/staff/{sample_staff.id}/training-status")
        assert response.status_code == 200
        data = response.json()
        assert data["face_trained"] is False
        assert "No photo" in data["message"]

    def test_get_training_status_not_found(self, client):
        """Test training status for non-existent staff."""
        response = client.get("/api/staff/9999/training-status")
        assert response.status_code == 404


class TestStaffActivity:
    """Test staff activity endpoint."""

    def test_get_staff_activity(self, client, sample_staff):
        """Test getting staff activity (returns empty for now)."""
        response = client.get(f"/api/staff/{sample_staff.id}/activity")
        assert response.status_code == 200
        assert response.json() == []

    def test_get_activity_not_found(self, client):
        """Test activity for non-existent staff."""
        response = client.get("/api/staff/9999/activity")
        assert response.status_code == 404
