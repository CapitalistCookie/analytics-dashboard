"""Activity feed router for combined timeline of incidents, notes, and alerts."""

import json
from datetime import datetime, timedelta
from typing import Optional, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Incident, ShiftNote, Alert, User

router = APIRouter(prefix="/api/activity", tags=["activity"])


class ActivityItem(BaseModel):
    """Activity feed item."""
    id: str  # Prefixed ID like "incident_1", "note_2", "alert_3"
    type: Literal["incident", "note", "alert"]
    title: str
    description: Optional[str]
    category: Optional[str]
    severity: Optional[str]
    status: Optional[str]
    is_pinned: bool = False
    is_acknowledged: bool = False
    created_by: Optional[str]
    created_at: datetime
    metadata: dict = {}


class ActivityFeed(BaseModel):
    """Activity feed response."""
    items: list[ActivityItem]
    total: int
    has_more: bool


class ActivityStats(BaseModel):
    """Activity statistics."""
    total: int
    incidents: int
    notes: int
    alerts: int
    unread_incidents: int
    unread_notes: int
    unacknowledged_alerts: int
    by_hour: dict


@router.get("", response_model=ActivityFeed)
async def get_activity_feed(
    types: Optional[str] = Query(None, description="Comma-separated types: incident,note,alert"),
    severity: Optional[str] = None,
    category: Optional[str] = None,
    include_acknowledged: bool = True,
    hours: int = Query(default=24, ge=1, le=168),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db)
):
    """Get combined activity feed from incidents, notes, and alerts."""
    since = datetime.utcnow() - timedelta(hours=hours)
    items = []

    # Parse types filter
    type_filter = None
    if types:
        type_filter = [t.strip() for t in types.split(",")]

    # Fetch incidents
    if not type_filter or "incident" in type_filter:
        incident_query = db.query(Incident).options(
            joinedload(Incident.reporter),
            joinedload(Incident.zone)
        ).filter(Incident.created_at >= since)

        if severity:
            incident_query = incident_query.filter(Incident.severity == severity)
        if not include_acknowledged:
            incident_query = incident_query.filter(Incident.status == "open")

        for incident in incident_query.all():
            items.append(ActivityItem(
                id=f"incident_{incident.id}",
                type="incident",
                title=incident.title,
                description=incident.description,
                category=incident.incident_type,
                severity=incident.severity,
                status=incident.status,
                is_pinned=False,
                is_acknowledged=incident.status == "resolved",
                created_by=incident.reporter.username if incident.reporter else None,
                created_at=incident.created_at,
                metadata={
                    "incident_id": incident.id,
                    "camera_id": incident.camera_id,
                    "zone_name": incident.zone.name if incident.zone else None,
                    "location": incident.location,
                    "assigned_to": incident.assigned_to,
                    "snapshot_url": incident.snapshot_url
                }
            ))

    # Fetch shift notes
    if not type_filter or "note" in type_filter:
        note_query = db.query(ShiftNote).options(
            joinedload(ShiftNote.creator)
        ).filter(ShiftNote.created_at >= since)

        if category:
            note_query = note_query.filter(ShiftNote.category == category)
        if not include_acknowledged:
            note_query = note_query.filter(ShiftNote.is_acknowledged == False)

        for note in note_query.all():
            items.append(ActivityItem(
                id=f"note_{note.id}",
                type="note",
                title=f"Shift Note ({note.category})",
                description=note.content,
                category=note.category,
                severity=None,
                status=None,
                is_pinned=note.is_pinned,
                is_acknowledged=note.is_acknowledged,
                created_by=note.creator.username if note.creator else None,
                created_at=note.created_at,
                metadata={
                    "note_id": note.id,
                    "shift_type": note.shift_type,
                    "shift_date": note.shift_date.isoformat() if note.shift_date else None
                }
            ))

    # Fetch alerts
    if not type_filter or "alert" in type_filter:
        alert_query = db.query(Alert).filter(Alert.created_at >= since)

        if severity:
            alert_query = alert_query.filter(Alert.severity == severity)
        if not include_acknowledged:
            alert_query = alert_query.filter(Alert.is_acknowledged == False)

        for alert in alert_query.all():
            items.append(ActivityItem(
                id=f"alert_{alert.id}",
                type="alert",
                title=f"{alert.alert_type.replace('_', ' ').title()} Alert",
                description=alert.message,
                category=alert.alert_type,
                severity=alert.severity,
                status=None,
                is_pinned=False,
                is_acknowledged=alert.is_acknowledged,
                created_by=None,
                created_at=alert.created_at,
                metadata={
                    "alert_id": alert.id,
                    "camera_id": alert.camera_id,
                    "zone_id": alert.zone_id,
                    "details": json.loads(alert.details) if alert.details else None
                }
            ))

    # Sort all items by created_at (most recent first)
    items.sort(key=lambda x: x.created_at, reverse=True)

    # Apply pagination
    total = len(items)
    paginated_items = items[skip:skip + limit]
    has_more = (skip + limit) < total

    return ActivityFeed(
        items=paginated_items,
        total=total,
        has_more=has_more
    )


@router.get("/stats", response_model=ActivityStats)
async def get_activity_stats(
    hours: int = Query(default=24, ge=1, le=168),
    db: Session = Depends(get_db)
):
    """Get activity statistics for the dashboard."""
    since = datetime.utcnow() - timedelta(hours=hours)

    # Count by type
    incidents = db.query(Incident).filter(Incident.created_at >= since).count()
    notes = db.query(ShiftNote).filter(ShiftNote.created_at >= since).count()
    alerts = db.query(Alert).filter(Alert.created_at >= since).count()

    # Count unread/unacknowledged
    unread_incidents = db.query(Incident).filter(
        Incident.created_at >= since,
        Incident.status == "open"
    ).count()
    unread_notes = db.query(ShiftNote).filter(
        ShiftNote.created_at >= since,
        ShiftNote.is_acknowledged == False
    ).count()
    unacknowledged_alerts = db.query(Alert).filter(
        Alert.created_at >= since,
        Alert.is_acknowledged == False
    ).count()

    # Activity by hour
    by_hour = {}
    for h in range(min(hours, 24)):
        hour_start = datetime.utcnow() - timedelta(hours=h+1)
        hour_end = datetime.utcnow() - timedelta(hours=h)
        hour_label = hour_end.strftime("%H:00")

        incident_count = db.query(Incident).filter(
            Incident.created_at >= hour_start,
            Incident.created_at < hour_end
        ).count()
        note_count = db.query(ShiftNote).filter(
            ShiftNote.created_at >= hour_start,
            ShiftNote.created_at < hour_end
        ).count()
        alert_count = db.query(Alert).filter(
            Alert.created_at >= hour_start,
            Alert.created_at < hour_end
        ).count()

        by_hour[hour_label] = {
            "incidents": incident_count,
            "notes": note_count,
            "alerts": alert_count,
            "total": incident_count + note_count + alert_count
        }

    return ActivityStats(
        total=incidents + notes + alerts,
        incidents=incidents,
        notes=notes,
        alerts=alerts,
        unread_incidents=unread_incidents,
        unread_notes=unread_notes,
        unacknowledged_alerts=unacknowledged_alerts,
        by_hour=by_hour
    )


@router.get("/recent")
async def get_recent_activity(
    limit: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db)
):
    """Get most recent activity items for quick display."""
    since = datetime.utcnow() - timedelta(hours=24)
    items = []

    # Get recent incidents
    incidents = db.query(Incident).options(
        joinedload(Incident.reporter)
    ).filter(Incident.created_at >= since).order_by(
        Incident.created_at.desc()
    ).limit(limit).all()

    for incident in incidents:
        items.append({
            "id": f"incident_{incident.id}",
            "type": "incident",
            "title": incident.title,
            "severity": incident.severity,
            "created_at": incident.created_at
        })

    # Get recent notes
    notes = db.query(ShiftNote).options(
        joinedload(ShiftNote.creator)
    ).filter(ShiftNote.created_at >= since).order_by(
        ShiftNote.created_at.desc()
    ).limit(limit).all()

    for note in notes:
        items.append({
            "id": f"note_{note.id}",
            "type": "note",
            "title": f"Note: {note.content[:50]}..." if len(note.content) > 50 else f"Note: {note.content}",
            "category": note.category,
            "created_at": note.created_at
        })

    # Get recent alerts
    alerts = db.query(Alert).filter(Alert.created_at >= since).order_by(
        Alert.created_at.desc()
    ).limit(limit).all()

    for alert in alerts:
        items.append({
            "id": f"alert_{alert.id}",
            "type": "alert",
            "title": alert.message,
            "severity": alert.severity,
            "created_at": alert.created_at
        })

    # Sort by time and limit
    items.sort(key=lambda x: x["created_at"], reverse=True)
    return {"items": items[:limit]}


@router.get("/unread-summary")
async def get_unread_summary(db: Session = Depends(get_db)):
    """Get summary of unread/unacknowledged items for notification badges."""
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    open_incidents = db.query(Incident).filter(
        Incident.status == "open"
    ).count()

    critical_incidents = db.query(Incident).filter(
        Incident.status == "open",
        Incident.severity == "critical"
    ).count()

    unread_notes = db.query(ShiftNote).filter(
        ShiftNote.shift_date >= today - timedelta(days=1),
        ShiftNote.is_acknowledged == False
    ).count()

    unacknowledged_alerts = db.query(Alert).filter(
        Alert.created_at >= today,
        Alert.is_acknowledged == False
    ).count()

    critical_alerts = db.query(Alert).filter(
        Alert.created_at >= today,
        Alert.is_acknowledged == False,
        Alert.severity == "critical"
    ).count()

    return {
        "open_incidents": open_incidents,
        "critical_incidents": critical_incidents,
        "unread_notes": unread_notes,
        "unacknowledged_alerts": unacknowledged_alerts,
        "critical_alerts": critical_alerts,
        "total_unread": open_incidents + unread_notes + unacknowledged_alerts,
        "has_critical": critical_incidents > 0 or critical_alerts > 0
    }
