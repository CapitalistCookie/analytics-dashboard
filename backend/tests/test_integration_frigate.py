"""Integration tests for Frigate NVR service."""

import pytest
import respx
import httpx
from unittest.mock import AsyncMock, patch, MagicMock
import time
import os

pytestmark = [pytest.mark.integration, pytest.mark.frigate]


class TestFrigateMockService:
    """Test the Frigate mock service functionality."""

    def test_frigate_mock_cameras(self, frigate_mock):
        """Test mock has cameras defined."""
        assert len(frigate_mock.cameras) == 3
        assert "front_door" in frigate_mock.cameras
        assert "lobby" in frigate_mock.cameras
        assert "parking" in frigate_mock.cameras

    def test_frigate_mock_stats(self, frigate_mock):
        """Test mock returns stats correctly."""
        stats = frigate_mock.get_stats()
        assert "cameras" in stats
        assert len(stats["cameras"]) == 3

    def test_frigate_mock_version(self, frigate_mock):
        """Test mock returns version."""
        version = frigate_mock.get_version()
        assert "version" in version
        assert version["version"] == "0.13.0"

    def test_frigate_mock_camera_details(self, frigate_mock):
        """Test getting camera details."""
        camera = frigate_mock.get_camera("front_door")
        assert camera is not None
        assert "camera_fps" in camera
        assert camera["camera_fps"] == 15.0

    def test_frigate_mock_camera_not_found(self, frigate_mock):
        """Test getting non-existent camera returns None."""
        camera = frigate_mock.get_camera("nonexistent")
        assert camera is None


class TestFrigateSnapshotIntegration:
    """Test Frigate snapshot handling."""

    def test_snapshot_url_format(self, frigate_mock):
        """Test snapshot URL is correctly formatted."""
        event = frigate_mock.get_event("event_0")
        assert event is not None
        assert "thumbnail" in event
        assert event["thumbnail"].startswith("/api/events/")

    def test_event_has_snapshot(self, frigate_mock):
        """Test events have snapshot flag."""
        events = frigate_mock.get_events(limit=5)
        for event in events:
            assert "has_snapshot" in event
            assert isinstance(event["has_snapshot"], bool)


class TestFrigateEventIntegration:
    """Test Frigate event queries."""

    def test_get_events_default(self, frigate_mock):
        """Test getting events with default parameters."""
        events = frigate_mock.get_events()
        assert isinstance(events, list)
        assert len(events) == 10  # Generated 10 sample events

    def test_get_events_with_limit(self, frigate_mock):
        """Test getting events with limit."""
        events = frigate_mock.get_events(limit=3)
        assert len(events) == 3

    def test_get_events_with_label_filter(self, frigate_mock):
        """Test filtering events by label."""
        events = frigate_mock.get_events(label="person")
        assert len(events) > 0
        for event in events:
            assert event["label"] == "person"

    def test_get_single_event(self, frigate_mock):
        """Test getting a single event by ID."""
        event = frigate_mock.get_event("event_0")
        assert event is not None
        assert event["id"] == "event_0"

    def test_get_event_not_found(self, frigate_mock):
        """Test getting non-existent event returns None."""
        event = frigate_mock.get_event("nonexistent")
        assert event is None

    def test_event_structure(self, frigate_mock):
        """Test event data structure is correct."""
        events = frigate_mock.get_events()
        assert len(events) > 0

        event = events[0]
        required_fields = ["id", "camera", "label", "score", "start_time"]
        for field in required_fields:
            assert field in event, f"Missing field: {field}"


class TestFrigateFaceRecognitionIntegration:
    """Test Frigate face recognition API."""

    def test_get_faces_empty(self, frigate_mock):
        """Test getting faces when none registered."""
        frigate_mock.faces = {}
        faces = frigate_mock.get_faces()
        assert faces == {}

    def test_add_face(self, frigate_mock):
        """Test adding a new face."""
        frigate_mock.faces = {}
        result = frigate_mock.add_face("john_doe", "face_001")
        assert result["success"] is True

        faces = frigate_mock.get_faces()
        assert "john_doe" in faces
        assert "face_001" in faces["john_doe"]

    def test_add_multiple_faces_same_person(self, frigate_mock):
        """Test adding multiple faces for the same person."""
        frigate_mock.faces = {}
        frigate_mock.add_face("jane_doe", "face_001")
        frigate_mock.add_face("jane_doe", "face_002")

        faces = frigate_mock.get_faces()
        assert "jane_doe" in faces
        assert len(faces["jane_doe"]) == 2

    def test_delete_face(self, frigate_mock):
        """Test deleting a face."""
        frigate_mock.faces = {}
        frigate_mock.add_face("test_person", "face_001")
        frigate_mock.delete_face("test_person")

        faces = frigate_mock.get_faces()
        assert "test_person" not in faces

    def test_delete_specific_face_image(self, frigate_mock):
        """Test deleting a specific face image."""
        frigate_mock.faces = {}
        frigate_mock.add_face("multi_face", "face_001")
        frigate_mock.add_face("multi_face", "face_002")
        frigate_mock.delete_face("multi_face", "face_001")

        faces = frigate_mock.get_faces()
        assert "multi_face" in faces
        assert "face_001" not in faces["multi_face"]
        assert "face_002" in faces["multi_face"]

    def test_train_face(self, frigate_mock):
        """Test triggering face training."""
        frigate_mock.faces = {}
        frigate_mock.add_face("trainee", "face_001")
        result = frigate_mock.train_face("trainee")

        assert result["success"] is True
        status = frigate_mock.get_training_status()
        assert status["status"] == "training"
        assert status["name"] == "trainee"

    def test_training_status(self, frigate_mock):
        """Test getting training status."""
        frigate_mock.training_status = {"status": "idle"}
        status = frigate_mock.get_training_status()
        assert status["status"] == "idle"


class TestFrigateSemanticSearchIntegration:
    """Test Frigate semantic search API."""

    def test_search_by_label(self, frigate_mock):
        """Test searching events by label."""
        results = frigate_mock.search_events("person")
        assert len(results) > 0
        for result in results:
            assert "person" in result["label"].lower()

    def test_search_with_limit(self, frigate_mock):
        """Test search respects limit parameter."""
        results = frigate_mock.search_events("person", limit=2)
        assert len(results) <= 2

    def test_search_no_results(self, frigate_mock):
        """Test search with no matching results."""
        results = frigate_mock.search_events("nonexistent_label")
        assert len(results) == 0


class TestFrigateServiceClass:
    """Test the FrigateService class directly."""

    def test_frigate_service_initialization(self):
        """Test FrigateService initializes correctly."""
        from frigate_service import FrigateService

        service = FrigateService(base_url="http://test-frigate:5000")
        assert service.base_url == "http://test-frigate:5000"

    def test_frigate_service_default_url(self):
        """Test FrigateService uses default URL from environment."""
        from frigate_service import FrigateService

        service = FrigateService()
        # URL comes from FRIGATE_URL env var or fallback
        assert service.base_url is not None

    @respx.mock
    @pytest.mark.asyncio
    async def test_frigate_service_get_faces(self):
        """Test FrigateService.get_faces()."""
        from frigate_service import FrigateService

        service = FrigateService(base_url="http://mock-frigate:5000")
        respx.get("http://mock-frigate:5000/api/faces").mock(
            return_value=httpx.Response(200, json={"john": ["face1"], "jane": ["face2"]})
        )

        faces = await service.get_faces()
        assert "john" in faces
        assert "jane" in faces

    @respx.mock
    @pytest.mark.asyncio
    async def test_frigate_service_upload_face(self):
        """Test FrigateService.upload_face()."""
        from frigate_service import FrigateService

        service = FrigateService(base_url="http://mock-frigate:5000")
        respx.post("http://mock-frigate:5000/api/faces/test_user").mock(
            return_value=httpx.Response(200, json={"success": True, "face_id": "face_123"})
        )

        result = await service.upload_face("test_user", b"fake_image_data")
        assert result["success"] is True
        assert result["face_id"] == "face_123"

    @respx.mock
    @pytest.mark.asyncio
    async def test_frigate_service_train_face(self):
        """Test FrigateService.train_face()."""
        from frigate_service import FrigateService

        service = FrigateService(base_url="http://mock-frigate:5000")
        respx.post("http://mock-frigate:5000/api/faces/test_user/train").mock(
            return_value=httpx.Response(200, json={"success": True})
        )

        result = await service.train_face("test_user")
        assert result["success"] is True

    @respx.mock
    @pytest.mark.asyncio
    async def test_frigate_service_delete_face(self):
        """Test FrigateService.delete_face()."""
        from frigate_service import FrigateService

        service = FrigateService(base_url="http://mock-frigate:5000")
        respx.delete("http://mock-frigate:5000/api/faces/test_user").mock(
            return_value=httpx.Response(200)
        )

        result = await service.delete_face("test_user")
        assert result["success"] is True

    @respx.mock
    @pytest.mark.asyncio
    async def test_frigate_service_get_training_status(self):
        """Test FrigateService.get_training_status()."""
        from frigate_service import FrigateService

        service = FrigateService(base_url="http://mock-frigate:5000")
        respx.get("http://mock-frigate:5000/api/faces/train").mock(
            return_value=httpx.Response(200, json={"status": "complete"})
        )

        status = await service.get_training_status()
        assert status["status"] == "complete"

    @respx.mock
    @pytest.mark.asyncio
    async def test_frigate_service_training_status_404(self):
        """Test FrigateService.get_training_status() when no training."""
        from frigate_service import FrigateService

        service = FrigateService(base_url="http://mock-frigate:5000")
        respx.get("http://mock-frigate:5000/api/faces/train").mock(
            return_value=httpx.Response(404)
        )

        status = await service.get_training_status()
        assert status["status"] == "idle"

    @respx.mock
    @pytest.mark.asyncio
    async def test_frigate_service_reindex_faces(self):
        """Test FrigateService.reindex_faces()."""
        from frigate_service import FrigateService

        service = FrigateService(base_url="http://mock-frigate:5000")
        respx.post("http://mock-frigate:5000/api/faces/reindex").mock(
            return_value=httpx.Response(200, json={"success": True})
        )

        result = await service.reindex_faces()
        assert result["success"] is True

    @respx.mock
    @pytest.mark.asyncio
    async def test_frigate_service_get_face(self):
        """Test FrigateService.get_face()."""
        from frigate_service import FrigateService

        service = FrigateService(base_url="http://mock-frigate:5000")
        respx.get("http://mock-frigate:5000/api/faces/john_doe").mock(
            return_value=httpx.Response(200, json={"name": "john_doe", "images": ["face1.jpg"]})
        )

        face = await service.get_face("john_doe")
        assert face["name"] == "john_doe"


class TestFrigateAPIEndpoints:
    """Test actual API endpoints with mocked Frigate service."""

    def test_health_endpoint_exists(self, client):
        """Test health endpoint is accessible."""
        response = client.get("/api/health")
        assert response.status_code == 200

    def test_health_response_structure(self, client):
        """Test health response has correct structure."""
        response = client.get("/api/health")
        data = response.json()
        assert "status" in data
        assert "frigate" in data
        assert "database" in data
