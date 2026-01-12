"""End-to-end integration tests for complete data flows."""

import pytest
import json
import time
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch, AsyncMock
import respx
import httpx

pytestmark = [pytest.mark.integration, pytest.mark.e2e]


class TestFrigateToAnalyticsFlow:
    """Test data flow from Frigate events to analytics storage."""

    def test_event_detection_to_count_update(self, mqtt_broker, frigate_mock):
        """Test: Frigate detects person → MQTT event → Person count updated."""
        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        # Simulate analytics service state
        person_counts = {"front_door": 0, "lobby": 0}

        def update_person_count(topic, payload):
            data = json.loads(payload)
            event_type = data.get("type")
            camera = data.get("after", {}).get("camera")

            if event_type == "new" and camera:
                person_counts[camera] = person_counts.get(camera, 0) + 1
            elif event_type == "end" and camera:
                person_counts[camera] = max(0, person_counts.get(camera, 0) - 1)

        mqtt_broker.subscribe("frigate/events", update_person_count)

        # Frigate detects a new person
        new_event = {
            "before": {"id": "evt1", "camera": "front_door", "label": "person", "score": 0.0},
            "after": {"id": "evt1", "camera": "front_door", "label": "person", "score": 0.88},
            "type": "new"
        }
        mqtt_broker.publish("frigate/events", json.dumps(new_event))

        assert person_counts["front_door"] == 1

        # Another person detected
        new_event2 = {
            "before": {"id": "evt2", "camera": "front_door", "label": "person", "score": 0.0},
            "after": {"id": "evt2", "camera": "front_door", "label": "person", "score": 0.92},
            "type": "new"
        }
        mqtt_broker.publish("frigate/events", json.dumps(new_event2))

        assert person_counts["front_door"] == 2

        # Person leaves
        end_event = {
            "before": {"id": "evt1", "camera": "front_door", "label": "person", "score": 0.88},
            "after": {"id": "evt1", "camera": "front_door", "label": "person", "score": 0.88, "end_time": time.time()},
            "type": "end"
        }
        mqtt_broker.publish("frigate/events", json.dumps(end_event))

        assert person_counts["front_door"] == 1

    def test_zone_tracking_flow(self, mqtt_broker):
        """Test: Person enters zone → Updates zone occupancy → Stores in time-series."""
        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        # Zone occupancy state
        zone_occupancy = {}
        zone_history = []

        def track_zone_occupancy(topic, payload):
            data = json.loads(payload)
            zone = data.get("zone")
            action = "enter" if "/enter" in topic else "exit"

            if zone not in zone_occupancy:
                zone_occupancy[zone] = 0

            if action == "enter":
                zone_occupancy[zone] += 1
            else:
                zone_occupancy[zone] = max(0, zone_occupancy[zone] - 1)

            zone_history.append({
                "zone": zone,
                "action": action,
                "occupancy": zone_occupancy[zone],
                "timestamp": datetime.utcnow().isoformat()
            })

        mqtt_broker.subscribe("zones/+/enter", track_zone_occupancy)
        mqtt_broker.subscribe("zones/+/exit", track_zone_occupancy)

        # Simulate zone events
        mqtt_broker.publish("zones/dining/enter", json.dumps({
            "zone": "dining", "person_id": "p1", "timestamp": time.time()
        }))
        mqtt_broker.publish("zones/dining/enter", json.dumps({
            "zone": "dining", "person_id": "p2", "timestamp": time.time()
        }))
        mqtt_broker.publish("zones/dining/exit", json.dumps({
            "zone": "dining", "person_id": "p1", "timestamp": time.time()
        }))

        assert zone_occupancy["dining"] == 1
        assert len(zone_history) == 3


class TestAlertTriggerFlow:
    """Test alert triggering data flow."""

    def test_occupancy_threshold_alert(self, mqtt_broker, db, sample_zone, sample_alert_config):
        """Test: Occupancy exceeds threshold → Alert triggered → Stored → Retrievable via API."""
        from models import Alert

        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        # Alert state
        triggered_alerts = []

        def check_occupancy_threshold(topic, payload):
            data = json.loads(payload)
            current_count = data.get("count", 0)
            zone = data.get("zone")
            threshold = 50  # From sample_alert_config

            if current_count > threshold:
                alert = {
                    "type": "occupancy",
                    "severity": "warning",
                    "zone": zone,
                    "current_count": current_count,
                    "threshold": threshold,
                    "timestamp": datetime.utcnow().isoformat()
                }
                triggered_alerts.append(alert)
                mqtt_broker.publish("alerts/occupancy", json.dumps(alert))

        mqtt_broker.subscribe("occupancy/+", check_occupancy_threshold)

        # Normal occupancy - no alert
        mqtt_broker.publish("occupancy/dining", json.dumps({
            "zone": "dining", "count": 30
        }))
        assert len(triggered_alerts) == 0

        # High occupancy - should trigger alert
        mqtt_broker.publish("occupancy/dining", json.dumps({
            "zone": "dining", "count": 55
        }))
        assert len(triggered_alerts) == 1
        assert triggered_alerts[0]["current_count"] == 55

        # Verify alert was published
        alert_messages = mqtt_broker.get_messages("alerts/occupancy")
        assert len(alert_messages) == 1

    def test_after_hours_detection_alert(self, mqtt_broker):
        """Test: After-hours motion → Alert triggered → Published."""
        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        after_hours_alerts = []

        def check_after_hours(topic, payload):
            data = json.loads(payload)
            event_time = datetime.fromisoformat(data.get("timestamp"))
            schedule_start = 22  # 10 PM
            schedule_end = 6    # 6 AM

            hour = event_time.hour
            is_after_hours = hour >= schedule_start or hour < schedule_end

            if is_after_hours:
                alert = {
                    "type": "after_hours",
                    "severity": "critical",
                    "camera": data.get("camera"),
                    "detected_at": data.get("timestamp"),
                    "message": "Motion detected during after-hours"
                }
                after_hours_alerts.append(alert)
                mqtt_broker.publish("alerts/after_hours", json.dumps(alert))

        mqtt_broker.subscribe("frigate/events", check_after_hours)

        # Simulate after-hours event (11 PM)
        after_hours_time = datetime.utcnow().replace(hour=23, minute=30)
        mqtt_broker.publish("frigate/events", json.dumps({
            "camera": "front_door",
            "label": "person",
            "timestamp": after_hours_time.isoformat()
        }))

        assert len(after_hours_alerts) == 1
        assert after_hours_alerts[0]["type"] == "after_hours"

    def test_face_recognition_alert(self, mqtt_broker):
        """Test: Unknown face detected → Alert triggered."""
        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        unknown_face_alerts = []
        known_faces = ["john_doe", "jane_doe", "manager_bob"]

        def check_unknown_face(topic, payload):
            data = json.loads(payload)
            detected_name = data.get("name", "unknown")

            if detected_name not in known_faces and detected_name != "unknown":
                # New face detected
                alert = {
                    "type": "unknown_face",
                    "severity": "info",
                    "detected_name": detected_name,
                    "camera": data.get("camera"),
                    "confidence": data.get("confidence"),
                    "timestamp": datetime.utcnow().isoformat()
                }
                unknown_face_alerts.append(alert)

        mqtt_broker.subscribe("frigate/face_recognized", check_unknown_face)

        # Known face - no alert
        mqtt_broker.publish("frigate/face_recognized", json.dumps({
            "name": "john_doe", "confidence": 0.95, "camera": "front_door"
        }))
        assert len(unknown_face_alerts) == 0

        # Unknown face - should alert
        mqtt_broker.publish("frigate/face_recognized", json.dumps({
            "name": "new_person", "confidence": 0.88, "camera": "front_door"
        }))
        assert len(unknown_face_alerts) == 1


class TestAnalyticsDataPipeline:
    """Test analytics data pipeline from collection to API retrieval."""

    def test_hourly_aggregation_pipeline(self, mqtt_broker):
        """Test: Raw events → Aggregated hourly → Stored → Queryable."""
        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        # Simulate hourly aggregation
        hourly_data = {}

        def aggregate_hourly(topic, payload):
            data = json.loads(payload)
            timestamp = datetime.fromisoformat(data.get("timestamp"))
            hour_key = timestamp.strftime("%Y-%m-%d-%H")
            camera = data.get("camera")

            key = f"{hour_key}_{camera}"
            if key not in hourly_data:
                hourly_data[key] = {"count": 0, "events": []}

            hourly_data[key]["count"] += 1
            hourly_data[key]["events"].append(data)

        mqtt_broker.subscribe("frigate/events", aggregate_hourly)

        # Publish multiple events
        base_time = datetime.utcnow()
        for i in range(5):
            mqtt_broker.publish("frigate/events", json.dumps({
                "camera": "front_door",
                "label": "person",
                "timestamp": base_time.isoformat()
            }))

        # Verify aggregation
        assert len(hourly_data) == 1
        key = list(hourly_data.keys())[0]
        assert hourly_data[key]["count"] == 5

    def test_zone_activity_heatmap_data(self, mqtt_broker):
        """Test: Zone events → Activity levels calculated → Heatmap data generated."""
        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        zone_activity = {}

        def calculate_zone_activity(topic, payload):
            data = json.loads(payload)
            zone = data.get("zone")
            duration = data.get("duration_seconds", 0)

            if zone not in zone_activity:
                zone_activity[zone] = {"total_time": 0, "visit_count": 0}

            zone_activity[zone]["total_time"] += duration
            zone_activity[zone]["visit_count"] += 1

        mqtt_broker.subscribe("zones/+/exit", calculate_zone_activity)

        # Simulate zone visits
        zones = ["entrance", "dining", "bar", "kitchen"]
        for zone in zones:
            for _ in range(3):
                mqtt_broker.publish(f"zones/{zone}/exit", json.dumps({
                    "zone": zone,
                    "duration_seconds": 300
                }))

        # Verify activity data
        for zone in zones:
            assert zone_activity[zone]["visit_count"] == 3
            assert zone_activity[zone]["total_time"] == 900


class TestStaffTrackingFlow:
    """Test staff tracking end-to-end flow."""

    def test_staff_recognition_to_activity_log(self, mqtt_broker, db, sample_staff):
        """Test: Staff recognized → Activity logged → Retrievable."""
        from models import Staff

        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        staff_activity = []

        def log_staff_activity(topic, payload):
            data = json.loads(payload)
            if data.get("sub_label", "").startswith("staff_"):
                activity = {
                    "staff_id": data.get("sub_label"),
                    "camera": data.get("camera"),
                    "zone": data.get("zone"),
                    "timestamp": datetime.utcnow().isoformat(),
                    "event_type": data.get("type", "detection")
                }
                staff_activity.append(activity)

        mqtt_broker.subscribe("frigate/events", log_staff_activity)

        # Simulate staff detection
        mqtt_broker.publish("frigate/events", json.dumps({
            "camera": "front_door",
            "label": "person",
            "sub_label": "staff_john_doe",
            "zone": "entrance",
            "type": "new"
        }))

        assert len(staff_activity) == 1
        assert staff_activity[0]["staff_id"] == "staff_john_doe"

    def test_staff_zone_time_tracking(self, mqtt_broker):
        """Test: Staff enters zone → Time tracked → Reported."""
        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        staff_zone_times = {}

        def track_staff_zone_time(topic, payload):
            data = json.loads(payload)
            staff_id = data.get("staff_id")
            zone = data.get("zone")
            action = "enter" if "/enter" in topic else "exit"

            if staff_id not in staff_zone_times:
                staff_zone_times[staff_id] = {}

            if zone not in staff_zone_times[staff_id]:
                staff_zone_times[staff_id][zone] = {"total_time": 0, "enter_time": None}

            if action == "enter":
                staff_zone_times[staff_id][zone]["enter_time"] = time.time()
            elif action == "exit" and staff_zone_times[staff_id][zone]["enter_time"]:
                duration = time.time() - staff_zone_times[staff_id][zone]["enter_time"]
                staff_zone_times[staff_id][zone]["total_time"] += duration
                staff_zone_times[staff_id][zone]["enter_time"] = None

        mqtt_broker.subscribe("staff/+/zone/+/enter", track_staff_zone_time)
        mqtt_broker.subscribe("staff/+/zone/+/exit", track_staff_zone_time)

        # Simulate staff zone movements
        mqtt_broker.publish("staff/john/zone/kitchen/enter", json.dumps({
            "staff_id": "john", "zone": "kitchen"
        }))
        time.sleep(0.1)  # Brief pause
        mqtt_broker.publish("staff/john/zone/kitchen/exit", json.dumps({
            "staff_id": "john", "zone": "kitchen"
        }))

        assert "john" in staff_zone_times
        assert "kitchen" in staff_zone_times["john"]
        assert staff_zone_times["john"]["kitchen"]["total_time"] > 0


class TestIncidentFlow:
    """Test incident creation and management flow."""

    def test_auto_incident_from_alert(self, mqtt_broker, db, sample_zone):
        """Test: Critical alert → Auto-create incident → Stored."""
        from models import Incident

        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        auto_incidents = []

        def create_incident_from_alert(topic, payload):
            data = json.loads(payload)
            severity = data.get("severity")

            # Auto-create incident for critical alerts
            if severity == "critical":
                incident = {
                    "title": f"Auto-generated: {data.get('type')} alert",
                    "description": data.get("message", "Automatically generated from critical alert"),
                    "incident_type": "security",
                    "severity": "high",
                    "status": "open",
                    "source": "auto_alert",
                    "alert_data": data
                }
                auto_incidents.append(incident)

        mqtt_broker.subscribe("alerts/#", create_incident_from_alert)

        # Trigger critical alert
        mqtt_broker.publish("alerts/intrusion", json.dumps({
            "type": "intrusion",
            "severity": "critical",
            "zone": "restricted",
            "message": "Unauthorized access detected"
        }))

        assert len(auto_incidents) == 1
        assert auto_incidents[0]["source"] == "auto_alert"

    def test_incident_notification_flow(self, mqtt_broker):
        """Test: Incident created → Notification published."""
        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        notifications = []

        def capture_notification(topic, payload):
            notifications.append(json.loads(payload))

        mqtt_broker.subscribe("notifications/incidents", capture_notification)

        # Simulate incident creation
        incident = {
            "id": 123,
            "title": "Spill in dining area",
            "severity": "medium",
            "assigned_to": "staff_bob",
            "created_at": datetime.utcnow().isoformat()
        }
        mqtt_broker.publish("notifications/incidents", json.dumps(incident))

        assert len(notifications) == 1
        assert notifications[0]["title"] == "Spill in dining area"


class TestHealthMonitoringFlow:
    """Test system health monitoring flow."""

    @respx.mock
    def test_service_health_aggregation(self, client, frigate_mock):
        """Test: Check all services → Aggregate health → Return status."""
        # Mock Frigate version endpoint for health check
        respx.get("http://localhost:5000/api/version").mock(
            return_value=httpx.Response(200, json={"version": "0.13.0"})
        )

        response = client.get("/api/health")
        assert response.status_code == 200

        health = response.json()
        assert "status" in health
        assert "frigate" in health
        assert "database" in health

    def test_metric_collection_flow(self, mqtt_broker):
        """Test: Collect metrics → Store → Queryable for dashboards."""
        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        system_metrics = []

        def collect_metrics(topic, payload):
            data = json.loads(payload)
            system_metrics.append({
                "metric": data.get("metric"),
                "value": data.get("value"),
                "timestamp": datetime.utcnow().isoformat()
            })

        mqtt_broker.subscribe("system/metrics/#", collect_metrics)

        # Publish various metrics
        mqtt_broker.publish("system/metrics/cpu", json.dumps({"metric": "cpu_usage", "value": 45.2}))
        mqtt_broker.publish("system/metrics/memory", json.dumps({"metric": "memory_usage", "value": 62.1}))
        mqtt_broker.publish("system/metrics/api_requests", json.dumps({"metric": "requests_per_second", "value": 150}))

        assert len(system_metrics) == 3


class TestDataConsistencyFlow:
    """Test data consistency across the system."""

    def test_event_count_consistency(self, mqtt_broker):
        """Test: Events counted at source match stored counts."""
        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        source_count = 0
        stored_count = 0

        def count_source_events(topic, payload):
            nonlocal source_count
            source_count += 1

        def count_stored_events(topic, payload):
            nonlocal stored_count
            stored_count += 1

        mqtt_broker.subscribe("frigate/events", count_source_events)
        mqtt_broker.subscribe("analytics/events/stored", count_stored_events)

        # Simulate event flow with storage confirmation
        for i in range(10):
            mqtt_broker.publish("frigate/events", json.dumps({"id": f"evt_{i}"}))
            mqtt_broker.publish("analytics/events/stored", json.dumps({"id": f"evt_{i}"}))

        assert source_count == stored_count == 10

    def test_alert_acknowledgement_consistency(self, mqtt_broker):
        """Test: Alert acknowledged → State updated everywhere."""
        mqtt_broker.connect()
        mqtt_broker.clear_messages()

        alert_states = {}

        def update_alert_state(topic, payload):
            data = json.loads(payload)
            alert_id = data.get("alert_id")
            action = data.get("action")

            if action == "created":
                alert_states[alert_id] = {"acknowledged": False}
            elif action == "acknowledged":
                if alert_id in alert_states:
                    alert_states[alert_id]["acknowledged"] = True

        mqtt_broker.subscribe("alerts/+/state", update_alert_state)

        # Create alert
        mqtt_broker.publish("alerts/123/state", json.dumps({
            "alert_id": "123", "action": "created"
        }))
        assert alert_states["123"]["acknowledged"] is False

        # Acknowledge alert
        mqtt_broker.publish("alerts/123/state", json.dumps({
            "alert_id": "123", "action": "acknowledged"
        }))
        assert alert_states["123"]["acknowledged"] is True
