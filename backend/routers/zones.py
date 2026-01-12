"""Zone management endpoints."""

import json
import os
from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models import Zone

FRIGATE_URL = os.getenv("FRIGATE_URL", "http://localhost:5000")

router = APIRouter(prefix="/api/zones", tags=["zones"])


# Pydantic models
class PolygonPoint(BaseModel):
    x: float
    y: float


class ZoneCreate(BaseModel):
    name: str
    zone_type: str  # entry, exit, service, restricted, dining, bar, kitchen
    capacity: Optional[int] = None
    camera_ids: Optional[list[str]] = None
    polygon: Optional[list[PolygonPoint]] = None
    color: Optional[str] = None


class ZoneUpdate(BaseModel):
    name: Optional[str] = None
    zone_type: Optional[str] = None
    capacity: Optional[int] = None
    camera_ids: Optional[list[str]] = None
    polygon: Optional[list[PolygonPoint]] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None


class ZoneResponse(BaseModel):
    id: int
    name: str
    zone_type: str
    capacity: Optional[int]
    camera_ids: list[str]
    polygon: Optional[list[PolygonPoint]]
    color: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ZoneDetectionPreview(BaseModel):
    zone_id: int
    zone_name: str
    current_count: int
    last_detection: Optional[datetime]
    detections: list[dict]


def zone_to_response(zone: Zone) -> ZoneResponse:
    """Convert Zone model to response."""
    camera_ids = zone.camera_ids.split(",") if zone.camera_ids else []
    camera_ids = [c.strip() for c in camera_ids if c.strip()]

    polygon = None
    if zone.polygon:
        try:
            polygon_data = json.loads(zone.polygon)
            polygon = [PolygonPoint(x=p[0], y=p[1]) for p in polygon_data]
        except (json.JSONDecodeError, KeyError, IndexError):
            polygon = None

    return ZoneResponse(
        id=zone.id,
        name=zone.name,
        zone_type=zone.zone_type,
        capacity=zone.capacity,
        camera_ids=camera_ids,
        polygon=polygon,
        color=zone.color,
        is_active=zone.is_active,
        created_at=zone.created_at,
        updated_at=zone.updated_at
    )


@router.get("", response_model=list[ZoneResponse])
async def list_zones(
    zone_type: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    """List all zones with optional filtering."""
    query = db.query(Zone)

    if zone_type:
        query = query.filter(Zone.zone_type == zone_type)
    if is_active is not None:
        query = query.filter(Zone.is_active == is_active)

    zones = query.order_by(Zone.name).all()
    return [zone_to_response(z) for z in zones]


@router.post("", response_model=ZoneResponse)
async def create_zone(zone: ZoneCreate, db: Session = Depends(get_db)):
    """Create a new zone."""
    # Convert polygon to JSON string
    polygon_json = None
    if zone.polygon:
        polygon_json = json.dumps([[p.x, p.y] for p in zone.polygon])

    # Convert camera_ids to comma-separated string
    camera_ids_str = ",".join(zone.camera_ids) if zone.camera_ids else None

    db_zone = Zone(
        name=zone.name,
        zone_type=zone.zone_type,
        capacity=zone.capacity,
        camera_ids=camera_ids_str,
        polygon=polygon_json,
        color=zone.color or get_default_color(zone.zone_type),
        is_active=True
    )

    db.add(db_zone)
    db.commit()
    db.refresh(db_zone)

    return zone_to_response(db_zone)


@router.get("/types")
async def get_zone_types():
    """Get available zone types with descriptions."""
    return {
        "types": [
            {"id": "entry", "name": "Entry", "description": "Entrance/exit points", "color": "#22c55e"},
            {"id": "exit", "name": "Exit", "description": "Exit-only points", "color": "#ef4444"},
            {"id": "service", "name": "Service", "description": "Service/staff areas", "color": "#3b82f6"},
            {"id": "restricted", "name": "Restricted", "description": "Restricted access areas", "color": "#f59e0b"},
            {"id": "dining", "name": "Dining", "description": "Main dining area", "color": "#8b5cf6"},
            {"id": "bar", "name": "Bar", "description": "Bar area", "color": "#ec4899"},
            {"id": "kitchen", "name": "Kitchen", "description": "Kitchen area", "color": "#f97316"},
            {"id": "waiting", "name": "Waiting", "description": "Waiting/lobby area", "color": "#06b6d4"}
        ]
    }


@router.get("/{zone_id}", response_model=ZoneResponse)
async def get_zone(zone_id: int, db: Session = Depends(get_db)):
    """Get a specific zone by ID."""
    zone = db.query(Zone).filter(Zone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    return zone_to_response(zone)


@router.put("/{zone_id}", response_model=ZoneResponse)
async def update_zone(zone_id: int, zone_update: ZoneUpdate, db: Session = Depends(get_db)):
    """Update an existing zone."""
    zone = db.query(Zone).filter(Zone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")

    if zone_update.name is not None:
        zone.name = zone_update.name
    if zone_update.zone_type is not None:
        zone.zone_type = zone_update.zone_type
    if zone_update.capacity is not None:
        zone.capacity = zone_update.capacity
    if zone_update.camera_ids is not None:
        zone.camera_ids = ",".join(zone_update.camera_ids)
    if zone_update.polygon is not None:
        zone.polygon = json.dumps([[p.x, p.y] for p in zone_update.polygon])
    if zone_update.color is not None:
        zone.color = zone_update.color
    if zone_update.is_active is not None:
        zone.is_active = zone_update.is_active

    db.commit()
    db.refresh(zone)

    return zone_to_response(zone)


@router.delete("/{zone_id}")
async def delete_zone(zone_id: int, db: Session = Depends(get_db)):
    """Delete a zone."""
    zone = db.query(Zone).filter(Zone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")

    db.delete(zone)
    db.commit()

    return {"message": "Zone deleted successfully"}


@router.get("/{zone_id}/preview", response_model=ZoneDetectionPreview)
async def get_zone_detection_preview(zone_id: int, db: Session = Depends(get_db)):
    """Get current detection preview for a zone."""
    zone = db.query(Zone).filter(Zone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")

    # Get recent events from Frigate for cameras in this zone
    detections = []
    current_count = 0
    last_detection = None

    if zone.camera_ids:
        camera_ids = [c.strip() for c in zone.camera_ids.split(",") if c.strip()]

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                for camera_id in camera_ids:
                    response = await client.get(
                        f"{FRIGATE_URL}/api/events",
                        params={"camera": camera_id, "limit": 10, "label": "person"}
                    )
                    if response.status_code == 200:
                        events = response.json()
                        for event in events:
                            # Check if event is in zone (simplified - would need polygon check)
                            if event.get("zones") and zone.name.lower().replace(" ", "_") in [z.lower() for z in event.get("zones", [])]:
                                detections.append({
                                    "event_id": event.get("id"),
                                    "camera": event.get("camera"),
                                    "start_time": event.get("start_time"),
                                    "score": event.get("data", {}).get("score", 0)
                                })
                                if event.get("end_time") is None:
                                    current_count += 1
                                if last_detection is None or event.get("start_time", 0) > last_detection:
                                    last_detection = event.get("start_time")
        except Exception:
            pass

    return ZoneDetectionPreview(
        zone_id=zone.id,
        zone_name=zone.name,
        current_count=current_count,
        last_detection=datetime.fromtimestamp(last_detection) if last_detection else None,
        detections=detections[:5]  # Return only last 5
    )


@router.post("/{zone_id}/save-to-frigate")
async def save_zone_to_frigate(zone_id: int, db: Session = Depends(get_db)):
    """Save zone configuration to Frigate config."""
    zone = db.query(Zone).filter(Zone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")

    if not zone.polygon:
        raise HTTPException(status_code=400, detail="Zone has no polygon defined")

    # Note: Frigate config is typically in a YAML file
    # This would need to be adapted based on how Frigate is configured
    # For now, we'll return the config that would be used

    polygon_data = json.loads(zone.polygon)
    zone_name = zone.name.lower().replace(" ", "_")

    frigate_config = {
        "zone_name": zone_name,
        "coordinates": polygon_data,
        "camera_ids": zone.camera_ids.split(",") if zone.camera_ids else []
    }

    return {
        "message": "Zone configuration prepared for Frigate",
        "config": frigate_config,
        "note": "Manual update to Frigate config may be required"
    }


def get_default_color(zone_type: str) -> str:
    """Get default color for a zone type."""
    colors = {
        "entry": "#22c55e",
        "exit": "#ef4444",
        "service": "#3b82f6",
        "restricted": "#f59e0b",
        "dining": "#8b5cf6",
        "bar": "#ec4899",
        "kitchen": "#f97316",
        "waiting": "#06b6d4"
    }
    return colors.get(zone_type, "#6b7280")
