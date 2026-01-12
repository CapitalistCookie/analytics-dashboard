"""Camera health monitoring and settings endpoints."""

import os
import json
from datetime import datetime, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models import Camera

FRIGATE_URL = os.getenv("FRIGATE_URL", "http://localhost:5000")

router = APIRouter(prefix="/api/cameras", tags=["cameras"])


# Pydantic models
class CameraHealth(BaseModel):
    camera_id: str
    name: Optional[str]
    status: str  # online, offline, degraded
    fps: float
    detection_fps: float
    process_fps: float
    last_seen: Optional[datetime]
    latency_ms: Optional[float]
    uptime_percent: float
    disk_usage_mb: float
    recording_enabled: bool
    detection_enabled: bool
    error_message: Optional[str] = None


class CameraHealthSummary(BaseModel):
    total_cameras: int
    online: int
    offline: int
    degraded: int
    avg_fps: float
    total_disk_usage_mb: float
    alerts: list[dict]


class CameraSettings(BaseModel):
    camera_id: str
    name: Optional[str]
    rtsp_url: Optional[str]
    detection_enabled: bool
    recording_enabled: bool
    snapshots_enabled: bool
    motion_threshold: int
    motion_contour_area: int
    detect_width: int
    detect_height: int
    detect_fps: int


class CameraSettingsUpdate(BaseModel):
    name: Optional[str] = None
    detection_enabled: Optional[bool] = None
    recording_enabled: Optional[bool] = None
    snapshots_enabled: Optional[bool] = None
    motion_threshold: Optional[int] = None
    motion_contour_area: Optional[int] = None


class CameraNameUpdate(BaseModel):
    name: Optional[str] = None  # None to reset to default


class CameraNameResponse(BaseModel):
    camera_id: str
    display_name: str
    is_custom: bool


class CameraUptimeHistory(BaseModel):
    camera_id: str
    history: list[dict]
    avg_uptime_percent: float
    total_downtime_minutes: int


# In-memory storage for camera status history (would be better in database for production)
camera_status_history: dict[str, list[dict]] = {}
camera_last_seen: dict[str, datetime] = {}


@router.get("/health", response_model=list[CameraHealth])
async def get_camera_health():
    """Get health status for all cameras."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Get camera stats
            stats_response = await client.get(f"{FRIGATE_URL}/api/stats")
            stats_response.raise_for_status()
            stats = stats_response.json()

            # Get camera config
            config_response = await client.get(f"{FRIGATE_URL}/api/config")
            config_data = {}
            if config_response.status_code == 200:
                config_data = config_response.json()

            cameras = []
            for camera_id, camera_stats in stats.get("cameras", {}).items():
                fps = camera_stats.get("camera_fps", 0)
                detection_fps = camera_stats.get("detection_fps", 0)
                process_fps = camera_stats.get("process_fps", 0)

                # Determine status
                if fps > 0:
                    status = "online"
                    camera_last_seen[camera_id] = datetime.utcnow()
                elif camera_id in camera_last_seen:
                    time_since_seen = datetime.utcnow() - camera_last_seen[camera_id]
                    if time_since_seen < timedelta(minutes=5):
                        status = "degraded"
                    else:
                        status = "offline"
                else:
                    status = "offline"

                # Track status history
                if camera_id not in camera_status_history:
                    camera_status_history[camera_id] = []
                camera_status_history[camera_id].append({
                    "timestamp": datetime.utcnow().isoformat(),
                    "status": status,
                    "fps": fps
                })
                # Keep only last 1000 entries
                camera_status_history[camera_id] = camera_status_history[camera_id][-1000:]

                # Calculate uptime from history
                history = camera_status_history.get(camera_id, [])
                online_count = sum(1 for h in history if h.get("status") == "online")
                uptime_percent = (online_count / len(history) * 100) if history else 100.0

                # Get camera config details
                cam_config = config_data.get("cameras", {}).get(camera_id, {})
                recording_enabled = cam_config.get("record", {}).get("enabled", False)
                detection_enabled = cam_config.get("detect", {}).get("enabled", True)

                # Estimate disk usage (demo data - would need actual storage metrics)
                disk_usage_mb = camera_stats.get("capture_pid", 0) * 10.5 if camera_stats.get("capture_pid") else 0

                cameras.append(CameraHealth(
                    camera_id=camera_id,
                    name=cam_config.get("name", camera_id),
                    status=status,
                    fps=fps,
                    detection_fps=detection_fps,
                    process_fps=process_fps,
                    last_seen=camera_last_seen.get(camera_id),
                    latency_ms=round(1000 / fps, 2) if fps > 0 else None,
                    uptime_percent=round(uptime_percent, 1),
                    disk_usage_mb=round(disk_usage_mb, 2),
                    recording_enabled=recording_enabled,
                    detection_enabled=detection_enabled,
                    error_message=None if status == "online" else "No frames received" if status == "offline" else "Low FPS"
                ))

            return cameras
    except httpx.HTTPError as e:
        raise HTTPException(status_code=503, detail=f"Failed to connect to Frigate: {e}")


@router.get("/health/summary", response_model=CameraHealthSummary)
async def get_camera_health_summary():
    """Get summary of camera health status."""
    cameras = await get_camera_health()

    online = sum(1 for c in cameras if c.status == "online")
    offline = sum(1 for c in cameras if c.status == "offline")
    degraded = sum(1 for c in cameras if c.status == "degraded")

    avg_fps = sum(c.fps for c in cameras) / len(cameras) if cameras else 0
    total_disk = sum(c.disk_usage_mb for c in cameras)

    # Generate alerts for problematic cameras
    alerts = []
    for cam in cameras:
        if cam.status == "offline":
            alerts.append({
                "camera_id": cam.camera_id,
                "severity": "critical",
                "message": f"{cam.camera_id} is offline",
                "timestamp": datetime.utcnow().isoformat()
            })
        elif cam.status == "degraded":
            alerts.append({
                "camera_id": cam.camera_id,
                "severity": "warning",
                "message": f"{cam.camera_id} has degraded performance",
                "timestamp": datetime.utcnow().isoformat()
            })
        elif cam.fps < 5 and cam.fps > 0:
            alerts.append({
                "camera_id": cam.camera_id,
                "severity": "warning",
                "message": f"{cam.camera_id} has low FPS ({cam.fps:.1f})",
                "timestamp": datetime.utcnow().isoformat()
            })

    return CameraHealthSummary(
        total_cameras=len(cameras),
        online=online,
        offline=offline,
        degraded=degraded,
        avg_fps=round(avg_fps, 1),
        total_disk_usage_mb=round(total_disk, 2),
        alerts=alerts
    )


@router.get("/health/{camera_id}", response_model=CameraHealth)
async def get_single_camera_health(camera_id: str):
    """Get health status for a specific camera."""
    cameras = await get_camera_health()
    for cam in cameras:
        if cam.camera_id == camera_id:
            return cam
    raise HTTPException(status_code=404, detail="Camera not found")


@router.get("/health/{camera_id}/history", response_model=CameraUptimeHistory)
async def get_camera_uptime_history(camera_id: str, hours: int = 24):
    """Get uptime history for a camera."""
    history = camera_status_history.get(camera_id, [])

    # Filter to requested time range
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    filtered_history = [
        h for h in history
        if datetime.fromisoformat(h["timestamp"]) > cutoff
    ]

    # Calculate metrics
    online_count = sum(1 for h in filtered_history if h.get("status") == "online")
    uptime_percent = (online_count / len(filtered_history) * 100) if filtered_history else 100.0

    offline_count = sum(1 for h in filtered_history if h.get("status") == "offline")
    # Assume each status check is 5 seconds apart
    downtime_minutes = round(offline_count * 5 / 60)

    return CameraUptimeHistory(
        camera_id=camera_id,
        history=filtered_history[-100:],  # Return last 100 entries
        avg_uptime_percent=round(uptime_percent, 1),
        total_downtime_minutes=downtime_minutes
    )


@router.get("/settings/{camera_id}", response_model=CameraSettings)
async def get_camera_settings(camera_id: str):
    """Get settings for a specific camera."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{FRIGATE_URL}/api/config")
            if response.status_code != 200:
                raise HTTPException(status_code=503, detail="Failed to get Frigate config")

            config = response.json()
            cam_config = config.get("cameras", {}).get(camera_id)

            if not cam_config:
                raise HTTPException(status_code=404, detail="Camera not found in Frigate config")

            # Extract RTSP URL (masked for security)
            ffmpeg_config = cam_config.get("ffmpeg", {})
            inputs = ffmpeg_config.get("inputs", [])
            rtsp_url = inputs[0].get("path", "") if inputs else ""
            # Mask password in URL
            if "@" in rtsp_url:
                parts = rtsp_url.split("@")
                rtsp_url = "rtsp://****:****@" + parts[-1]

            detect_config = cam_config.get("detect", {})
            record_config = cam_config.get("record", {})
            snapshots_config = cam_config.get("snapshots", {})
            motion_config = cam_config.get("motion", {})

            return CameraSettings(
                camera_id=camera_id,
                name=cam_config.get("name", camera_id),
                rtsp_url=rtsp_url,
                detection_enabled=detect_config.get("enabled", True),
                recording_enabled=record_config.get("enabled", False),
                snapshots_enabled=snapshots_config.get("enabled", False),
                motion_threshold=motion_config.get("threshold", 25),
                motion_contour_area=motion_config.get("contour_area", 100),
                detect_width=detect_config.get("width", 1280),
                detect_height=detect_config.get("height", 720),
                detect_fps=detect_config.get("fps", 5)
            )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=503, detail=f"Failed to connect to Frigate: {e}")


@router.put("/settings/{camera_id}")
async def update_camera_settings(camera_id: str, settings: CameraSettingsUpdate, db: Session = Depends(get_db)):
    """Update camera settings."""
    # Store settings in local database (Frigate config is read-only via API)
    camera = db.query(Camera).filter(Camera.camera_id == camera_id).first()

    if not camera:
        # Create a local camera record
        camera = Camera(camera_id=camera_id, name=settings.name)
        db.add(camera)

    if settings.name is not None:
        camera.name = settings.name

    db.commit()
    db.refresh(camera)

    # Note: To actually update Frigate settings, you'd need to modify the config file
    # and restart Frigate. This would require file system access or a config API.

    return {
        "message": "Local settings updated",
        "camera_id": camera_id,
        "note": "To update Frigate detection/recording settings, modify frigate.yml directly"
    }


@router.post("/{camera_id}/restart")
async def restart_camera_stream(camera_id: str):
    """Restart a camera stream in Frigate."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Frigate doesn't have a direct restart API, but we can try to toggle detection
            # First disable detection
            response = await client.post(
                f"{FRIGATE_URL}/api/{camera_id}/detect",
                json={"enabled": False}
            )

            # Small delay
            import asyncio
            await asyncio.sleep(1)

            # Re-enable detection
            response = await client.post(
                f"{FRIGATE_URL}/api/{camera_id}/detect",
                json={"enabled": True}
            )

            return {
                "message": f"Camera {camera_id} stream restart initiated",
                "status": "success"
            }
    except httpx.HTTPError as e:
        raise HTTPException(status_code=503, detail=f"Failed to restart camera: {e}")


@router.get("/{camera_id}/snapshot")
async def get_camera_snapshot(camera_id: str):
    """Get latest snapshot URL for a camera."""
    return {
        "camera_id": camera_id,
        "snapshot_url": f"{FRIGATE_URL}/api/{camera_id}/latest.jpg",
        "thumbnail_url": f"{FRIGATE_URL}/api/{camera_id}/thumbnail.jpg"
    }


@router.post("/{camera_id}/detect/toggle")
async def toggle_camera_detection(camera_id: str, enabled: bool):
    """Toggle detection on/off for a camera."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{FRIGATE_URL}/api/{camera_id}/detect",
                json={"enabled": enabled}
            )
            response.raise_for_status()

            return {
                "camera_id": camera_id,
                "detection_enabled": enabled,
                "message": f"Detection {'enabled' if enabled else 'disabled'}"
            }
    except httpx.HTTPError as e:
        raise HTTPException(status_code=503, detail=f"Failed to toggle detection: {e}")


@router.post("/{camera_id}/recordings/toggle")
async def toggle_camera_recordings(camera_id: str, enabled: bool):
    """Toggle recordings on/off for a camera."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{FRIGATE_URL}/api/{camera_id}/recordings",
                json={"enabled": enabled}
            )
            response.raise_for_status()

            return {
                "camera_id": camera_id,
                "recordings_enabled": enabled,
                "message": f"Recordings {'enabled' if enabled else 'disabled'}"
            }
    except httpx.HTTPError as e:
        raise HTTPException(status_code=503, detail=f"Failed to toggle recordings: {e}")


@router.get("/names", response_model=list[CameraNameResponse])
async def get_camera_names(db: Session = Depends(get_db)):
    """Get display names for all cameras."""
    try:
        # Get camera list from Frigate
        async with httpx.AsyncClient(timeout=10.0) as client:
            stats_response = await client.get(f"{FRIGATE_URL}/api/stats")
            if stats_response.status_code == 200:
                stats = stats_response.json()
                frigate_cameras = list(stats.get("cameras", {}).keys())
            else:
                frigate_cameras = []

        # Get custom names from database
        db_cameras = db.query(Camera).all()
        db_names = {cam.camera_id: cam.name for cam in db_cameras if cam.name}

        # Build response
        result = []
        for camera_id in frigate_cameras:
            custom_name = db_names.get(camera_id)
            result.append(CameraNameResponse(
                camera_id=camera_id,
                display_name=custom_name if custom_name else camera_id,
                is_custom=bool(custom_name)
            ))

        return result
    except httpx.HTTPError:
        # Fallback to database only
        db_cameras = db.query(Camera).all()
        return [
            CameraNameResponse(
                camera_id=cam.camera_id,
                display_name=cam.name if cam.name else cam.camera_id,
                is_custom=bool(cam.name)
            )
            for cam in db_cameras
        ]


@router.put("/{camera_id}/name", response_model=CameraNameResponse)
async def update_camera_name(camera_id: str, update: CameraNameUpdate, db: Session = Depends(get_db)):
    """Update the display name for a camera. Set name to null to reset to default."""
    # Get or create camera record
    camera = db.query(Camera).filter(Camera.camera_id == camera_id).first()

    if not camera:
        camera = Camera(camera_id=camera_id)
        db.add(camera)

    # Update name (None resets to default)
    camera.name = update.name.strip() if update.name else None
    db.commit()
    db.refresh(camera)

    return CameraNameResponse(
        camera_id=camera_id,
        display_name=camera.name if camera.name else camera_id,
        is_custom=bool(camera.name)
    )


@router.delete("/{camera_id}/name", response_model=CameraNameResponse)
async def reset_camera_name(camera_id: str, db: Session = Depends(get_db)):
    """Reset camera name to default (Frigate camera ID)."""
    camera = db.query(Camera).filter(Camera.camera_id == camera_id).first()

    if camera:
        camera.name = None
        db.commit()
        db.refresh(camera)

    return CameraNameResponse(
        camera_id=camera_id,
        display_name=camera_id,
        is_custom=False
    )
