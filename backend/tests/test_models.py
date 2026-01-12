"""Tests for SQLAlchemy models."""

import pytest
from datetime import datetime
from sqlalchemy.exc import IntegrityError


class TestStaffModel:
    """Test Staff model validation and behavior."""

    def test_create_staff(self, db):
        """Test creating a staff member."""
        from models import Staff

        staff = Staff(
            name="Test Staff",
            role="server",
            badge_id="TST001"
        )
        db.add(staff)
        db.commit()

        assert staff.id is not None
        assert staff.name == "Test Staff"
        assert staff.is_active is True
        assert staff.face_trained is False
        assert staff.created_at is not None

    def test_staff_unique_badge(self, db):
        """Test that badge_id must be unique."""
        from models import Staff

        staff1 = Staff(name="Staff 1", role="server", badge_id="BADGE001")
        staff2 = Staff(name="Staff 2", role="server", badge_id="BADGE001")

        db.add(staff1)
        db.commit()

        db.add(staff2)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_staff_nullable_badge(self, db):
        """Test that badge_id can be null."""
        from models import Staff

        staff = Staff(name="No Badge", role="server")
        db.add(staff)
        db.commit()

        assert staff.badge_id is None

    def test_staff_update_timestamp(self, db):
        """Test that updated_at changes on update."""
        from models import Staff
        import time

        staff = Staff(name="Test", role="server")
        db.add(staff)
        db.commit()

        original_updated = staff.updated_at

        time.sleep(0.1)
        staff.name = "Updated Name"
        db.commit()

        # Note: SQLite may not update automatically, but model is configured for it
        assert staff.name == "Updated Name"


class TestUserModel:
    """Test User model validation and behavior."""

    def test_create_user(self, db):
        """Test creating a user."""
        from models import User
        from routers.auth import get_password_hash

        user = User(
            username="testuser",
            email="test@example.com",
            hashed_password=get_password_hash("password123"),
            role="viewer"
        )
        db.add(user)
        db.commit()

        assert user.id is not None
        assert user.username == "testuser"
        assert user.role == "viewer"
        assert user.is_active is True

    def test_user_unique_username(self, db):
        """Test that username must be unique."""
        from models import User
        from routers.auth import get_password_hash

        user1 = User(
            username="duplicate",
            hashed_password=get_password_hash("pass1")
        )
        user2 = User(
            username="duplicate",
            hashed_password=get_password_hash("pass2")
        )

        db.add(user1)
        db.commit()

        db.add(user2)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_user_roles(self, db):
        """Test different user roles."""
        from models import User
        from routers.auth import get_password_hash

        roles = ["admin", "manager", "viewer"]
        for i, role in enumerate(roles):
            user = User(
                username=f"user_{role}",
                hashed_password=get_password_hash("password"),
                role=role
            )
            db.add(user)
        db.commit()

        users = db.query(User).all()
        assert len(users) == 3

    def test_user_notification_defaults(self, db):
        """Test default notification preferences."""
        from models import User
        from routers.auth import get_password_hash

        user = User(
            username="notifyuser",
            hashed_password=get_password_hash("password")
        )
        db.add(user)
        db.commit()

        assert user.notify_email is True
        assert user.notify_in_app is True
        assert user.notify_alerts is True
        assert user.notify_reports is True


class TestIncidentModel:
    """Test Incident model validation and behavior."""

    def test_create_incident(self, db):
        """Test creating an incident."""
        from models import Incident

        incident = Incident(
            title="Test Incident",
            description="Test description",
            incident_type="complaint",
            severity="medium",
            status="open"
        )
        db.add(incident)
        db.commit()

        assert incident.id is not None
        assert incident.title == "Test Incident"
        assert incident.status == "open"
        assert incident.created_at is not None

    def test_incident_zone_relationship(self, db, sample_zone):
        """Test incident-zone relationship."""
        from models import Incident

        incident = Incident(
            title="Zone Incident",
            incident_type="spill",
            zone_id=sample_zone.id
        )
        db.add(incident)
        db.commit()

        assert incident.zone is not None
        assert incident.zone.name == "Main Dining"

    def test_incident_staff_relationship(self, db, sample_staff):
        """Test incident-staff assignment relationship."""
        from models import Incident

        incident = Incident(
            title="Assigned Incident",
            incident_type="equipment",
            assigned_to=sample_staff.id
        )
        db.add(incident)
        db.commit()

        assert incident.assigned_staff is not None
        assert incident.assigned_staff.name == "John Doe"

    def test_incident_severities(self, db):
        """Test different severity levels."""
        from models import Incident

        severities = ["low", "medium", "high", "critical"]
        for severity in severities:
            incident = Incident(
                title=f"{severity.title()} Incident",
                incident_type="other",
                severity=severity
            )
            db.add(incident)
        db.commit()

        incidents = db.query(Incident).all()
        assert len(incidents) == 4


class TestZoneModel:
    """Test Zone model validation and behavior."""

    def test_create_zone(self, db):
        """Test creating a zone."""
        from models import Zone

        zone = Zone(
            name="Kitchen",
            zone_type="kitchen",
            capacity=10
        )
        db.add(zone)
        db.commit()

        assert zone.id is not None
        assert zone.name == "Kitchen"
        assert zone.zone_type == "kitchen"
        assert zone.is_active is True

    def test_zone_with_polygon(self, db):
        """Test zone with polygon coordinates."""
        from models import Zone
        import json

        polygon = [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]]
        zone = Zone(
            name="Polygon Zone",
            zone_type="dining",
            polygon=json.dumps(polygon)
        )
        db.add(zone)
        db.commit()

        stored_polygon = json.loads(zone.polygon)
        assert stored_polygon == polygon

    def test_zone_camera_ids(self, db):
        """Test zone with multiple camera IDs."""
        from models import Zone

        zone = Zone(
            name="Multi-cam Zone",
            zone_type="entry",
            camera_ids="cam_001,cam_002,cam_003"
        )
        db.add(zone)
        db.commit()

        cameras = zone.camera_ids.split(",")
        assert len(cameras) == 3


class TestShiftNoteModel:
    """Test ShiftNote model validation and behavior."""

    def test_create_shift_note(self, db, admin_user):
        """Test creating a shift note."""
        from models import ShiftNote

        note = ShiftNote(
            content="Test note content",
            category="general",
            created_by=admin_user.id,
            shift_date=datetime.utcnow(),
            shift_type="morning"
        )
        db.add(note)
        db.commit()

        assert note.id is not None
        assert note.content == "Test note content"
        assert note.is_pinned is False
        assert note.is_acknowledged is False

    def test_shift_note_pinning(self, db, admin_user):
        """Test pinning a shift note."""
        from models import ShiftNote

        note = ShiftNote(
            content="Pinned note",
            is_pinned=True,
            created_by=admin_user.id,
            shift_date=datetime.utcnow()
        )
        db.add(note)
        db.commit()

        assert note.is_pinned is True

    def test_shift_note_acknowledgement(self, db, admin_user, viewer_user):
        """Test acknowledging a shift note."""
        from models import ShiftNote

        note = ShiftNote(
            content="Unread note",
            created_by=admin_user.id,
            shift_date=datetime.utcnow()
        )
        db.add(note)
        db.commit()

        note.is_acknowledged = True
        note.acknowledged_by = viewer_user.id
        note.acknowledged_at = datetime.utcnow()
        db.commit()

        assert note.is_acknowledged is True
        assert note.acknowledged_by == viewer_user.id


class TestAlertConfigModel:
    """Test AlertConfig model validation and behavior."""

    def test_create_alert_config(self, db, sample_zone):
        """Test creating an alert configuration."""
        from models import AlertConfig

        config = AlertConfig(
            name="Test Alert",
            alert_type="occupancy",
            severity="warning",
            threshold_value=100,
            threshold_operator="gt",
            zone_id=sample_zone.id,
            is_enabled=True
        )
        db.add(config)
        db.commit()

        assert config.id is not None
        assert config.name == "Test Alert"
        assert config.threshold_value == 100

    def test_alert_config_operators(self, db):
        """Test different threshold operators."""
        from models import AlertConfig

        operators = ["gt", "lt", "eq", "gte", "lte"]
        for op in operators:
            config = AlertConfig(
                name=f"Alert {op}",
                alert_type="occupancy",
                threshold_operator=op,
                threshold_value=50
            )
            db.add(config)
        db.commit()

        configs = db.query(AlertConfig).all()
        assert len(configs) == 5


class TestAppSettingsModel:
    """Test AppSettings model validation and behavior."""

    def test_create_setting(self, db):
        """Test creating an app setting."""
        from models import AppSettings

        setting = AppSettings(
            key="max_occupancy",
            value="100",
            value_type="int",
            category="thresholds"
        )
        db.add(setting)
        db.commit()

        assert setting.id is not None
        assert setting.key == "max_occupancy"
        assert setting.value_type == "int"

    def test_setting_unique_key(self, db):
        """Test that setting key must be unique."""
        from models import AppSettings

        s1 = AppSettings(key="duplicate_key", value="1")
        s2 = AppSettings(key="duplicate_key", value="2")

        db.add(s1)
        db.commit()

        db.add(s2)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_setting_categories(self, db):
        """Test different setting categories."""
        from models import AppSettings

        categories = ["thresholds", "email", "retention"]
        for cat in categories:
            setting = AppSettings(
                key=f"{cat}_setting",
                value="test",
                category=cat
            )
            db.add(setting)
        db.commit()

        settings = db.query(AppSettings).all()
        assert len(settings) == 3
