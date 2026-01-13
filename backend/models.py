"""SQLAlchemy models for the analytics dashboard."""

from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Float, LargeBinary
from sqlalchemy.orm import relationship
from database import Base


class Staff(Base):
    """Staff member model."""
    __tablename__ = "staff"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    role = Column(String(50), nullable=False)  # e.g., "server", "manager", "host"
    badge_id = Column(String(50), unique=True, nullable=True)
    photo_path = Column(String(500), nullable=True)  # Path to face photo
    frigate_face_id = Column(String(100), nullable=True)  # Face ID in Frigate
    face_trained = Column(Boolean, default=False)  # Whether face is trained in Frigate
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Zone(Base):
    """Restaurant zone model (e.g., dining area, bar, kitchen)."""
    __tablename__ = "zones"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    zone_type = Column(String(50), nullable=False)  # "entry", "exit", "service", "restricted", "dining", "bar", "kitchen"
    capacity = Column(Integer, nullable=True)
    camera_ids = Column(String(500), nullable=True)  # Comma-separated camera IDs
    polygon = Column(String(2000), nullable=True)  # JSON array of [x,y] normalized coordinates (0-1)
    color = Column(String(20), nullable=True)  # Hex color for zone display
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Event(Base):
    """Detection event from Frigate."""
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    frigate_event_id = Column(String(100), unique=True, index=True)
    camera_id = Column(String(50), nullable=False)
    label = Column(String(50), nullable=False)  # "person", "car", etc.
    zone_id = Column(Integer, ForeignKey("zones.id"), nullable=True)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=True)
    score = Column(Float, nullable=True)
    thumbnail_path = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    zone = relationship("Zone", backref="events")


class Camera(Base):
    """Camera configuration and metadata."""
    __tablename__ = "cameras"

    id = Column(Integer, primary_key=True, index=True)
    camera_id = Column(String(50), unique=True, nullable=False)  # e.g., "cam_009"
    name = Column(String(100), nullable=True)  # Friendly name
    location = Column(String(200), nullable=True)
    zone_id = Column(Integer, ForeignKey("zones.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    zone = relationship("Zone", backref="cameras")


class AlertConfig(Base):
    """Alert configuration model."""
    __tablename__ = "alert_configs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    alert_type = Column(String(50), nullable=False)  # "occupancy", "wait_time", "after_hours", "zone_breach"
    severity = Column(String(20), default="warning")  # "info", "warning", "critical"
    threshold_value = Column(Float, nullable=True)  # e.g., max occupancy count
    threshold_operator = Column(String(10), default="gt")  # "gt", "lt", "eq", "gte", "lte"
    zone_id = Column(Integer, ForeignKey("zones.id"), nullable=True)
    camera_id = Column(String(50), nullable=True)
    is_enabled = Column(Boolean, default=True)
    notify_email = Column(Boolean, default=False)
    notify_webhook = Column(Boolean, default=False)
    webhook_url = Column(String(500), nullable=True)
    cooldown_minutes = Column(Integer, default=15)  # Min time between alerts
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    zone = relationship("Zone", backref="alert_configs")


class AfterHoursSchedule(Base):
    """After-hours schedule for alerts."""
    __tablename__ = "after_hours_schedules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    day_of_week = Column(Integer, nullable=False)  # 0=Monday, 6=Sunday
    start_hour = Column(Integer, nullable=False)  # 0-23
    start_minute = Column(Integer, default=0)
    end_hour = Column(Integer, nullable=False)  # 0-23
    end_minute = Column(Integer, default=0)
    is_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Alert(Base):
    """Alert history/log model."""
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(Integer, ForeignKey("alert_configs.id"), nullable=True)
    alert_type = Column(String(50), nullable=False)
    severity = Column(String(20), nullable=False)
    message = Column(String(500), nullable=False)
    details = Column(String(1000), nullable=True)  # JSON string with additional data
    camera_id = Column(String(50), nullable=True)
    zone_id = Column(Integer, ForeignKey("zones.id"), nullable=True)
    is_acknowledged = Column(Boolean, default=False)
    acknowledged_by = Column(String(100), nullable=True)
    acknowledged_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    config = relationship("AlertConfig", backref="alerts")
    zone = relationship("Zone", backref="alerts")


class User(Base):
    """User model for authentication."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(100), unique=True, nullable=True)
    display_name = Column(String(100), nullable=True)
    hashed_password = Column(String(200), nullable=False)
    role = Column(String(20), default="viewer")  # "admin", "manager", "viewer"
    is_active = Column(Boolean, default=True)
    photo_path = Column(String(500), nullable=True)
    notify_email = Column(Boolean, default=True)
    notify_in_app = Column(Boolean, default=True)
    notify_alerts = Column(Boolean, default=True)
    notify_reports = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)


class AuditLog(Base):
    """Audit log for tracking changes."""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    username = Column(String(50), nullable=True)
    action = Column(String(50), nullable=False)  # "create", "update", "delete", "login", "logout"
    resource_type = Column(String(50), nullable=False)  # "user", "staff", "alert", "settings", etc.
    resource_id = Column(String(50), nullable=True)
    details = Column(String(1000), nullable=True)  # JSON with old/new values
    ip_address = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", backref="audit_logs")


class BusinessHours(Base):
    """Business hours configuration per day."""
    __tablename__ = "business_hours"

    id = Column(Integer, primary_key=True, index=True)
    day_of_week = Column(Integer, nullable=False)  # 0=Monday, 6=Sunday
    is_open = Column(Boolean, default=True)
    open_hour = Column(Integer, default=9)
    open_minute = Column(Integer, default=0)
    close_hour = Column(Integer, default=22)
    close_minute = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AppSettings(Base):
    """Application-wide settings."""
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(String(1000), nullable=True)
    value_type = Column(String(20), default="string")  # "string", "int", "float", "bool", "json"
    category = Column(String(50), nullable=True)  # "thresholds", "email", "retention", etc.
    description = Column(String(500), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)


class ScheduledReport(Base):
    """Scheduled report configuration."""
    __tablename__ = "scheduled_reports"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    report_type = Column(String(50), nullable=False)  # "daily_summary", "staff_performance", "customer_trends"
    schedule = Column(String(20), nullable=False)  # "daily", "weekly", "monthly"
    day_of_week = Column(Integer, nullable=True)  # 0=Monday for weekly reports
    day_of_month = Column(Integer, nullable=True)  # 1-28 for monthly reports
    hour = Column(Integer, default=8)  # Hour to send (24-hour)
    email_recipients = Column(String(1000), nullable=True)  # Comma-separated emails
    is_enabled = Column(Boolean, default=True)
    last_run = Column(DateTime, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    creator = relationship("User", backref="scheduled_reports")


class ShiftSummary(Base):
    """Shift summary model for end-of-shift reports."""
    __tablename__ = "shift_summaries"

    id = Column(Integer, primary_key=True, index=True)
    shift_date = Column(DateTime, nullable=False)
    shift_type = Column(String(20), nullable=False)  # "morning", "afternoon", "evening"
    start_time = Column(String(10), nullable=False)
    end_time = Column(String(10), nullable=False)
    total_customers = Column(Integer, default=0)
    peak_hour = Column(String(20), nullable=True)
    peak_occupancy = Column(Integer, default=0)
    avg_wait_time = Column(Float, default=0.0)
    table_turnovers = Column(Integer, default=0)
    incidents_count = Column(Integer, default=0)
    revenue_estimate = Column(Float, default=0.0)
    staff_count = Column(Integer, default=0)
    notes = Column(String(1000), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Incident(Base):
    """Incident log model for tracking issues."""
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(String(2000), nullable=True)
    incident_type = Column(String(50), nullable=False)  # "complaint", "spill", "theft", "equipment", "safety", "other"
    severity = Column(String(20), default="medium")  # "low", "medium", "high", "critical"
    status = Column(String(20), default="open")  # "open", "investigating", "resolved"
    camera_id = Column(String(50), nullable=True)
    zone_id = Column(Integer, ForeignKey("zones.id"), nullable=True)
    location = Column(String(200), nullable=True)
    assigned_to = Column(Integer, ForeignKey("staff.id"), nullable=True)
    reported_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    frigate_event_id = Column(String(100), nullable=True)  # Link to Frigate event for clip
    clip_url = Column(String(500), nullable=True)
    snapshot_url = Column(String(500), nullable=True)
    resolution_notes = Column(String(1000), nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    resolved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    zone = relationship("Zone", backref="incidents")
    assigned_staff = relationship("Staff", backref="assigned_incidents", foreign_keys=[assigned_to])
    reporter = relationship("User", backref="reported_incidents", foreign_keys=[reported_by])
    resolver = relationship("User", backref="resolved_incidents", foreign_keys=[resolved_by])


class ShiftNote(Base):
    """Shift notes model for staff handoff communication."""
    __tablename__ = "shift_notes"

    id = Column(Integer, primary_key=True, index=True)
    content = Column(String(2000), nullable=False)
    category = Column(String(50), default="general")  # "maintenance", "customer", "inventory", "staff", "safety", "general"
    is_pinned = Column(Boolean, default=False)
    is_acknowledged = Column(Boolean, default=False)
    acknowledged_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    acknowledged_at = Column(DateTime, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    shift_date = Column(DateTime, nullable=False)
    shift_type = Column(String(20), nullable=True)  # "morning", "afternoon", "evening"
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    creator = relationship("User", backref="shift_notes", foreign_keys=[created_by])
    acknowledger = relationship("User", foreign_keys=[acknowledged_by])


class TrackedPerson(Base):
    """Tracked person for ReID across cameras."""
    __tablename__ = "tracked_persons"

    id = Column(Integer, primary_key=True, index=True)
    display_id = Column(String(10), unique=True, nullable=False)  # e.g., "A7", "B12"
    name = Column(String(100), nullable=True)  # Named customer (e.g., "Mike")
    is_regular = Column(Boolean, default=False)  # Regular customer flag
    notes = Column(String(500), nullable=True)  # Customer notes
    person_type = Column(String(20), default="visitor")  # "visitor", "regular", "staff"
    first_seen = Column(DateTime, default=datetime.utcnow)
    last_seen = Column(DateTime, default=datetime.utcnow)
    first_camera_id = Column(String(50), nullable=True)
    last_camera_id = Column(String(50), nullable=True)
    staff_id = Column(Integer, ForeignKey("staff.id"), nullable=True)  # If identified as staff
    is_customer = Column(Boolean, default=True)
    visit_count = Column(Integer, default=1)  # For repeat visitor tracking
    is_active = Column(Boolean, default=True)  # Currently in view
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    staff = relationship("Staff", backref="tracked_persons")
    embeddings = relationship("PersonEmbedding", back_populates="person", cascade="all, delete-orphan")


class PersonEmbedding(Base):
    """Appearance embedding for a tracked person."""
    __tablename__ = "person_embeddings"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("tracked_persons.id", ondelete="CASCADE"), nullable=False, index=True)
    embedding = Column(LargeBinary, nullable=False)  # Serialized numpy array
    camera_id = Column(String(50), nullable=True)  # Where captured
    confidence = Column(Float, default=1.0)  # Detection confidence
    is_verified = Column(Boolean, default=False)  # Manually verified (higher trust)
    created_at = Column(DateTime, default=datetime.utcnow)

    person = relationship("TrackedPerson", back_populates="embeddings")


class PersonSighting(Base):
    """Record of a person being seen on a camera."""
    __tablename__ = "person_sightings"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("tracked_persons.id", ondelete="CASCADE"), nullable=False, index=True)
    camera_id = Column(String(50), nullable=False, index=True)
    frigate_event_id = Column(String(100), nullable=True)
    zone_name = Column(String(100), nullable=True)
    enter_time = Column(DateTime, default=datetime.utcnow)
    exit_time = Column(DateTime, nullable=True)
    confidence = Column(Float, default=1.0)
    pose_state = Column(String(20), nullable=True)  # "seated", "standing", "unknown"
    created_at = Column(DateTime, default=datetime.utcnow)

    person = relationship("TrackedPerson", backref="sightings")


class StaffAppearanceEmbedding(Base):
    """Appearance embedding for staff (for ReID when face not visible)."""
    __tablename__ = "staff_appearance_embeddings"

    id = Column(Integer, primary_key=True, index=True)
    staff_id = Column(Integer, ForeignKey("staff.id", ondelete="CASCADE"), nullable=False, index=True)
    embedding = Column(LargeBinary, nullable=False)  # Serialized numpy array
    camera_id = Column(String(50), nullable=True)  # Where captured
    confidence = Column(Float, default=1.0)
    is_verified = Column(Boolean, default=True)  # Staff embeddings always verified
    created_at = Column(DateTime, default=datetime.utcnow)

    staff = relationship("Staff", backref="appearance_embeddings")


class NegativePair(Base):
    """Negative pair for ReID - two persons confirmed NOT to be the same."""
    __tablename__ = "negative_pairs"

    id = Column(Integer, primary_key=True, index=True)
    person_id_a = Column(Integer, ForeignKey("tracked_persons.id", ondelete="CASCADE"), nullable=False, index=True)
    person_id_b = Column(Integer, ForeignKey("tracked_persons.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    reason = Column(String(200), nullable=True)  # Why marked as different
    created_at = Column(DateTime, default=datetime.utcnow)

    person_a = relationship("TrackedPerson", foreign_keys=[person_id_a], backref="negative_pairs_as_a")
    person_b = relationship("TrackedPerson", foreign_keys=[person_id_b], backref="negative_pairs_as_b")
    creator = relationship("User", backref="created_negative_pairs")
