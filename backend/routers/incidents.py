"""Incidents router for incident logging and management."""

import csv
import io
import json
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Incident, Staff, User, Zone

router = APIRouter(prefix="/api/incidents", tags=["incidents"])

# Incident types
INCIDENT_TYPES = {
    "complaint": {"name": "Customer Complaint", "description": "Customer service issues or complaints"},
    "spill": {"name": "Spill/Cleanup", "description": "Spills requiring cleanup"},
    "theft": {"name": "Theft/Security", "description": "Suspected theft or security concerns"},
    "equipment": {"name": "Equipment Issue", "description": "Equipment malfunction or damage"},
    "safety": {"name": "Safety Hazard", "description": "Safety concerns or hazards"},
    "other": {"name": "Other", "description": "Other incidents not categorized above"}
}

SEVERITY_LEVELS = ["low", "medium", "high", "critical"]
STATUS_OPTIONS = ["open", "investigating", "resolved"]


# Pydantic models
class IncidentCreate(BaseModel):
    """Create incident."""
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    incident_type: str = Field(..., pattern="^(complaint|spill|theft|equipment|safety|other)$")
    severity: str = Field(default="medium", pattern="^(low|medium|high|critical)$")
    camera_id: Optional[str] = None
    zone_id: Optional[int] = None
    location: Optional[str] = Field(None, max_length=200)
    assigned_to: Optional[int] = None
    frigate_event_id: Optional[str] = None
    clip_url: Optional[str] = None
    snapshot_url: Optional[str] = None


class IncidentUpdate(BaseModel):
    """Update incident."""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    incident_type: Optional[str] = Field(None, pattern="^(complaint|spill|theft|equipment|safety|other)$")
    severity: Optional[str] = Field(None, pattern="^(low|medium|high|critical)$")
    status: Optional[str] = Field(None, pattern="^(open|investigating|resolved)$")
    camera_id: Optional[str] = None
    zone_id: Optional[int] = None
    location: Optional[str] = Field(None, max_length=200)
    assigned_to: Optional[int] = None
    resolution_notes: Optional[str] = Field(None, max_length=1000)


class IncidentResponse(BaseModel):
    """Incident response."""
    id: int
    title: str
    description: Optional[str]
    incident_type: str
    severity: str
    status: str
    camera_id: Optional[str]
    zone_id: Optional[int]
    zone_name: Optional[str] = None
    location: Optional[str]
    assigned_to: Optional[int]
    assigned_to_name: Optional[str] = None
    reported_by: Optional[int]
    reported_by_name: Optional[str] = None
    frigate_event_id: Optional[str]
    clip_url: Optional[str]
    snapshot_url: Optional[str]
    resolution_notes: Optional[str]
    resolved_at: Optional[datetime]
    resolved_by: Optional[int]
    resolved_by_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class IncidentStats(BaseModel):
    """Incident statistics."""
    total: int
    open: int
    investigating: int
    resolved: int
    by_severity: dict
    by_type: dict
    time_range_hours: int


# Helper functions
def format_incident_response(incident: Incident) -> dict:
    """Format incident with related names."""
    return {
        "id": incident.id,
        "title": incident.title,
        "description": incident.description,
        "incident_type": incident.incident_type,
        "severity": incident.severity,
        "status": incident.status,
        "camera_id": incident.camera_id,
        "zone_id": incident.zone_id,
        "zone_name": incident.zone.name if incident.zone else None,
        "location": incident.location,
        "assigned_to": incident.assigned_to,
        "assigned_to_name": incident.assigned_staff.name if incident.assigned_staff else None,
        "reported_by": incident.reported_by,
        "reported_by_name": incident.reporter.username if incident.reporter else None,
        "frigate_event_id": incident.frigate_event_id,
        "clip_url": incident.clip_url,
        "snapshot_url": incident.snapshot_url,
        "resolution_notes": incident.resolution_notes,
        "resolved_at": incident.resolved_at,
        "resolved_by": incident.resolved_by,
        "resolved_by_name": incident.resolver.username if incident.resolver else None,
        "created_at": incident.created_at,
        "updated_at": incident.updated_at
    }


# ============== Incident Types ==============

@router.get("/types")
async def get_incident_types():
    """Get available incident types."""
    return {"types": INCIDENT_TYPES}


@router.get("/severities")
async def get_severity_levels():
    """Get available severity levels."""
    return {"severities": SEVERITY_LEVELS}


@router.get("/statuses")
async def get_status_options():
    """Get available status options."""
    return {"statuses": STATUS_OPTIONS}


# ============== Incident CRUD ==============

@router.get("", response_model=list[IncidentResponse])
async def list_incidents(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    incident_type: Optional[str] = None,
    camera_id: Optional[str] = None,
    zone_id: Optional[int] = None,
    assigned_to: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    days: int = Query(default=30, ge=1, le=365),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db)
):
    """List incidents with filtering."""
    query = db.query(Incident).options(
        joinedload(Incident.zone),
        joinedload(Incident.assigned_staff),
        joinedload(Incident.reporter),
        joinedload(Incident.resolver)
    )

    # Date range filter
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            query = query.filter(Incident.created_at >= start_dt)
        except ValueError:
            pass
    else:
        since = datetime.utcnow() - timedelta(days=days)
        query = query.filter(Incident.created_at >= since)

    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            query = query.filter(Incident.created_at <= end_dt)
        except ValueError:
            pass

    # Apply filters
    if status:
        query = query.filter(Incident.status == status)
    if severity:
        query = query.filter(Incident.severity == severity)
    if incident_type:
        query = query.filter(Incident.incident_type == incident_type)
    if camera_id:
        query = query.filter(Incident.camera_id == camera_id)
    if zone_id:
        query = query.filter(Incident.zone_id == zone_id)
    if assigned_to:
        query = query.filter(Incident.assigned_to == assigned_to)

    incidents = query.order_by(Incident.created_at.desc()).offset(skip).limit(limit).all()
    return [format_incident_response(i) for i in incidents]


@router.post("", response_model=IncidentResponse, status_code=201)
async def create_incident(
    incident: IncidentCreate,
    reported_by: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Create a new incident."""
    # Validate zone if provided
    if incident.zone_id:
        zone = db.query(Zone).filter(Zone.id == incident.zone_id).first()
        if not zone:
            raise HTTPException(status_code=400, detail="Zone not found")

    # Validate assigned staff if provided
    if incident.assigned_to:
        staff = db.query(Staff).filter(Staff.id == incident.assigned_to).first()
        if not staff:
            raise HTTPException(status_code=400, detail="Staff member not found")

    db_incident = Incident(
        **incident.model_dump(),
        reported_by=reported_by
    )
    db.add(db_incident)
    db.commit()
    db.refresh(db_incident)

    # Reload with relationships
    db_incident = db.query(Incident).options(
        joinedload(Incident.zone),
        joinedload(Incident.assigned_staff),
        joinedload(Incident.reporter),
        joinedload(Incident.resolver)
    ).filter(Incident.id == db_incident.id).first()

    return format_incident_response(db_incident)


# ============== Statistics (before dynamic routes) ==============

@router.get("/stats/summary", response_model=IncidentStats)
async def get_incident_stats(
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db)
):
    """Get incident statistics summary."""
    since = datetime.utcnow() - timedelta(days=days)

    total = db.query(Incident).filter(Incident.created_at >= since).count()
    open_count = db.query(Incident).filter(
        Incident.created_at >= since,
        Incident.status == "open"
    ).count()
    investigating = db.query(Incident).filter(
        Incident.created_at >= since,
        Incident.status == "investigating"
    ).count()
    resolved = db.query(Incident).filter(
        Incident.created_at >= since,
        Incident.status == "resolved"
    ).count()

    # By severity
    by_severity = {}
    for severity in SEVERITY_LEVELS:
        by_severity[severity] = db.query(Incident).filter(
            Incident.created_at >= since,
            Incident.severity == severity
        ).count()

    # By type
    by_type = {}
    for inc_type in INCIDENT_TYPES.keys():
        by_type[inc_type] = db.query(Incident).filter(
            Incident.created_at >= since,
            Incident.incident_type == inc_type
        ).count()

    return {
        "total": total,
        "open": open_count,
        "investigating": investigating,
        "resolved": resolved,
        "by_severity": by_severity,
        "by_type": by_type,
        "time_range_hours": days * 24
    }


# ============== Export (before dynamic routes) ==============

@router.get("/export")
async def export_incidents(
    format: str = Query(default="csv", pattern="^(csv|json)$"),
    status: Optional[str] = None,
    severity: Optional[str] = None,
    incident_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db)
):
    """Export incidents as CSV or JSON."""
    query = db.query(Incident).options(
        joinedload(Incident.zone),
        joinedload(Incident.assigned_staff),
        joinedload(Incident.reporter),
        joinedload(Incident.resolver)
    )

    # Date range filter
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            query = query.filter(Incident.created_at >= start_dt)
        except ValueError:
            pass
    else:
        since = datetime.utcnow() - timedelta(days=days)
        query = query.filter(Incident.created_at >= since)

    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            query = query.filter(Incident.created_at <= end_dt)
        except ValueError:
            pass

    # Apply filters
    if status:
        query = query.filter(Incident.status == status)
    if severity:
        query = query.filter(Incident.severity == severity)
    if incident_type:
        query = query.filter(Incident.incident_type == incident_type)

    incidents = query.order_by(Incident.created_at.desc()).all()

    if format == "json":
        return [format_incident_response(i) for i in incidents]

    # CSV export
    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow([
        "ID", "Title", "Type", "Severity", "Status", "Location",
        "Camera", "Zone", "Assigned To", "Reported By",
        "Resolution Notes", "Created At", "Resolved At"
    ])

    # Data rows
    for incident in incidents:
        writer.writerow([
            incident.id,
            incident.title,
            incident.incident_type,
            incident.severity,
            incident.status,
            incident.location or "",
            incident.camera_id or "",
            incident.zone.name if incident.zone else "",
            incident.assigned_staff.name if incident.assigned_staff else "",
            incident.reporter.username if incident.reporter else "",
            incident.resolution_notes or "",
            incident.created_at.isoformat() if incident.created_at else "",
            incident.resolved_at.isoformat() if incident.resolved_at else ""
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=incidents_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
        }
    )


# ============== Dynamic ID Routes ==============

@router.get("/{incident_id}", response_model=IncidentResponse)
async def get_incident(incident_id: int, db: Session = Depends(get_db)):
    """Get a specific incident."""
    incident = db.query(Incident).options(
        joinedload(Incident.zone),
        joinedload(Incident.assigned_staff),
        joinedload(Incident.reporter),
        joinedload(Incident.resolver)
    ).filter(Incident.id == incident_id).first()

    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    return format_incident_response(incident)


@router.put("/{incident_id}", response_model=IncidentResponse)
async def update_incident(
    incident_id: int,
    update: IncidentUpdate,
    db: Session = Depends(get_db)
):
    """Update an incident."""
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    update_data = update.model_dump(exclude_unset=True)

    # Validate zone if provided
    if "zone_id" in update_data and update_data["zone_id"]:
        zone = db.query(Zone).filter(Zone.id == update_data["zone_id"]).first()
        if not zone:
            raise HTTPException(status_code=400, detail="Zone not found")

    # Validate assigned staff if provided
    if "assigned_to" in update_data and update_data["assigned_to"]:
        staff = db.query(Staff).filter(Staff.id == update_data["assigned_to"]).first()
        if not staff:
            raise HTTPException(status_code=400, detail="Staff member not found")

    for key, value in update_data.items():
        setattr(incident, key, value)

    incident.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(incident)

    # Reload with relationships
    incident = db.query(Incident).options(
        joinedload(Incident.zone),
        joinedload(Incident.assigned_staff),
        joinedload(Incident.reporter),
        joinedload(Incident.resolver)
    ).filter(Incident.id == incident_id).first()

    return format_incident_response(incident)


@router.delete("/{incident_id}")
async def delete_incident(incident_id: int, db: Session = Depends(get_db)):
    """Delete an incident."""
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    db.delete(incident)
    db.commit()
    return {"success": True, "message": f"Incident {incident_id} deleted"}


# ============== Incident Actions ==============

@router.post("/{incident_id}/resolve")
async def resolve_incident(
    incident_id: int,
    resolution_notes: Optional[str] = None,
    resolved_by: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Mark an incident as resolved."""
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    incident.status = "resolved"
    incident.resolution_notes = resolution_notes
    incident.resolved_at = datetime.utcnow()
    incident.resolved_by = resolved_by
    incident.updated_at = datetime.utcnow()
    db.commit()

    return {"success": True, "message": f"Incident {incident_id} resolved"}


@router.post("/{incident_id}/assign")
async def assign_incident(
    incident_id: int,
    staff_id: int,
    db: Session = Depends(get_db)
):
    """Assign an incident to a staff member."""
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    staff = db.query(Staff).filter(Staff.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=400, detail="Staff member not found")

    incident.assigned_to = staff_id
    if incident.status == "open":
        incident.status = "investigating"
    incident.updated_at = datetime.utcnow()
    db.commit()

    return {"success": True, "message": f"Incident {incident_id} assigned to {staff.name}"}


@router.post("/{incident_id}/attach-clip")
async def attach_clip(
    incident_id: int,
    frigate_event_id: str,
    db: Session = Depends(get_db)
):
    """Attach a Frigate video clip to an incident."""
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    # Build Frigate URLs
    frigate_url = "http://localhost:5000"  # Or get from env
    incident.frigate_event_id = frigate_event_id
    incident.clip_url = f"{frigate_url}/api/events/{frigate_event_id}/clip.mp4"
    incident.snapshot_url = f"{frigate_url}/api/events/{frigate_event_id}/snapshot.jpg"
    incident.updated_at = datetime.utcnow()
    db.commit()

    return {
        "success": True,
        "clip_url": incident.clip_url,
        "snapshot_url": incident.snapshot_url
    }
