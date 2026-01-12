"""Integration tests for MQTT event handling."""

import pytest
import json
import time
from datetime import datetime
from unittest.mock import MagicMock, AsyncMock, patch

pytestmark = [pytest.mark.integration, pytest.mark.mqtt]


class TestMQTTBrokerConnection:
    """Test MQTT broker connection handling."""

    def test_mqtt_broker_connect(self, mqtt_broker):
        """Test connecting to MQTT broker."""
        result = mqtt_broker.connect()
        assert result is True
        assert mqtt_broker.connected is True

    def test_mqtt_broker_disconnect(self, mqtt_broker):
        """Test disconnecting from MQTT broker."""
        mqtt_broker.connect()
        mqtt_broker.disconnect()
        assert mqtt_broker.connected is False

    def test_mqtt_broker_reconnect(self, mqtt_broker):
        """Test reconnecting to MQTT broker."""
        mqtt_broker.connect()
        mqtt_broker.disconnect()
        result = mqtt_broker.connect()
        assert result is True
        assert mqtt_broker.connected is True


class TestMQTTSubscriptions:
    """Test MQTT subscription handling."""

    def test_subscribe_to_topic(self, mqtt_broker):
        """Test subscribing to a topic."""
        mqtt_broker.connect()
        callback = MagicMock()
        mqtt_broker.subscribe("frigate/events", callback)

        assert "frigate/events" in mqtt_broker.subscriptions

    def test_subscribe_with_wildcard(self, mqtt_broker):
        """Test subscribing with wildcard topic."""
        mqtt_broker.connect()
        callback = MagicMock()
        mqtt_broker.subscribe("frigate/+/events", callback)

        assert "frigate/+/events" in mqtt_broker.subscriptions

    def test_subscribe_with_multi_level_wildcard(self, mqtt_broker):
        """Test subscribing with multi-level wildcard."""
        mqtt_broker.connect()
        callback = MagicMock()
        mqtt_broker.subscribe("frigate/#", callback)

        assert "frigate/#" in mqtt_broker.subscriptions

    def test_multiple_subscriptions(self, mqtt_broker):
        """Test multiple topic subscriptions."""
        mqtt_broker.connect()

        topics = [
            "frigate/events",
            "frigate/front_door/person",
            "frigate/lobby/person",
            "alerts/occupancy"
        ]

        for topic in topics:
            mqtt_broker.subscribe(topic, MagicMock())

        assert len(mqtt_broker.subscriptions) == 4


class TestMQTTFrigateEvents:
    """Test MQTT Frigate event handling."""

    def test_receive_new_event(self, mqtt_broker, sample_mqtt_event):
        """Test receiving a new detection event."""
        mqtt_broker.connect()
        received_events = []

        def callback(topic, payload):
            received_events.append({"topic": topic, "payload": payload})

        mqtt_broker.subscribe("frigate/events", callback)

        # Simulate event from Frigate
        mqtt_broker.publish(
            sample_mqtt_event["topic"],
            sample_mqtt_event["payload"]
        )

        assert len(received_events) == 1
        assert received_events[0]["topic"] == "frigate/events"

    def test_parse_frigate_event_payload(self, mqtt_broker, sample_mqtt_event):
        """Test parsing Frigate event payload."""
        mqtt_broker.connect()

        mqtt_broker.publish(
            sample_mqtt_event["topic"],
            sample_mqtt_event["payload"]
        )

        messages = mqtt_broker.get_messages("frigate/events")
        assert len(messages) == 1

        payload = json.loads(messages[0]["payload"])
        assert "before" in payload
        assert "after" in payload
        assert "type" in payload

    def test_event_type_new(self, mqtt_broker):
        """Test handling 'new' event type."""
        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        event = {
            "before": {"id": "evt1", "camera": "front", "label": "person", "score": 0.0},
            "after": {"id": "evt1", "camera": "front", "label": "person", "score": 0.85},
            "type": "new"
        }

        mqtt_broker.publish("frigate/events", json.dumps(event))

        messages = mqtt_broker.get_messages("frigate/events")
        payload = json.loads(messages[0]["payload"])
        assert payload["type"] == "new"

    def test_event_type_update(self, mqtt_broker):
        """Test handling 'update' event type."""
        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        event = {
            "before": {"id": "evt1", "camera": "front", "label": "person", "score": 0.85},
            "after": {"id": "evt1", "camera": "front", "label": "person", "score": 0.92},
            "type": "update"
        }

        mqtt_broker.publish("frigate/events", json.dumps(event))

        messages = mqtt_broker.get_messages("frigate/events")
        payload = json.loads(messages[0]["payload"])
        assert payload["type"] == "update"

    def test_event_type_end(self, mqtt_broker):
        """Test handling 'end' event type."""
        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        event = {
            "before": {"id": "evt1", "camera": "front", "label": "person", "score": 0.92},
            "after": {"id": "evt1", "camera": "front", "label": "person", "score": 0.92, "end_time": time.time()},
            "type": "end"
        }

        mqtt_broker.publish("frigate/events", json.dumps(event))

        messages = mqtt_broker.get_messages("frigate/events")
        payload = json.loads(messages[0]["payload"])
        assert payload["type"] == "end"

    def test_camera_specific_events(self, mqtt_broker):
        """Test receiving camera-specific events."""
        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        front_door_events = []
        lobby_events = []

        def front_door_callback(topic, payload):
            front_door_events.append(payload)

        def lobby_callback(topic, payload):
            lobby_events.append(payload)

        mqtt_broker.subscribe("frigate/front_door/person", front_door_callback)
        mqtt_broker.subscribe("frigate/lobby/person", lobby_callback)

        # Publish to front_door
        mqtt_broker.publish("frigate/front_door/person", json.dumps({"count": 2}))
        # Publish to lobby
        mqtt_broker.publish("frigate/lobby/person", json.dumps({"count": 5}))

        assert len(front_door_events) == 1
        assert len(lobby_events) == 1

    def test_wildcard_subscription_receives_events(self, mqtt_broker):
        """Test wildcard subscription receives matching events."""
        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        all_person_events = []

        def callback(topic, payload):
            all_person_events.append({"topic": topic, "payload": payload})

        mqtt_broker.subscribe("frigate/+/person", callback)

        # Publish to different cameras
        mqtt_broker.publish("frigate/front_door/person", "event1")
        mqtt_broker.publish("frigate/lobby/person", "event2")
        mqtt_broker.publish("frigate/parking/person", "event3")

        assert len(all_person_events) == 3


class TestMQTTAlertPublishing:
    """Test MQTT alert publishing."""

    def test_publish_occupancy_alert(self, mqtt_broker):
        """Test publishing an occupancy alert."""
        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        alert = {
            "type": "occupancy",
            "severity": "warning",
            "zone": "entrance",
            "current_count": 55,
            "threshold": 50,
            "timestamp": datetime.utcnow().isoformat()
        }

        mqtt_broker.publish("alerts/occupancy", json.dumps(alert))

        messages = mqtt_broker.get_messages("alerts/occupancy")
        assert len(messages) == 1

        payload = json.loads(messages[0]["payload"])
        assert payload["type"] == "occupancy"
        assert payload["severity"] == "warning"
        assert payload["current_count"] == 55

    def test_publish_intrusion_alert(self, mqtt_broker):
        """Test publishing an intrusion alert."""
        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        alert = {
            "type": "intrusion",
            "severity": "critical",
            "zone": "restricted_area",
            "camera": "back_entrance",
            "event_id": "evt_12345",
            "timestamp": datetime.utcnow().isoformat()
        }

        mqtt_broker.publish("alerts/intrusion", json.dumps(alert))

        messages = mqtt_broker.get_messages("alerts/intrusion")
        assert len(messages) == 1

        payload = json.loads(messages[0]["payload"])
        assert payload["type"] == "intrusion"
        assert payload["severity"] == "critical"

    def test_publish_after_hours_alert(self, mqtt_broker):
        """Test publishing an after-hours activity alert."""
        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        alert = {
            "type": "after_hours",
            "severity": "high",
            "zone": "main_floor",
            "camera": "front_door",
            "detected_at": datetime.utcnow().isoformat(),
            "schedule": {
                "start": "22:00",
                "end": "06:00"
            }
        }

        mqtt_broker.publish("alerts/after_hours", json.dumps(alert))

        messages = mqtt_broker.get_messages("alerts/after_hours")
        assert len(messages) == 1

    def test_multiple_alert_types(self, mqtt_broker):
        """Test publishing multiple alert types."""
        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        alerts = [
            ("alerts/occupancy", {"type": "occupancy", "value": 60}),
            ("alerts/intrusion", {"type": "intrusion", "zone": "office"}),
            ("alerts/after_hours", {"type": "after_hours", "time": "23:30"})
        ]

        for topic, alert in alerts:
            mqtt_broker.publish(topic, json.dumps(alert))

        assert len(mqtt_broker.messages) == 3


class TestMQTTEventProcessing:
    """Test MQTT event processing logic."""

    def test_process_person_count_event(self, mqtt_broker):
        """Test processing person count update event."""
        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        processed_counts = {}

        def process_count(topic, payload):
            data = json.loads(payload)
            camera = topic.split("/")[1]
            processed_counts[camera] = data.get("count", 0)

        mqtt_broker.subscribe("frigate/+/person/count", process_count)

        mqtt_broker.publish("frigate/front_door/person/count", json.dumps({"count": 3}))
        mqtt_broker.publish("frigate/lobby/person/count", json.dumps({"count": 12}))

        assert processed_counts.get("front_door") == 3
        assert processed_counts.get("lobby") == 12

    def test_process_zone_enter_event(self, mqtt_broker):
        """Test processing zone enter events."""
        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        zone_entries = []

        def process_zone_enter(topic, payload):
            data = json.loads(payload)
            zone_entries.append({
                "zone": data.get("zone"),
                "person_id": data.get("person_id"),
                "time": data.get("timestamp")
            })

        mqtt_broker.subscribe("zones/+/enter", process_zone_enter)

        mqtt_broker.publish("zones/dining/enter", json.dumps({
            "zone": "dining",
            "person_id": "person_001",
            "timestamp": time.time()
        }))

        assert len(zone_entries) == 1
        assert zone_entries[0]["zone"] == "dining"

    def test_process_zone_exit_event(self, mqtt_broker):
        """Test processing zone exit events."""
        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        zone_exits = []

        def process_zone_exit(topic, payload):
            data = json.loads(payload)
            zone_exits.append({
                "zone": data.get("zone"),
                "person_id": data.get("person_id"),
                "duration": data.get("duration_seconds")
            })

        mqtt_broker.subscribe("zones/+/exit", process_zone_exit)

        mqtt_broker.publish("zones/dining/exit", json.dumps({
            "zone": "dining",
            "person_id": "person_001",
            "duration_seconds": 1200
        }))

        assert len(zone_exits) == 1
        assert zone_exits[0]["duration"] == 1200

    def test_face_recognition_event(self, mqtt_broker):
        """Test processing face recognition events."""
        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        recognized_faces = []

        def process_face_recognition(topic, payload):
            data = json.loads(payload)
            recognized_faces.append({
                "name": data.get("name"),
                "confidence": data.get("confidence"),
                "camera": data.get("camera")
            })

        mqtt_broker.subscribe("frigate/face_recognized", process_face_recognition)

        mqtt_broker.publish("frigate/face_recognized", json.dumps({
            "name": "john_doe",
            "confidence": 0.95,
            "camera": "front_door",
            "timestamp": time.time()
        }))

        assert len(recognized_faces) == 1
        assert recognized_faces[0]["name"] == "john_doe"
        assert recognized_faces[0]["confidence"] == 0.95


class TestMQTTTopicMatching:
    """Test MQTT topic pattern matching."""

    def test_exact_topic_match(self, mqtt_broker):
        """Test exact topic matching."""
        assert mqtt_broker._topic_matches("frigate/events", "frigate/events") is True
        assert mqtt_broker._topic_matches("frigate/events", "frigate/other") is False

    def test_single_level_wildcard(self, mqtt_broker):
        """Test single-level wildcard (+) matching."""
        assert mqtt_broker._topic_matches("frigate/+/events", "frigate/front_door/events") is True
        assert mqtt_broker._topic_matches("frigate/+/events", "frigate/lobby/events") is True
        assert mqtt_broker._topic_matches("frigate/+/events", "frigate/front_door/other") is False

    def test_multi_level_wildcard(self, mqtt_broker):
        """Test multi-level wildcard (#) matching."""
        assert mqtt_broker._topic_matches("frigate/#", "frigate/events") is True
        assert mqtt_broker._topic_matches("frigate/#", "frigate/front_door/events") is True
        assert mqtt_broker._topic_matches("frigate/#", "frigate/a/b/c/d") is True
        assert mqtt_broker._topic_matches("frigate/#", "other/events") is False

    def test_complex_wildcard_patterns(self, mqtt_broker):
        """Test complex wildcard patterns."""
        assert mqtt_broker._topic_matches("+/+/events", "frigate/front_door/events") is True
        assert mqtt_broker._topic_matches("frigate/+/+", "frigate/cam1/person") is True


class TestMQTTMessageQueue:
    """Test MQTT message queuing and retrieval."""

    def test_message_queue_stores_messages(self, mqtt_broker):
        """Test that messages are stored in queue."""
        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        for i in range(5):
            mqtt_broker.publish(f"topic/{i}", f"message_{i}")

        assert len(mqtt_broker.messages) == 5

    def test_get_messages_by_topic(self, mqtt_broker):
        """Test retrieving messages by specific topic."""
        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        mqtt_broker.publish("topic/a", "message_a")
        mqtt_broker.publish("topic/b", "message_b")
        mqtt_broker.publish("topic/a", "message_a2")

        topic_a_messages = mqtt_broker.get_messages("topic/a")
        assert len(topic_a_messages) == 2

    def test_clear_messages(self, mqtt_broker):
        """Test clearing message queue."""
        mqtt_broker.connect()

        mqtt_broker.publish("topic", "message")
        assert len(mqtt_broker.messages) > 0

        mqtt_broker.clear_messages()
        assert len(mqtt_broker.messages) == 0

    def test_get_all_messages(self, mqtt_broker):
        """Test retrieving all messages regardless of topic."""
        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        mqtt_broker.publish("topic/1", "msg1")
        mqtt_broker.publish("topic/2", "msg2")
        mqtt_broker.publish("topic/3", "msg3")

        all_messages = mqtt_broker.get_messages()
        assert len(all_messages) == 3
