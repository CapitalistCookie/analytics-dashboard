"""Alerts router for alert configuration and history."""

import json
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import Alert, AlertConfig, AfterHoursSchedule

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


# Pydantic models
# TODO(feature): Implement email notification system
# - Add SMTP configuration (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS env vars)
# - Create async send_email_notification() function in services/notification_service.py
# - Support HTML templates for alert emails
# - Implement notification batching for high-frequency alerts

# TODO(feature): Implement webhook notification system
# - Create async send_webhook_notification() function
# - Support retry logic with exponential backoff (3 retries)
# - Log webhook delivery status and response codes
# - Validate webhook URLs on config creation

class AlertConfigCreate(BaseModel):
    """Create alert configuration."""
    name: str = Field(..., min_length=1, max_length=100)
    alert_type: str = Field(..., pattern="^(occupancy|wait_time|after_hours|zone_breach)$")
    severity: str = Field(default="warning", pattern="^(info|warning|critical)$")
    threshold_value: Optional[float] = None
    threshold_operator: str = Field(default="gt", pattern="^(gt|lt|eq|gte|lte)$")
    zone_id: Optional[int] = None
    camera_id: Optional[str] = None
    is_enabled: bool = True
    notify_email: bool = False  # TODO: Wire up to notification_service.send_email_notification()
    notify_webhook: bool = False  # TODO: Wire up to notification_service.send_webhook_notification()
    webhook_url: Optional[str] = None
    cooldown_minutes: int = Field(default=15, ge=1, le=1440)


class AlertConfigUpdate(BaseModel):
    """Update alert configuration."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    severity: Optional[str] = Field(None, pattern="^(info|warning|critical)$")
    threshold_value: Optional[float] = None
    threshold_operator: Optional[str] = Field(None, pattern="^(gt|lt|eq|gte|lte)$")
    zone_id: Optional[int] = None
    camera_id: Optional[str] = None
    is_enabled: Optional[bool] = None
    notify_email: Optional[bool] = None
    notify_webhook: Optional[bool] = None
    webhook_url: Optional[str] = None
    cooldown_minutes: Optional[int] = Field(None, ge=1, le=1440)


class AlertConfigResponse(BaseModel):
    """Alert configuration response."""
    id: int
    name: str
    alert_type: str
    severity: str
    threshold_value: Optional[float]
    threshold_operator: str
    zone_id: Optional[int]
    camera_id: Optional[str]
    is_enabled: bool
    notify_email: bool
    notify_webhook: bool
    webhook_url: Optional[str]
    cooldown_minutes: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ScheduleCreate(BaseModel):
    """Create after-hours schedule."""
    name: str = Field(..., min_length=1, max_length=100)
    day_of_week: int = Field(..., ge=0, le=6)
    start_hour: int = Field(..., ge=0, le=23)
    start_minute: int = Field(default=0, ge=0, le=59)
    end_hour: int = Field(..., ge=0, le=23)
    end_minute: int = Field(default=0, ge=0, le=59)
    is_enabled: bool = True


class ScheduleResponse(BaseModel):
    """Schedule response."""
    id: int
    name: str
    day_of_week: int
    start_hour: int
    start_minute: int
    end_hour: int
    end_minute: int
    is_enabled: bool
    created_at: datetime

    class Config:
        from_attributes = True


class AlertResponse(BaseModel):
    """Alert log response."""
    id: int
    config_id: Optional[int]
    alert_type: str
    severity: str
    message: str
    details: Optional[dict] = None
    camera_id: Optional[str]
    zone_id: Optional[int]
    is_acknowledged: bool
    acknowledged_by: Optional[str]
    acknowledged_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class AlertCreate(BaseModel):
    """Create alert manually (for testing)."""
    alert_type: str
    severity: str = "warning"
    message: str
    details: Optional[dict] = None
    camera_id: Optional[str] = None
    zone_id: Optional[int] = None


# ============== Alert Configurations ==============

@router.get("/configs", response_model=list[AlertConfigResponse])
async def list_alert_configs(
    alert_type: Optional[str] = None,
    is_enabled: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    """List all alert configurations."""
    query = db.query(AlertConfig)

    if alert_type:
        query = query.filter(AlertConfig.alert_type == alert_type)
    if is_enabled is not None:
        query = query.filter(AlertConfig.is_enabled == is_enabled)

    return query.order_by(AlertConfig.created_at.desc()).all()


@router.post("/configs", response_model=AlertConfigResponse, status_code=201)
async def create_alert_config(config: AlertConfigCreate, db: Session = Depends(get_db)):
    """Create a new alert configuration."""
    db_config = AlertConfig(**config.model_dump())
    db.add(db_config)
    db.commit()
    db.refresh(db_config)
    return db_config


@router.get("/configs/{config_id}", response_model=AlertConfigResponse)
async def get_alert_config(config_id: int, db: Session = Depends(get_db)):
    """Get a specific alert configuration."""
    config = db.query(AlertConfig).filter(AlertConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Alert config not found")
    return config


@router.put("/configs/{config_id}", response_model=AlertConfigResponse)
async def update_alert_config(
    config_id: int,
    update: AlertConfigUpdate,
    db: Session = Depends(get_db)
):
    """Update an alert configuration."""
    config = db.query(AlertConfig).filter(AlertConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Alert config not found")

    update_data = update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(config, key, value)

    config.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(config)
    return config


@router.delete("/configs/{config_id}")
async def delete_alert_config(config_id: int, db: Session = Depends(get_db)):
    """Delete an alert configuration."""
    config = db.query(AlertConfig).filter(AlertConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Alert config not found")

    db.delete(config)
    db.commit()
    return {"success": True, "message": f"Alert config {config_id} deleted"}


@router.post("/configs/{config_id}/toggle", response_model=AlertConfigResponse)
async def toggle_alert_config(config_id: int, db: Session = Depends(get_db)):
    """Toggle an alert configuration's enabled state."""
    config = db.query(AlertConfig).filter(AlertConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Alert config not found")

    config.is_enabled = not config.is_enabled
    config.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(config)
    return config


# ============== After-Hours Schedules ==============

@router.get("/schedules", response_model=list[ScheduleResponse])
async def list_schedules(db: Session = Depends(get_db)):
    """List all after-hours schedules."""
    return db.query(AfterHoursSchedule).order_by(
        AfterHoursSchedule.day_of_week,
        AfterHoursSchedule.start_hour
    ).all()


@router.post("/schedules", response_model=ScheduleResponse, status_code=201)
async def create_schedule(schedule: ScheduleCreate, db: Session = Depends(get_db)):
    """Create a new after-hours schedule."""
    db_schedule = AfterHoursSchedule(**schedule.model_dump())
    db.add(db_schedule)
    db.commit()
    db.refresh(db_schedule)
    return db_schedule


@router.get("/schedules/{schedule_id}", response_model=ScheduleResponse)
async def get_schedule(schedule_id: int, db: Session = Depends(get_db)):
    """Get a specific schedule."""
    schedule = db.query(AfterHoursSchedule).filter(AfterHoursSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return schedule


@router.delete("/schedules/{schedule_id}")
async def delete_schedule(schedule_id: int, db: Session = Depends(get_db)):
    """Delete a schedule."""
    schedule = db.query(AfterHoursSchedule).filter(AfterHoursSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    db.delete(schedule)
    db.commit()
    return {"success": True, "message": f"Schedule {schedule_id} deleted"}


@router.post("/schedules/{schedule_id}/toggle", response_model=ScheduleResponse)
async def toggle_schedule(schedule_id: int, db: Session = Depends(get_db)):
    """Toggle a schedule's enabled state."""
    schedule = db.query(AfterHoursSchedule).filter(AfterHoursSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    schedule.is_enabled = not schedule.is_enabled
    db.commit()
    db.refresh(schedule)
    return schedule


# ============== Alert History ==============

@router.get("", response_model=list[AlertResponse])
async def list_alerts(
    severity: Optional[str] = None,
    alert_type: Optional[str] = None,
    is_acknowledged: Optional[bool] = None,
    hours: int = Query(default=24, ge=1, le=720),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db)
):
    """List alert history."""
    query = db.query(Alert)

    # Time filter
    since = datetime.utcnow() - timedelta(hours=hours)
    query = query.filter(Alert.created_at >= since)

    if severity:
        query = query.filter(Alert.severity == severity)
    if alert_type:
        query = query.filter(Alert.alert_type == alert_type)
    if is_acknowledged is not None:
        query = query.filter(Alert.is_acknowledged == is_acknowledged)

    alerts = query.order_by(Alert.created_at.desc()).limit(limit).all()

    # Parse JSON details
    result = []
    for alert in alerts:
        alert_dict = {
            "id": alert.id,
            "config_id": alert.config_id,
            "alert_type": alert.alert_type,
            "severity": alert.severity,
            "message": alert.message,
            "details": json.loads(alert.details) if alert.details else None,
            "camera_id": alert.camera_id,
            "zone_id": alert.zone_id,
            "is_acknowledged": alert.is_acknowledged,
            "acknowledged_by": alert.acknowledged_by,
            "acknowledged_at": alert.acknowledged_at,
            "created_at": alert.created_at
        }
        result.append(alert_dict)

    return result


@router.post("", response_model=AlertResponse, status_code=201)
async def create_alert(alert: AlertCreate, db: Session = Depends(get_db)):
    """Create a new alert (for testing or manual alerts)."""
    db_alert = Alert(
        alert_type=alert.alert_type,
        severity=alert.severity,
        message=alert.message,
        details=json.dumps(alert.details) if alert.details else None,
        camera_id=alert.camera_id,
        zone_id=alert.zone_id
    )
    db.add(db_alert)
    db.commit()
    db.refresh(db_alert)

    return {
        "id": db_alert.id,
        "config_id": db_alert.config_id,
        "alert_type": db_alert.alert_type,
        "severity": db_alert.severity,
        "message": db_alert.message,
        "details": json.loads(db_alert.details) if db_alert.details else None,
        "camera_id": db_alert.camera_id,
        "zone_id": db_alert.zone_id,
        "is_acknowledged": db_alert.is_acknowledged,
        "acknowledged_by": db_alert.acknowledged_by,
        "acknowledged_at": db_alert.acknowledged_at,
        "created_at": db_alert.created_at
    }


@router.get("/{alert_id}", response_model=AlertResponse)
async def get_alert(alert_id: int, db: Session = Depends(get_db)):
    """Get a specific alert."""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    return {
        "id": alert.id,
        "config_id": alert.config_id,
        "alert_type": alert.alert_type,
        "severity": alert.severity,
        "message": alert.message,
        "details": json.loads(alert.details) if alert.details else None,
        "camera_id": alert.camera_id,
        "zone_id": alert.zone_id,
        "is_acknowledged": alert.is_acknowledged,
        "acknowledged_by": alert.acknowledged_by,
        "acknowledged_at": alert.acknowledged_at,
        "created_at": alert.created_at
    }


@router.post("/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: int,
    acknowledged_by: str = Query(default="admin"),
    db: Session = Depends(get_db)
):
    """Acknowledge an alert."""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.is_acknowledged = True
    alert.acknowledged_by = acknowledged_by
    alert.acknowledged_at = datetime.utcnow()
    db.commit()

    return {"success": True, "message": f"Alert {alert_id} acknowledged"}


@router.post("/acknowledge-all")
async def acknowledge_all_alerts(
    acknowledged_by: str = Query(default="admin"),
    severity: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Acknowledge all unacknowledged alerts."""
    query = db.query(Alert).filter(Alert.is_acknowledged == False)

    if severity:
        query = query.filter(Alert.severity == severity)

    count = query.update({
        "is_acknowledged": True,
        "acknowledged_by": acknowledged_by,
        "acknowledged_at": datetime.utcnow()
    })
    db.commit()

    return {"success": True, "acknowledged_count": count}


@router.get("/stats/summary")
async def get_alert_stats(
    hours: int = Query(default=24, ge=1, le=720),
    db: Session = Depends(get_db)
):
    """Get alert statistics summary."""
    since = datetime.utcnow() - timedelta(hours=hours)

    total = db.query(Alert).filter(Alert.created_at >= since).count()
    unacknowledged = db.query(Alert).filter(
        Alert.created_at >= since,
        Alert.is_acknowledged == False
    ).count()

    critical = db.query(Alert).filter(
        Alert.created_at >= since,
        Alert.severity == "critical"
    ).count()
    warning = db.query(Alert).filter(
        Alert.created_at >= since,
        Alert.severity == "warning"
    ).count()
    info = db.query(Alert).filter(
        Alert.created_at >= since,
        Alert.severity == "info"
    ).count()

    # By type
    by_type = {}
    for alert_type in ["occupancy", "wait_time", "after_hours", "zone_breach"]:
        by_type[alert_type] = db.query(Alert).filter(
            Alert.created_at >= since,
            Alert.alert_type == alert_type
        ).count()

    return {
        "total": total,
        "unacknowledged": unacknowledged,
        "by_severity": {
            "critical": critical,
            "warning": warning,
            "info": info
        },
        "by_type": by_type,
        "time_range_hours": hours
    }
