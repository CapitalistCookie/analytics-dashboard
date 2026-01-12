"""Pytest configuration and fixtures for backend tests."""

import os
import pytest
from datetime import datetime
from typing import Generator

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Set test environment variables before importing app modules
os.environ["SQLITE_DATABASE_URL"] = "sqlite:///:memory:"
os.environ["JWT_SECRET_KEY"] = "test-secret-key"
os.environ["ACCESS_TOKEN_EXPIRE_MINUTES"] = "60"

from database import Base, get_db
from main import app
from models import User, Staff, Zone, Incident, ShiftNote, AlertConfig, Alert
from routers.auth import get_password_hash, create_access_token


# Create test database engine with in-memory SQLite
TEST_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    """Override database dependency for tests."""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="function")
def db() -> Generator:
    """Create a fresh database for each test."""
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db) -> Generator:
    """Create a test client with database override."""
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def admin_user(db) -> User:
    """Create an admin user for testing."""
    user = User(
        username="testadmin",
        email="admin@test.com",
        hashed_password=get_password_hash("testpassword123"),
        role="admin",
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def manager_user(db) -> User:
    """Create a manager user for testing."""
    user = User(
        username="testmanager",
        email="manager@test.com",
        hashed_password=get_password_hash("testpassword123"),
        role="manager",
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def viewer_user(db) -> User:
    """Create a viewer user for testing."""
    user = User(
        username="testviewer",
        email="viewer@test.com",
        hashed_password=get_password_hash("testpassword123"),
        role="viewer",
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_token(admin_user) -> str:
    """Create an access token for admin user."""
    return create_access_token(
        data={"sub": admin_user.username, "role": admin_user.role}
    )


@pytest.fixture
def manager_token(manager_user) -> str:
    """Create an access token for manager user."""
    return create_access_token(
        data={"sub": manager_user.username, "role": manager_user.role}
    )


@pytest.fixture
def viewer_token(viewer_user) -> str:
    """Create an access token for viewer user."""
    return create_access_token(
        data={"sub": viewer_user.username, "role": viewer_user.role}
    )


@pytest.fixture
def auth_headers(admin_token) -> dict:
    """Authorization headers for admin user."""
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def manager_headers(manager_token) -> dict:
    """Authorization headers for manager user."""
    return {"Authorization": f"Bearer {manager_token}"}


@pytest.fixture
def viewer_headers(viewer_token) -> dict:
    """Authorization headers for viewer user."""
    return {"Authorization": f"Bearer {viewer_token}"}


@pytest.fixture
def sample_staff(db) -> Staff:
    """Create a sample staff member."""
    staff = Staff(
        name="John Doe",
        role="server",
        badge_id="EMP001",
        is_active=True
    )
    db.add(staff)
    db.commit()
    db.refresh(staff)
    return staff


@pytest.fixture
def sample_zone(db) -> Zone:
    """Create a sample zone."""
    zone = Zone(
        name="Main Dining",
        zone_type="dining",
        capacity=50,
        camera_ids="cam_001,cam_002",
        is_active=True
    )
    db.add(zone)
    db.commit()
    db.refresh(zone)
    return zone


@pytest.fixture
def sample_incident(db, sample_zone, sample_staff, admin_user) -> Incident:
    """Create a sample incident."""
    incident = Incident(
        title="Test Incident",
        description="A test incident description",
        incident_type="complaint",
        severity="medium",
        status="open",
        zone_id=sample_zone.id,
        assigned_to=sample_staff.id,
        reported_by=admin_user.id
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)
    return incident


@pytest.fixture
def sample_shift_note(db, admin_user) -> ShiftNote:
    """Create a sample shift note."""
    note = ShiftNote(
        content="Test shift note content",
        category="general",
        is_pinned=False,
        created_by=admin_user.id,
        shift_date=datetime.utcnow(),
        shift_type="morning"
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@pytest.fixture
def sample_alert_config(db, sample_zone) -> AlertConfig:
    """Create a sample alert configuration."""
    config = AlertConfig(
        name="High Occupancy Alert",
        alert_type="occupancy",
        severity="warning",
        threshold_value=50,
        threshold_operator="gt",
        zone_id=sample_zone.id,
        is_enabled=True,
        cooldown_minutes=15
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


@pytest.fixture
def sample_alert(db, sample_alert_config, sample_zone) -> Alert:
    """Create a sample alert."""
    alert = Alert(
        config_id=sample_alert_config.id,
        alert_type="occupancy",
        severity="warning",
        message="Occupancy exceeded threshold",
        zone_id=sample_zone.id,
        is_acknowledged=False
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


# ============== Integration Test Fixtures ==============

# MQTT broker mock fixture
@pytest.fixture(scope="function")
def mqtt_broker():
    """Mock MQTT broker for integration tests."""
    class MockMQTTBroker:
        def __init__(self):
            self.host = "localhost"
            self.port = 1883
            self.messages = []
            self.subscriptions = {}
            self.connected = False

        def connect(self):
            self.connected = True
            return True

        def disconnect(self):
            self.connected = False

        def subscribe(self, topic, callback=None):
            self.subscriptions[topic] = callback

        def publish(self, topic, payload):
            self.messages.append({"topic": topic, "payload": payload})
            for sub_topic, callback in self.subscriptions.items():
                if self._topic_matches(sub_topic, topic) and callback:
                    callback(topic, payload)

        def _topic_matches(self, pattern, topic):
            """Check if topic matches pattern with wildcards."""
            pattern_parts = pattern.split("/")
            topic_parts = topic.split("/")

            for i, p in enumerate(pattern_parts):
                if p == "#":
                    return True
                if p == "+":
                    continue
                if i >= len(topic_parts) or p != topic_parts[i]:
                    return False
            return len(pattern_parts) == len(topic_parts)

        def get_messages(self, topic=None):
            if topic:
                return [m for m in self.messages if m["topic"] == topic]
            return self.messages

        def clear_messages(self):
            self.messages = []

    return MockMQTTBroker()


# Frigate mock service
@pytest.fixture(scope="function")
def frigate_mock():
    """Create a mock Frigate service with realistic responses."""
    import time

    class MockFrigateService:
        def __init__(self):
            self.base_url = "http://mock-frigate:5000"
            self.cameras = {
                "front_door": {
                    "camera_fps": 15.0,
                    "detection_fps": 5.0,
                    "process_fps": 15.0,
                    "capture_pid": 1234,
                    "ffmpeg_pid": 1235
                },
                "lobby": {
                    "camera_fps": 20.0,
                    "detection_fps": 8.0,
                    "process_fps": 20.0,
                    "capture_pid": 1236,
                    "ffmpeg_pid": 1237
                },
                "parking": {
                    "camera_fps": 10.0,
                    "detection_fps": 3.0,
                    "process_fps": 10.0,
                    "capture_pid": 1238,
                    "ffmpeg_pid": 1239
                }
            }
            self.events = []
            self.faces = {}
            self.training_status = {"status": "idle"}
            self._generate_sample_events()

        def _generate_sample_events(self):
            """Generate sample events for testing."""
            base_time = time.time()
            for i in range(10):
                self.events.append({
                    "id": f"event_{i}",
                    "camera": list(self.cameras.keys())[i % len(self.cameras)],
                    "label": "person",
                    "score": 0.85 + (i * 0.01),
                    "start_time": base_time - (i * 300),
                    "end_time": base_time - (i * 300) + 60,
                    "thumbnail": f"/api/events/event_{i}/thumbnail.jpg",
                    "has_clip": True,
                    "has_snapshot": True
                })

        def get_version(self):
            return {"version": "0.13.0"}

        def get_stats(self):
            return {"cameras": self.cameras}

        def get_camera(self, camera_id):
            if camera_id in self.cameras:
                return self.cameras[camera_id]
            return None

        def get_events(self, limit=50, label=None, camera=None):
            events = self.events
            if label:
                events = [e for e in events if e["label"] == label]
            if camera:
                events = [e for e in events if e["camera"] == camera]
            return events[:limit]

        def get_event(self, event_id):
            for event in self.events:
                if event["id"] == event_id:
                    return event
            return None

        def get_faces(self):
            return self.faces

        def add_face(self, name, face_id="face_1"):
            if name not in self.faces:
                self.faces[name] = []
            self.faces[name].append(face_id)
            return {"success": True, "face_id": face_id}

        def delete_face(self, name, face_id=None):
            if name in self.faces:
                if face_id:
                    self.faces[name] = [f for f in self.faces[name] if f != face_id]
                else:
                    del self.faces[name]
            return {"success": True}

        def train_face(self, name):
            self.training_status = {"status": "training", "name": name}
            return {"success": True, "message": f"Training started for {name}"}

        def get_training_status(self):
            return self.training_status

        def search_events(self, query, limit=50):
            """Semantic search mock."""
            results = []
            for event in self.events:
                if query.lower() in event.get("label", "").lower():
                    results.append(event)
            return results[:limit]

    return MockFrigateService()


# Test data fixtures for integration tests
@pytest.fixture
def sample_frigate_event():
    """Sample Frigate event data."""
    import time
    return {
        "id": "test_event_001",
        "camera": "front_door",
        "label": "person",
        "sub_label": "staff_john",
        "score": 0.92,
        "start_time": time.time() - 300,
        "end_time": time.time() - 240,
        "top_score": 0.95,
        "zones": ["entrance", "lobby"],
        "thumbnail": "/api/events/test_event_001/thumbnail.jpg",
        "has_clip": True,
        "has_snapshot": True,
        "retain_indefinitely": False
    }


@pytest.fixture
def sample_mqtt_event():
    """Sample MQTT event payload from Frigate."""
    import json
    import time
    return {
        "topic": "frigate/events",
        "payload": json.dumps({
            "before": {
                "id": "test_event_002",
                "camera": "lobby",
                "label": "person",
                "score": 0.0
            },
            "after": {
                "id": "test_event_002",
                "camera": "lobby",
                "label": "person",
                "score": 0.88,
                "start_time": time.time(),
                "zones": ["dining"]
            },
            "type": "new"
        })
    }


@pytest.fixture
def sample_influx_point():
    """Sample InfluxDB point data."""
    return {
        "measurement": "person_count",
        "tags": {
            "camera": "front_door",
            "zone": "entrance"
        },
        "fields": {
            "count": 5
        }
    }


# InfluxDB test fixtures (using mocks when testcontainers not available)
@pytest.fixture(scope="function")
def influxdb_client():
    """Create mock InfluxDB client for tests."""
    from unittest.mock import MagicMock

    mock_client = MagicMock()
    mock_client.health.return_value = MagicMock(status="pass")
    mock_client.ping.return_value = True
    yield mock_client


@pytest.fixture(scope="function")
def influxdb_write_api(influxdb_client):
    """Get mock InfluxDB write API."""
    return influxdb_client.write_api()


@pytest.fixture(scope="function")
def influxdb_query_api(influxdb_client):
    """Get mock InfluxDB query API."""
    return influxdb_client.query_api()
