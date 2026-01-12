"""Integration test configuration and fixtures."""

import os
import pytest
import asyncio
from datetime import datetime
from typing import Generator
from unittest.mock import MagicMock

# Integration test markers
def pytest_configure(config):
    config.addinivalue_line(
        "markers", "integration: mark test as integration test"
    )
    config.addinivalue_line(
        "markers", "frigate: mark test as Frigate integration test"
    )
    config.addinivalue_line(
        "markers", "influxdb: mark test as InfluxDB integration test"
    )
    config.addinivalue_line(
        "markers", "mqtt: mark test as MQTT integration test"
    )
    config.addinivalue_line(
        "markers", "e2e: mark test as end-to-end integration test"
    )


# InfluxDB test container
@pytest.fixture(scope="session")
def influxdb_container():
    """Start InfluxDB container for integration tests."""
    try:
        from testcontainers.influxdb import InfluxDbContainer

        container = InfluxDbContainer(
            image="influxdb:2.7",
        )
        container.with_env("DOCKER_INFLUXDB_INIT_MODE", "setup")
        container.with_env("DOCKER_INFLUXDB_INIT_USERNAME", "test")
        container.with_env("DOCKER_INFLUXDB_INIT_PASSWORD", "testpassword123")
        container.with_env("DOCKER_INFLUXDB_INIT_ORG", "test-org")
        container.with_env("DOCKER_INFLUXDB_INIT_BUCKET", "test-bucket")
        container.with_env("DOCKER_INFLUXDB_INIT_ADMIN_TOKEN", "test-token")

        container.start()
        yield container
        container.stop()
    except ImportError:
        pytest.skip("testcontainers not installed")


@pytest.fixture(scope="session")
def influxdb_url(influxdb_container):
    """Get InfluxDB URL from container."""
    return influxdb_container.get_url()


@pytest.fixture(scope="function")
def influxdb_client(influxdb_container):
    """Create InfluxDB client for tests."""
    from influxdb_client import InfluxDBClient
    from influxdb_client.client.write_api import SYNCHRONOUS

    client = InfluxDBClient(
        url=influxdb_container.get_url(),
        token="test-token",
        org="test-org"
    )
    yield client
    client.close()


@pytest.fixture(scope="function")
def influxdb_write_api(influxdb_client):
    """Get InfluxDB write API."""
    from influxdb_client.client.write_api import SYNCHRONOUS
    return influxdb_client.write_api(write_options=SYNCHRONOUS)


@pytest.fixture(scope="function")
def influxdb_query_api(influxdb_client):
    """Get InfluxDB query API."""
    return influxdb_client.query_api()


# MQTT broker mock fixture
@pytest.fixture(scope="session")
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
            # Trigger subscriber callback if exists
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
@pytest.fixture(scope="session")
def frigate_mock():
    """Create a mock Frigate service with realistic responses."""
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
            import time
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
            # Simple keyword matching for mock
            results = []
            for event in self.events:
                if query.lower() in event.get("label", "").lower():
                    results.append(event)
            return results[:limit]

    return MockFrigateService()


# Integration test client fixture
@pytest.fixture(scope="function")
def integration_client(db, frigate_mock, mqtt_broker):
    """Create test client with integration test dependencies."""
    import respx
    from fastapi.testclient import TestClient
    from main import app
    from database import get_db

    # Override database
    app.dependency_overrides[get_db] = lambda: db

    # Set up Frigate mock responses
    with respx.mock:
        # Mock Frigate endpoints
        respx.get(f"{frigate_mock.base_url}/api/version").respond(
            json=frigate_mock.get_version()
        )
        respx.get(f"{frigate_mock.base_url}/api/stats").respond(
            json=frigate_mock.get_stats()
        )

        with TestClient(app) as client:
            yield client

    app.dependency_overrides.clear()


# Test data fixtures
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


# Async event loop fixture for integration tests
@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()
