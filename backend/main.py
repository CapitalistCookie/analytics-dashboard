"""Restaurant Analytics Dashboard - FastAPI Backend."""
import os
import asyncio
import logging
from datetime import datetime, timedelta
from contextlib import asynccontextmanager
import httpx
from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from database import get_db, init_db, InfluxDBConnection, INFLUXDB_BUCKET, INFLUXDB_ORG
from routers import staff, analytics, search, alerts, auth, profile, admin, settings, reports, shifts, scorecards, zones, cameras, incidents, notes, activity, reid, detection_config, anomalies, flow, actions, staff_analytics, insights
from cache import frigate_cache, cached

# Configure logging for reid_worker to show INFO level
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logging.getLogger("reid_worker").setLevel(logging.INFO)

# Configuration
FRIGATE_URL = os.getenv("FRIGATE_URL", "http://localhost:5000")
ENABLE_REID_WORKER = os.getenv("ENABLE_REID_WORKER", "true").lower() == "true"
logger = logging.getLogger(__name__)

# Rate limiting configuration
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["100/minute"],
    storage_uri="memory://",
)

def custom_rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    """Custom handler for rate limit exceeded with Retry-After header."""
    retry_after = getattr(exc, 'retry_after', 60)
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded. Please try again later."},
        headers={"Retry-After": str(retry_after)}
    )
# Global reference to ReID worker task
_reid_worker_task = None
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    global _reid_worker_task
    # Startup
    init_db()
    # Start ReID worker in background
    if ENABLE_REID_WORKER:
        try:
            from reid_worker import ReIDWorker
            async def run_reid_worker():
                worker = ReIDWorker()
                try:
                    await worker.start()
                except Exception as e:
                    logger.error(f"ReID worker error: {e}")
            _reid_worker_task = asyncio.create_task(run_reid_worker())
            logger.info("ReID worker started in background")
        except ImportError as e:
            logger.warning(f"Could not import ReID worker: {e}")
        except Exception as e:
            logger.error(f"Failed to start ReID worker: {e}")
    yield
    # Shutdown
    if _reid_worker_task:
        _reid_worker_task.cancel()
        try:
            await _reid_worker_task
        except asyncio.CancelledError:
            pass
        logger.info("ReID worker stopped")
    InfluxDBConnection.close()
app = FastAPI(
    title="Restaurant Analytics Dashboard",
    description="Analytics backend for Frigate-based people tracking",
    version="1.0.0",
    lifespan=lifespan
)
# GZip compression for responses > 500 bytes
app.add_middleware(GZipMiddleware, minimum_size=500)
# CORS configuration for frontend
_default_origins = ["http://192.168.1.252:3000", "http://dashboard.jangmojib.com"]
_cors_origins_env = os.getenv("CORS_ALLOWED_ORIGINS", "")
CORS_ALLOWED_ORIGINS = [o.strip() for o in _cors_origins_env.split(",") if o.strip()] or _default_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiting middleware
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, custom_rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Include routers
app.include_router(staff.router)
app.include_router(analytics.router)
app.include_router(search.router)
app.include_router(alerts.router)
app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(admin.router)
app.include_router(settings.router)
app.include_router(reports.router)
app.include_router(shifts.router)
app.include_router(scorecards.router)
app.include_router(zones.router)
app.include_router(cameras.router)
app.include_router(incidents.router)
app.include_router(notes.router)
app.include_router(activity.router)
app.include_router(reid.router)
app.include_router(detection_config.router)
app.include_router(anomalies.router)
app.include_router(flow.router)
app.include_router(actions.router)
app.include_router(staff_analytics.router)
app.include_router(insights.router)

# WebSocket for real-time dashboard updates
from websocket_manager import ws_manager


@app.websocket("/ws/dashboard")
async def dashboard_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for real-time dashboard updates.

    Pushes events:
    - occupancy:update - current occupancy counts
    - camera:status - camera status changes
    - queue:update - queue status changes
    """
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive, handle pings
            data = await websocket.receive_text()
            # Handle ping/pong for keep-alive
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket)
    except Exception as e:
        logger.debug(f"WebSocket error: {e}")
        await ws_manager.disconnect(websocket)


@app.get("/api/ws/status")
async def websocket_status():
    """Get WebSocket connection status."""
    return {
        "active_connections": ws_manager.connection_count,
        "status": "available"
    }


# Pydantic models for API responses
class HealthResponse(BaseModel):
    status: str
    frigate: bool
    influxdb: bool
    database: bool
    memory_mb: float = 0.0
    memory_percent: float = 0.0
class CameraInfo(BaseModel):
    camera_id: str
    fps: float
    detection_fps: float
    process_fps: float
    capture_pid: int | None = None
    ffmpeg_pid: int | None = None
class OccupancyData(BaseModel):
    timestamp: datetime
    total_count: int
    by_camera: dict[str, int]
    by_zone: dict[str, int]
# Memory debug endpoint
@app.get("/api/debug/memory")
async def debug_memory():
    """Debug endpoint for memory profiling."""
    import gc
    import resource
    from collections import Counter
    gc.collect()
    # Get all objects by type
    type_counts = Counter(type(obj).__name__ for obj in gc.get_objects())
    top_types = type_counts.most_common(20)
    # Get memory info using resource module (built-in)
    usage = resource.getrusage(resource.RUSAGE_SELF)
    rss_mb = usage.ru_maxrss / 1024  # KB to MB on Linux
    # Get cache size
    cache_size = frigate_cache.size()
    return {
        "rss_mb": round(rss_mb, 1),
        "top_object_types": top_types,
        "total_objects": len(gc.get_objects()),
        "cache_size": cache_size
    }
# Health check endpoint
@app.get("/api/health", response_model=HealthResponse)
async def health_check(db: Session = Depends(get_db)):
    """Check health of all services."""
    import resource
    # Check memory usage
    memory_mb = 0.0
    memory_percent = 0.0
    try:
        # Get memory usage in MB
        usage = resource.getrusage(resource.RUSAGE_SELF)
        memory_mb = usage.ru_maxrss / 1024  # Convert KB to MB on Linux
        # Estimate percentage (4GB limit)
        memory_percent = (memory_mb / 4096) * 100
    except Exception:
        pass
    # Check Frigate
    frigate_ok = False
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{FRIGATE_URL}/api/version")
            frigate_ok = response.status_code == 200
    except Exception:
        pass
    # Check InfluxDB
    influxdb_ok = InfluxDBConnection.health_check()
    # Check SQLite (if we got here with db, it's working)
    db_ok = True
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
    # Determine overall status - warn if memory is high
    if memory_mb > 2048:  # Over 2GB
        overall = "warning"
    elif frigate_ok and db_ok:
        overall = "healthy"
    else:
        overall = "degraded"
    return HealthResponse(
        status=overall,
        frigate=frigate_ok,
        influxdb=influxdb_ok,
        database=db_ok,
        memory_mb=round(memory_mb, 1),
        memory_percent=round(memory_percent, 1)
    )
# Camera endpoints
@app.get("/api/cameras", response_model=list[CameraInfo])
async def list_cameras():
    """Get list of cameras from Frigate with their stats. Cached for 2 seconds."""
    # Check cache first
    cached_cameras = await frigate_cache.get("cameras_list")
    if cached_cameras is not None:
        return cached_cameras
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{FRIGATE_URL}/api/stats")
            response.raise_for_status()
            stats = response.json()
            cameras = []
            for camera_id, camera_stats in stats.get("cameras", {}).items():
                cameras.append(CameraInfo(
                    camera_id=camera_id,
                    fps=camera_stats.get("camera_fps", 0),
                    detection_fps=camera_stats.get("detection_fps", 0),
                    process_fps=camera_stats.get("process_fps", 0),
                    capture_pid=camera_stats.get("capture_pid"),
                    ffmpeg_pid=camera_stats.get("ffmpeg_pid")
                ))
            # Cache for 2 seconds
            await frigate_cache.set("cameras_list", cameras, ttl=2.0)
            return cameras
    except httpx.HTTPError as e:
        raise HTTPException(status_code=503, detail=f"Failed to connect to Frigate: {e}")
@app.get("/api/cameras/{camera_id}")
async def get_camera(camera_id: str):
    """Get specific camera details from Frigate."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{FRIGATE_URL}/api/{camera_id}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail=f"Camera {camera_id} not found")
        raise HTTPException(status_code=503, detail=f"Failed to connect to Frigate: {e}")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=503, detail=f"Failed to connect to Frigate: {e}")
# Analytics endpoints
@app.get("/api/analytics/occupancy", response_model=OccupancyData)
async def get_current_occupancy():
    """Get current occupancy from Frigate's active in-progress events."""
    try:
        # Get currently active person detections from Frigate (real-time, not cumulative)
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{FRIGATE_URL}/api/events", params={
                "in_progress": 1,
                "label": "person",
                "limit": 100
            })
            response.raise_for_status()
            events = response.json()

        by_camera = {}
        for event in events:
            camera = event.get("camera", "unknown")
            by_camera[camera] = by_camera.get(camera, 0) + 1

        total = len(events)

        # Get zone breakdown from active events
        by_zone = {}
        for event in events:
            zones = event.get("current_zones", []) or event.get("entered_zones", [])
            for zone in zones:
                by_zone[zone] = by_zone.get(zone, 0) + 1

        return OccupancyData(
            timestamp=datetime.utcnow(),
            total_count=total,
            by_camera=by_camera,
            by_zone=by_zone
        )
    except Exception as e:
        logger.warning(f"Failed to get occupancy from Frigate: {e}")
        # Return zeros if Frigate is not available
        return OccupancyData(
            timestamp=datetime.utcnow(),
            total_count=0,
            by_camera={},
            by_zone={}
        )
@app.get("/api/analytics/occupancy/history")
async def get_occupancy_history(hours: int = 24):
    """Get historical occupancy data."""
    try:
        query_api = InfluxDBConnection.get_query_api()
        # Query person_detection measurement and aggregate by 5-minute windows
        query = f'''
        from(bucket: "{INFLUXDB_BUCKET}")
            |> range(start: -{hours}h)
            |> filter(fn: (r) => r._measurement == "person_detection")
            |> filter(fn: (r) => r._field == "confidence")
            |> group()
            |> aggregateWindow(every: 5m, fn: count, createEmpty: true)
            |> yield(name: "count")
        '''
        result = query_api.query(query, org=INFLUXDB_ORG)
        history = []
        for table in result:
            for record in table.records:
                count = record.get_value()
                history.append({
                    "timestamp": record.get_time().isoformat(),
                    "total_count": int(count) if count else 0,
                    "by_camera": {},
                    "by_zone": {}
                })
        return {"history": history}
    except Exception as e:
        return {"history": [], "error": str(e)}
# Events endpoints
@app.get("/api/events")
async def get_recent_events(limit: int = 50, label: str = "person", camera: str = None, in_progress: int = None):
    """Get recent detection events from Frigate.
    Args:
        limit: Maximum number of events to return
        label: Filter by label (e.g., 'person', 'car')
        camera: Filter by camera ID
        in_progress: Set to 1 to get only in-progress (active) events with real-time positions
    Cached for 2 seconds (in-progress events use 0.5s cache for real-time tracking).
    """
    cache_key = f"events_{limit}_{label}_{camera or 'all'}_{in_progress or 0}"
    cache_ttl = 0.5 if in_progress else 2.0  # Shorter cache for real-time tracking
    # Check cache first
    cached_events = await frigate_cache.get(cache_key)
    if cached_events is not None:
        return cached_events
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            params = {"limit": limit, "label": label}
            if camera:
                params["camera"] = camera
            if in_progress:
                params["in_progress"] = 1
            response = await client.get(f"{FRIGATE_URL}/api/events", params=params)
            response.raise_for_status()
            events = response.json()
            # Cache the response
            await frigate_cache.set(cache_key, events, ttl=cache_ttl)
            return events
    except httpx.HTTPError as e:
        raise HTTPException(status_code=503, detail=f"Failed to connect to Frigate: {e}")
@app.get("/api/events/{event_id}")
async def get_event(event_id: str):
    """Get specific event details from Frigate."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{FRIGATE_URL}/api/events/{event_id}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail=f"Event {event_id} not found")
        raise HTTPException(status_code=503, detail=f"Failed to connect to Frigate: {e}")
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
