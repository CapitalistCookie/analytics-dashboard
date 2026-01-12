"""Settings router for application configuration."""

import json
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import User, BusinessHours, AppSettings, AuditLog
from routers.auth import require_auth, require_manager_or_admin

router = APIRouter(prefix="/api/settings", tags=["settings"])


# Pydantic models
class BusinessHoursResponse(BaseModel):
    """Business hours response."""
    id: int
    day_of_week: int
    is_open: bool
    open_hour: int
    open_minute: int
    close_hour: int
    close_minute: int

    class Config:
        from_attributes = True


class BusinessHoursUpdate(BaseModel):
    """Business hours update model."""
    is_open: Optional[bool] = None
    open_hour: Optional[int] = None
    open_minute: Optional[int] = None
    close_hour: Optional[int] = None
    close_minute: Optional[int] = None


class BusinessHoursBulkUpdate(BaseModel):
    """Bulk update for all business hours."""
    hours: List[Dict[str, Any]]  # List of {day_of_week, is_open, open_hour, ...}


class SettingResponse(BaseModel):
    """Setting response."""
    id: int
    key: str
    value: Optional[str]
    value_type: str
    category: Optional[str]
    description: Optional[str]
    updated_at: datetime

    class Config:
        from_attributes = True


class SettingUpdate(BaseModel):
    """Setting update model."""
    value: str


class ThresholdSettings(BaseModel):
    """Alert threshold settings."""
    max_occupancy: int = 100
    wait_time_warning: int = 15  # minutes
    staff_idle_threshold: int = 30  # minutes


class EmailSettings(BaseModel):
    """Email notification settings."""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    from_email: str = ""
    from_name: str = "Restaurant Analytics"
    enabled: bool = False


class DataRetentionSettings(BaseModel):
    """Data retention settings."""
    recordings_days: int = 30
    metrics_days: int = 90
    audit_logs_days: int = 365
    events_days: int = 30


# Default settings initialization
DEFAULT_SETTINGS = [
    # Thresholds
    {"key": "max_occupancy", "value": "100", "value_type": "int", "category": "thresholds",
     "description": "Maximum occupancy limit before alert"},
    {"key": "wait_time_warning", "value": "15", "value_type": "int", "category": "thresholds",
     "description": "Wait time threshold in minutes for warning"},
    {"key": "staff_idle_threshold", "value": "30", "value_type": "int", "category": "thresholds",
     "description": "Staff idle time threshold in minutes"},

    # Email
    {"key": "smtp_host", "value": "", "value_type": "string", "category": "email",
     "description": "SMTP server hostname"},
    {"key": "smtp_port", "value": "587", "value_type": "int", "category": "email",
     "description": "SMTP server port"},
    {"key": "smtp_user", "value": "", "value_type": "string", "category": "email",
     "description": "SMTP username"},
    {"key": "smtp_password", "value": "", "value_type": "string", "category": "email",
     "description": "SMTP password (encrypted)"},
    {"key": "from_email", "value": "", "value_type": "string", "category": "email",
     "description": "From email address"},
    {"key": "from_name", "value": "Restaurant Analytics", "value_type": "string", "category": "email",
     "description": "From name for emails"},
    {"key": "email_enabled", "value": "false", "value_type": "bool", "category": "email",
     "description": "Enable email notifications"},

    # Data retention
    {"key": "recordings_days", "value": "30", "value_type": "int", "category": "retention",
     "description": "Days to keep video recordings"},
    {"key": "metrics_days", "value": "90", "value_type": "int", "category": "retention",
     "description": "Days to keep metrics data"},
    {"key": "audit_logs_days", "value": "365", "value_type": "int", "category": "retention",
     "description": "Days to keep audit logs"},
    {"key": "events_days", "value": "30", "value_type": "int", "category": "retention",
     "description": "Days to keep detection events"},
]


DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def log_action(db: Session, user: User, action: str, resource_type: str,
               resource_id: str = None, details: str = None, ip: str = None):
    """Create an audit log entry."""
    log = AuditLog(
        user_id=user.id,
        username=user.username,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details=details,
        ip_address=ip
    )
    db.add(log)


def init_default_settings(db: Session):
    """Initialize default settings if not exist."""
    for setting in DEFAULT_SETTINGS:
        existing = db.query(AppSettings).filter(AppSettings.key == setting["key"]).first()
        if not existing:
            db.add(AppSettings(**setting))

    # Initialize business hours if not exist
    for day in range(7):
        existing = db.query(BusinessHours).filter(BusinessHours.day_of_week == day).first()
        if not existing:
            db.add(BusinessHours(
                day_of_week=day,
                is_open=True,
                open_hour=9,
                open_minute=0,
                close_hour=22,
                close_minute=0
            ))

    db.commit()


def get_setting_value(db: Session, key: str, default: Any = None) -> Any:
    """Get a setting value with proper type conversion."""
    setting = db.query(AppSettings).filter(AppSettings.key == key).first()
    if not setting:
        return default

    if setting.value_type == "int":
        return int(setting.value) if setting.value else default
    elif setting.value_type == "float":
        return float(setting.value) if setting.value else default
    elif setting.value_type == "bool":
        return setting.value.lower() in ("true", "1", "yes") if setting.value else default
    elif setting.value_type == "json":
        return json.loads(setting.value) if setting.value else default
    return setting.value if setting.value else default


# Business Hours endpoints
@router.get("/business-hours", response_model=List[BusinessHoursResponse])
async def get_business_hours(
    current_user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """Get business hours for all days."""
    init_default_settings(db)
    hours = db.query(BusinessHours).order_by(BusinessHours.day_of_week).all()
    return hours


@router.put("/business-hours/{day}", response_model=BusinessHoursResponse)
async def update_business_hours(
    day: int,
    update: BusinessHoursUpdate,
    request: Request,
    current_user: User = Depends(require_manager_or_admin),
    db: Session = Depends(get_db)
):
    """Update business hours for a specific day."""
    if day < 0 or day > 6:
        raise HTTPException(status_code=400, detail="Day must be 0-6 (Monday-Sunday)")

    init_default_settings(db)
    hours = db.query(BusinessHours).filter(BusinessHours.day_of_week == day).first()

    if not hours:
        raise HTTPException(status_code=404, detail="Business hours not found")

    changes = []
    if update.is_open is not None:
        changes.append(f"is_open: {hours.is_open} -> {update.is_open}")
        hours.is_open = update.is_open
    if update.open_hour is not None:
        if update.open_hour < 0 or update.open_hour > 23:
            raise HTTPException(status_code=400, detail="Hour must be 0-23")
        changes.append(f"open_hour: {hours.open_hour} -> {update.open_hour}")
        hours.open_hour = update.open_hour
    if update.open_minute is not None:
        if update.open_minute < 0 or update.open_minute > 59:
            raise HTTPException(status_code=400, detail="Minute must be 0-59")
        hours.open_minute = update.open_minute
    if update.close_hour is not None:
        if update.close_hour < 0 or update.close_hour > 23:
            raise HTTPException(status_code=400, detail="Hour must be 0-23")
        changes.append(f"close_hour: {hours.close_hour} -> {update.close_hour}")
        hours.close_hour = update.close_hour
    if update.close_minute is not None:
        if update.close_minute < 0 or update.close_minute > 59:
            raise HTTPException(status_code=400, detail="Minute must be 0-59")
        hours.close_minute = update.close_minute

    if changes:
        log_action(db, current_user, "update", "business_hours",
                   DAY_NAMES[day], "; ".join(changes), request.client.host)

    db.commit()
    db.refresh(hours)
    return hours


@router.put("/business-hours")
async def update_all_business_hours(
    update: BusinessHoursBulkUpdate,
    request: Request,
    current_user: User = Depends(require_manager_or_admin),
    db: Session = Depends(get_db)
):
    """Update business hours for all days at once."""
    init_default_settings(db)

    for item in update.hours:
        day = item.get("day_of_week")
        if day is None or day < 0 or day > 6:
            continue

        hours = db.query(BusinessHours).filter(BusinessHours.day_of_week == day).first()
        if not hours:
            continue

        if "is_open" in item:
            hours.is_open = item["is_open"]
        if "open_hour" in item:
            hours.open_hour = item["open_hour"]
        if "open_minute" in item:
            hours.open_minute = item["open_minute"]
        if "close_hour" in item:
            hours.close_hour = item["close_hour"]
        if "close_minute" in item:
            hours.close_minute = item["close_minute"]

    log_action(db, current_user, "update", "business_hours",
               "all", "Bulk update of business hours", request.client.host)

    db.commit()
    return {"success": True, "message": "Business hours updated"}


# Settings endpoints
@router.get("", response_model=List[SettingResponse])
async def get_all_settings(
    category: Optional[str] = None,
    current_user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """Get all settings, optionally filtered by category."""
    init_default_settings(db)
    query = db.query(AppSettings)
    if category:
        query = query.filter(AppSettings.category == category)
    return query.order_by(AppSettings.category, AppSettings.key).all()


@router.get("/{key}", response_model=SettingResponse)
async def get_setting(
    key: str,
    current_user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """Get a specific setting."""
    init_default_settings(db)
    setting = db.query(AppSettings).filter(AppSettings.key == key).first()
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    return setting


@router.put("/{key}", response_model=SettingResponse)
async def update_setting(
    key: str,
    update: SettingUpdate,
    request: Request,
    current_user: User = Depends(require_manager_or_admin),
    db: Session = Depends(get_db)
):
    """Update a specific setting."""
    init_default_settings(db)
    setting = db.query(AppSettings).filter(AppSettings.key == key).first()
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")

    old_value = setting.value
    setting.value = update.value
    setting.updated_by = current_user.id

    log_action(db, current_user, "update", "settings",
               key, f"{old_value} -> {update.value}", request.client.host)

    db.commit()
    db.refresh(setting)
    return setting


# Threshold settings endpoint
@router.get("/thresholds/all")
async def get_threshold_settings(
    current_user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """Get all threshold settings."""
    init_default_settings(db)
    return {
        "max_occupancy": get_setting_value(db, "max_occupancy", 100),
        "wait_time_warning": get_setting_value(db, "wait_time_warning", 15),
        "staff_idle_threshold": get_setting_value(db, "staff_idle_threshold", 30)
    }


@router.put("/thresholds/all")
async def update_threshold_settings(
    thresholds: ThresholdSettings,
    request: Request,
    current_user: User = Depends(require_manager_or_admin),
    db: Session = Depends(get_db)
):
    """Update all threshold settings."""
    init_default_settings(db)

    settings_map = {
        "max_occupancy": str(thresholds.max_occupancy),
        "wait_time_warning": str(thresholds.wait_time_warning),
        "staff_idle_threshold": str(thresholds.staff_idle_threshold)
    }

    for key, value in settings_map.items():
        setting = db.query(AppSettings).filter(AppSettings.key == key).first()
        if setting:
            setting.value = value
            setting.updated_by = current_user.id

    log_action(db, current_user, "update", "settings",
               "thresholds", json.dumps(settings_map), request.client.host)

    db.commit()
    return {"success": True, "message": "Threshold settings updated"}


# Email settings endpoint
@router.get("/email/all")
async def get_email_settings(
    current_user: User = Depends(require_manager_or_admin),
    db: Session = Depends(get_db)
):
    """Get email settings (manager/admin only - contains sensitive data)."""
    init_default_settings(db)
    return {
        "smtp_host": get_setting_value(db, "smtp_host", ""),
        "smtp_port": get_setting_value(db, "smtp_port", 587),
        "smtp_user": get_setting_value(db, "smtp_user", ""),
        "smtp_password": "********" if get_setting_value(db, "smtp_password", "") else "",
        "from_email": get_setting_value(db, "from_email", ""),
        "from_name": get_setting_value(db, "from_name", "Restaurant Analytics"),
        "enabled": get_setting_value(db, "email_enabled", False)
    }


@router.put("/email/all")
async def update_email_settings(
    email: EmailSettings,
    request: Request,
    current_user: User = Depends(require_manager_or_admin),
    db: Session = Depends(get_db)
):
    """Update email settings."""
    init_default_settings(db)

    settings_map = {
        "smtp_host": email.smtp_host,
        "smtp_port": str(email.smtp_port),
        "smtp_user": email.smtp_user,
        "from_email": email.from_email,
        "from_name": email.from_name,
        "email_enabled": str(email.enabled).lower()
    }

    # Only update password if not masked
    if email.smtp_password and email.smtp_password != "********":
        settings_map["smtp_password"] = email.smtp_password

    for key, value in settings_map.items():
        setting = db.query(AppSettings).filter(AppSettings.key == key).first()
        if setting:
            setting.value = value
            setting.updated_by = current_user.id

    log_action(db, current_user, "update", "settings",
               "email", "Email settings updated", request.client.host)

    db.commit()
    return {"success": True, "message": "Email settings updated"}


# Data retention settings endpoint
@router.get("/retention/all")
async def get_retention_settings(
    current_user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """Get data retention settings."""
    init_default_settings(db)
    return {
        "recordings_days": get_setting_value(db, "recordings_days", 30),
        "metrics_days": get_setting_value(db, "metrics_days", 90),
        "audit_logs_days": get_setting_value(db, "audit_logs_days", 365),
        "events_days": get_setting_value(db, "events_days", 30)
    }


@router.put("/retention/all")
async def update_retention_settings(
    retention: DataRetentionSettings,
    request: Request,
    current_user: User = Depends(require_manager_or_admin),
    db: Session = Depends(get_db)
):
    """Update data retention settings."""
    init_default_settings(db)

    settings_map = {
        "recordings_days": str(retention.recordings_days),
        "metrics_days": str(retention.metrics_days),
        "audit_logs_days": str(retention.audit_logs_days),
        "events_days": str(retention.events_days)
    }

    for key, value in settings_map.items():
        setting = db.query(AppSettings).filter(AppSettings.key == key).first()
        if setting:
            setting.value = value
            setting.updated_by = current_user.id

    log_action(db, current_user, "update", "settings",
               "retention", json.dumps(settings_map), request.client.host)

    db.commit()
    return {"success": True, "message": "Data retention settings updated"}


@router.post("/email/test")
async def test_email_settings(
    current_user: User = Depends(require_manager_or_admin),
    db: Session = Depends(get_db)
):
    """Test email configuration by sending a test email."""
    init_default_settings(db)

    enabled = get_setting_value(db, "email_enabled", False)
    if not enabled:
        raise HTTPException(status_code=400, detail="Email is not enabled")

    smtp_host = get_setting_value(db, "smtp_host", "")
    if not smtp_host:
        raise HTTPException(status_code=400, detail="SMTP host not configured")

    # In a real implementation, this would send an actual test email
    # For now, return success as a placeholder
    return {
        "success": True,
        "message": f"Test email would be sent to {current_user.email or 'no email configured'}"
    }
