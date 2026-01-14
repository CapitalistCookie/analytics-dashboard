"""Analytics API router for dashboard charts using real InfluxDB data."""

import csv
import io
import json
import os
from datetime import datetime, timedelta
from typing import Optional, Dict, List

from fastapi import APIRouter, Query, Response, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from services.influxdb_service import InfluxDBAnalyticsService
from services.dwell_time_service import DwellTimeService
from services.queue_service import QueueService, format_wait_time
from database import get_db
from cache import analytics_cache

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


# Response models
class HourlyCount(BaseModel):
    hour: str
    customers: int
    staff: int


class DailyCount(BaseModel):
    date: str
    customers: int
    staff: int


class CameraTraffic(BaseModel):
    camera: str
    count: int
    percentage: float


class ZoneActivity(BaseModel):
    zone: str
    count: int
    activity: int  # 0-100 scale
    percentage: float


class DwellByZone(BaseModel):
    zone: str
    avg_dwell_seconds: float
    avg_dwell_minutes: float


class DwellAverage(BaseModel):
    avg_seconds: float
    avg_minutes: float
    total_events: int


class DwellDistribution(BaseModel):
    bucket: str
    count: int
    percentage: float


class PeakHour(BaseModel):
    hour: str
    avg_count: float
    total_count: int


class HeatmapCell(BaseModel):
    day: str
    day_index: int
    hour: int
    count: int


class CurrentOccupancy(BaseModel):
    total: int
    by_camera: dict[str, int]
    by_zone: dict[str, int]
    timestamp: str
    source: str


class OccupancyPoint(BaseModel):
    timestamp: str
    count: int


class AnalyticsSummary(BaseModel):
    total_visitors: int
    total_detections: int
    avg_dwell_minutes: float
    peak_hour: str
    peak_hour_count: int
    busiest_zone: str
    vs_yesterday_percent: float
    date: str


# Legacy response models for backward compatibility
class LegacyHourlyCount(BaseModel):
    hour: str
    customers: int
    staff: int


class LegacyZoneActivity(BaseModel):
    zone: str
    activity: int


class LegacySummary(BaseModel):
    total_customers: int
    avg_wait_time: float
    table_turnover_rate: float
    staff_efficiency: float
    busiest_hour: str
    peak_occupancy: int


# Helper functions
def get_date_range(range_type: str) -> tuple[str, str]:
    """Convert range type to date range."""
    today = datetime.now().date()

    if range_type == "today":
        return today.strftime("%Y-%m-%d"), today.strftime("%Y-%m-%d")
    elif range_type == "week":
        start = today - timedelta(days=6)
        return start.strftime("%Y-%m-%d"), today.strftime("%Y-%m-%d")
    elif range_type == "month":
        start = today - timedelta(days=29)
        return start.strftime("%Y-%m-%d"), today.strftime("%Y-%m-%d")
    else:
        return today.strftime("%Y-%m-%d"), today.strftime("%Y-%m-%d")


# ==================== Traffic Endpoints ====================

@router.get("/traffic/hourly", response_model=list[HourlyCount])
async def get_hourly_traffic(
    date: str = Query(None, description="Date in YYYY-MM-DD format (defaults to today)")
):
    """Get hourly traffic counts for a specific date."""
    if not date:
        date = datetime.now().strftime("%Y-%m-%d")

    data = InfluxDBAnalyticsService.get_hourly_traffic(date)
    return [HourlyCount(**item) for item in data]


@router.get("/traffic/daily", response_model=list[DailyCount])
async def get_daily_traffic(
    start: str = Query(..., description="Start date in YYYY-MM-DD format"),
    end: str = Query(..., description="End date in YYYY-MM-DD format")
):
    """Get daily traffic counts for a date range."""
    data = InfluxDBAnalyticsService.get_daily_traffic(start, end)
    return [DailyCount(**item) for item in data]


@router.get("/traffic/by-camera", response_model=list[CameraTraffic])
async def get_traffic_by_camera(
    date: str = Query(None, description="Date in YYYY-MM-DD format (defaults to today)")
):
    """Get traffic counts by camera for a specific date."""
    if not date:
        date = datetime.now().strftime("%Y-%m-%d")

    data = InfluxDBAnalyticsService.get_traffic_by_camera(date)
    return [CameraTraffic(**item) for item in data]


# ==================== Dwell Time Endpoints ====================

@router.get("/dwell/by-zone", response_model=list[DwellByZone])
async def get_dwell_by_zone(
    date: str = Query(None, description="Date in YYYY-MM-DD format"),
    days: int = Query(1, ge=1, le=30, description="Number of days to query"),
    db: Session = Depends(get_db)
):
    """Get average dwell times by zone. Falls back to SQLite if InfluxDB has no data."""
    # Try InfluxDB first
    data = InfluxDBAnalyticsService.get_dwell_times_by_zone(date=date, days=days)
    if data:
        return [DwellByZone(**item) for item in data]

    # Fall back to SQLite-based calculation
    sqlite_data = DwellTimeService.get_dwell_by_zone(db, date=date, days=days)
    return [DwellByZone(
        zone=item["zone"],
        avg_dwell_seconds=item["avg_dwell_seconds"],
        avg_dwell_minutes=item["avg_dwell_minutes"]
    ) for item in sqlite_data]


@router.get("/dwell/average", response_model=DwellAverage)
async def get_average_dwell(
    date: str = Query(None, description="Date in YYYY-MM-DD format"),
    days: int = Query(1, ge=1, le=30, description="Number of days to query"),
    db: Session = Depends(get_db)
):
    """Get overall average dwell time. Falls back to SQLite if InfluxDB has no data."""
    # Try InfluxDB first
    data = InfluxDBAnalyticsService.get_average_dwell_time(date=date, days=days)
    if data.get("total_events", 0) > 0:
        return DwellAverage(**data)

    # Fall back to SQLite-based calculation
    sqlite_data = DwellTimeService.get_average_dwell_time(db, date=date, days=days)
    return DwellAverage(**sqlite_data)


@router.get("/dwell/distribution", response_model=list[DwellDistribution])
async def get_dwell_distribution(
    date: str = Query(None, description="Date in YYYY-MM-DD format"),
    days: int = Query(1, ge=1, le=30, description="Number of days to query"),
    db: Session = Depends(get_db)
):
    """Get dwell time distribution in buckets. Falls back to SQLite if InfluxDB has no data."""
    # Try InfluxDB first
    data = InfluxDBAnalyticsService.get_dwell_distribution(date=date, days=days)
    total_count = sum(item.get("count", 0) for item in data)
    if total_count > 0:
        return [DwellDistribution(**item) for item in data]

    # Fall back to SQLite-based calculation
    sqlite_data = DwellTimeService.get_dwell_distribution(db, date=date, days=days)
    return [DwellDistribution(**item) for item in sqlite_data]


# ==================== Peak Hours Endpoints ====================

@router.get("/peak-hours", response_model=list[PeakHour])
async def get_peak_hours(
    days: int = Query(7, ge=1, le=30, description="Number of days to analyze")
):
    """Get peak hours analysis."""
    data = InfluxDBAnalyticsService.get_peak_hours(days=days)
    return [PeakHour(**item) for item in data]


@router.get("/heatmap", response_model=list[HeatmapCell])
async def get_day_hour_heatmap(
    days: int = Query(7, ge=1, le=30, description="Number of days to analyze")
):
    """Get day/hour heatmap data for visualization."""
    data = InfluxDBAnalyticsService.get_day_hour_heatmap(days=days)
    return [HeatmapCell(**item) for item in data]


# ==================== Occupancy Endpoints ====================

@router.get("/occupancy/current", response_model=CurrentOccupancy)
async def get_current_occupancy():
    """Get current real-time occupancy."""
    data = InfluxDBAnalyticsService.get_current_occupancy()
    return CurrentOccupancy(**data)


@router.get("/occupancy/history", response_model=list[OccupancyPoint])
async def get_occupancy_history(
    date: str = Query(None, description="Date in YYYY-MM-DD format (defaults to today)")
):
    """Get occupancy history for a specific date."""
    if not date:
        date = datetime.now().strftime("%Y-%m-%d")

    data = InfluxDBAnalyticsService.get_occupancy_history(date)
    return [OccupancyPoint(**item) for item in data]


# ==================== Zone Endpoints ====================

@router.get("/zones/traffic", response_model=list[ZoneActivity])
async def get_zone_traffic(
    date: str = Query(None, description="Date in YYYY-MM-DD format"),
    days: int = Query(1, ge=1, le=30, description="Number of days to query")
):
    """Get zone traffic/activity data."""
    data = InfluxDBAnalyticsService.get_zone_activity(date=date, days=days)
    return [ZoneActivity(**item) for item in data]


@router.get("/zones/heatmap-data", response_model=list[ZoneActivity])
async def get_zone_heatmap_data(
    date: str = Query(None, description="Date in YYYY-MM-DD format"),
    days: int = Query(1, ge=1, le=30, description="Number of days to query")
):
    """Get zone heatmap data (same as traffic but named for clarity)."""
    data = InfluxDBAnalyticsService.get_zone_activity(date=date, days=days)
    return [ZoneActivity(**item) for item in data]


# ==================== Summary Endpoint ====================

@router.get("/summary/date", response_model=AnalyticsSummary)
async def get_summary_by_date(
    date: str = Query(None, description="Date in YYYY-MM-DD format (defaults to today)")
):
    """Get summary analytics for a specific date."""
    if not date:
        date = datetime.now().strftime("%Y-%m-%d")

    data = InfluxDBAnalyticsService.get_analytics_summary(date)
    return AnalyticsSummary(**data)


# ==================== Export Endpoint ====================

@router.get("/export/csv")
async def export_csv(
    date: str = Query(None, description="Date in YYYY-MM-DD format (defaults to today)")
):
    """Export detection data as CSV."""
    if not date:
        date = datetime.now().strftime("%Y-%m-%d")

    data = InfluxDBAnalyticsService.export_detections_csv(date)

    # Create CSV in memory
    output = io.StringIO()
    if data:
        writer = csv.DictWriter(output, fieldnames=data[0].keys())
        writer.writeheader()
        writer.writerows(data)
    else:
        # Write empty CSV with headers
        writer = csv.DictWriter(output, fieldnames=["timestamp", "camera", "track_id", "classification", "confidence", "dwell_time"])
        writer.writeheader()

    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=detections_{date}.csv"}
    )


# ==================== Legacy Endpoints (backward compatibility) ====================

@router.get("/hourly-counts", response_model=list[LegacyHourlyCount])
async def get_hourly_counts(
    date_range: str = Query("today", alias="range", pattern="^(today|week|month)$")
):
    """Get hourly customer and staff counts (legacy endpoint)."""
    start_date, end_date = get_date_range(date_range)

    # For "today", use single day query
    if date_range == "today":
        data = InfluxDBAnalyticsService.get_hourly_traffic(start_date)
    else:
        # For week/month, aggregate hourly data
        data = InfluxDBAnalyticsService.get_hourly_traffic(end_date)  # Use most recent day

    return [LegacyHourlyCount(**item) for item in data]


@router.get("/zone-activity", response_model=list[LegacyZoneActivity])
async def get_zone_activity_legacy(
    date_range: str = Query("today", alias="range", pattern="^(today|week|month)$")
):
    """Get activity levels by zone (legacy endpoint)."""
    days = 1 if date_range == "today" else (7 if date_range == "week" else 30)
    data = InfluxDBAnalyticsService.get_zone_activity(days=days)

    # Convert to legacy format
    return [LegacyZoneActivity(zone=item["zone"], activity=item["activity"]) for item in data]


@router.get("/staff-performance")
async def get_staff_performance(
    date_range: str = Query("today", alias="range", pattern="^(today|week|month)$")
):
    """Get staff performance metrics (placeholder - requires ReID data)."""
    # This would need ReID tracking data to work properly
    # For now, return empty or placeholder data
    return []


@router.get("/wait-times")
async def get_wait_times(
    date_range: str = Query("today", alias="range", pattern="^(today|week|month)$")
):
    """Get wait time trends (placeholder - requires queue tracking)."""
    # This would need specific queue/wait tracking
    return []


@router.get("/table-turnover")
async def get_table_turnover(
    date_range: str = Query("today", alias="range", pattern="^(today|week|month)$")
):
    """Get table turnover rates (placeholder - requires table tracking)."""
    # This would need specific table tracking
    return []


@router.get("/customer-staff-breakdown")
async def get_customer_staff_breakdown(
    date_range: str = Query("today", alias="range", pattern="^(today|week|month)$")
):
    """Get breakdown of people detected (customers vs staff)."""
    start_date, end_date = get_date_range(date_range)
    days = 1 if date_range == "today" else (7 if date_range == "week" else 30)

    # Get hourly data and sum up
    if date_range == "today":
        hourly_data = InfluxDBAnalyticsService.get_hourly_traffic(start_date)
    else:
        # Get daily data for longer ranges
        daily_data = InfluxDBAnalyticsService.get_daily_traffic(start_date, end_date)
        # Sum customers/staff from daily data
        total_customers = sum(d.get("customers", 0) for d in daily_data)
        total_staff = sum(d.get("staff", 0) for d in daily_data)
        return [
            {"label": "Customers", "value": total_customers},
            {"label": "Staff", "value": total_staff}
        ]

    total_customers = sum(h["customers"] for h in hourly_data)
    total_staff = sum(h["staff"] for h in hourly_data)

    return [
        {"label": "Customers", "value": total_customers},
        {"label": "Staff", "value": total_staff}
    ]


@router.get("/summary", response_model=LegacySummary)
async def get_analytics_summary_legacy(
    date_range: str = Query("today", alias="range", pattern="^(today|week|month)$")
):
    """Get summary analytics for the selected period (legacy endpoint)."""
    start_date, end_date = get_date_range(date_range)

    # Get real summary data
    summary = InfluxDBAnalyticsService.get_analytics_summary(end_date)

    # Convert to legacy format
    return LegacySummary(
        total_customers=summary.get("total_detections", 0),
        avg_wait_time=0,  # Not available without queue tracking
        table_turnover_rate=0,  # Not available without table tracking
        staff_efficiency=0,  # Not available without staff tracking
        busiest_hour=summary.get("peak_hour", "N/A"),
        peak_occupancy=summary.get("peak_hour_count", 0)
    )


@router.get("/occupancy/live")
async def get_live_occupancy():
    """Get current live occupancy from InfluxDB."""
    data = InfluxDBAnalyticsService.get_current_occupancy()
    return data


# ==================== Enhanced Dwell Time Endpoints (SQLite-based) ====================

class VisitDurationStats(BaseModel):
    avg_visit_minutes: float
    min_visit_minutes: float
    max_visit_minutes: float
    total_visits: int


class HourlyDwellTrend(BaseModel):
    hour: str
    avg_dwell_minutes: float
    count: int


class DwellSummary(BaseModel):
    avg_dwell_seconds: float
    avg_dwell_minutes: float
    total_sightings: int
    avg_visit_minutes: float
    total_visits: int
    longest_dwell_zone: str
    busiest_zone: str
    zones: list[dict]


@router.get("/dwell/visit-stats", response_model=VisitDurationStats)
async def get_visit_duration_stats(
    date: str = Query(None, description="Date in YYYY-MM-DD format"),
    days: int = Query(1, ge=1, le=30, description="Number of days to query"),
    db: Session = Depends(get_db)
):
    """Get visit duration statistics (total time per visitor)."""
    data = DwellTimeService.get_visit_duration_stats(db, date=date, days=days)
    return VisitDurationStats(**data)


@router.get("/dwell/hourly-trend", response_model=list[HourlyDwellTrend])
async def get_hourly_dwell_trend(
    date: str = Query(None, description="Date in YYYY-MM-DD format"),
    db: Session = Depends(get_db)
):
    """Get average dwell time by hour of day."""
    data = DwellTimeService.get_hourly_dwell_trend(db, date=date)
    return [HourlyDwellTrend(**item) for item in data]


@router.get("/dwell/summary", response_model=DwellSummary)
async def get_dwell_summary(
    date: str = Query(None, description="Date in YYYY-MM-DD format"),
    days: int = Query(1, ge=1, le=30, description="Number of days to query"),
    db: Session = Depends(get_db)
):
    """Get comprehensive dwell time summary."""
    data = DwellTimeService.get_dwell_summary(db, date=date, days=days)
    return DwellSummary(**data)


# ==================== Queue Detection Endpoints ====================

class QueuePersonResponse(BaseModel):
    person_id: int
    display_id: str
    enter_time: str
    wait_seconds: int
    wait_formatted: str


class QueueStatusResponse(BaseModel):
    zone: str
    queue_length: int
    people: list[QueuePersonResponse]
    avg_wait_seconds: float
    avg_wait_formatted: str
    max_wait_seconds: int
    max_wait_formatted: str
    updated_at: str


class QueueAlertResponse(BaseModel):
    zone: str
    type: str
    severity: str
    message: str
    value: int
    threshold: int


class QueueHistoryPoint(BaseModel):
    hour: str
    queue_count: int
    avg_wait_seconds: float
    completed_visits: int


@router.get("/queue/status", response_model=QueueStatusResponse)
async def get_queue_status(
    zone: str = Query("entrance", description="Queue zone to check"),
    db: Session = Depends(get_db)
):
    """Get current queue status for a zone (entrance by default)."""
    service = QueueService(db)
    status = service.get_queue_status(zone)

    if not status:
        return QueueStatusResponse(
            zone=zone,
            queue_length=0,
            people=[],
            avg_wait_seconds=0,
            avg_wait_formatted="0s",
            max_wait_seconds=0,
            max_wait_formatted="0s",
            updated_at=datetime.utcnow().isoformat()
        )

    people = [
        QueuePersonResponse(
            person_id=p.person_id,
            display_id=p.display_id,
            enter_time=p.enter_time.isoformat(),
            wait_seconds=p.wait_seconds,
            wait_formatted=format_wait_time(p.wait_seconds)
        )
        for p in status.people
    ]

    return QueueStatusResponse(
        zone=status.zone,
        queue_length=status.queue_length,
        people=people,
        avg_wait_seconds=status.avg_wait_seconds,
        avg_wait_formatted=format_wait_time(int(status.avg_wait_seconds)),
        max_wait_seconds=status.max_wait_seconds,
        max_wait_formatted=format_wait_time(status.max_wait_seconds),
        updated_at=status.updated_at.isoformat()
    )


@router.get("/queue/alerts", response_model=list[QueueAlertResponse])
async def get_queue_alerts(db: Session = Depends(get_db)):
    """Get active queue alerts (long waits, high queue length)."""
    service = QueueService(db)
    alerts = service.get_queue_alerts()
    return [QueueAlertResponse(**alert) for alert in alerts]


@router.get("/queue/history", response_model=list[QueueHistoryPoint])
async def get_queue_history(
    zone: str = Query("entrance", description="Queue zone"),
    hours: int = Query(24, ge=1, le=168, description="Hours of history"),
    db: Session = Depends(get_db)
):
    """Get historical queue data for a zone."""
    service = QueueService(db)
    data = service.get_queue_history(zone, hours)
    return [QueueHistoryPoint(**item) for item in data]


@router.get("/queue/all")
async def get_all_queues(db: Session = Depends(get_db)):
    """Get status for all queue zones."""
    service = QueueService(db)
    queues = service.get_all_queues()

    result = {}
    for zone, status in queues.items():
        people = [
            {
                "person_id": p.person_id,
                "display_id": p.display_id,
                "enter_time": p.enter_time.isoformat(),
                "wait_seconds": p.wait_seconds,
                "wait_formatted": format_wait_time(p.wait_seconds)
            }
            for p in status.people
        ]

        result[zone] = {
            "zone": status.zone,
            "queue_length": status.queue_length,
            "people": people,
            "avg_wait_seconds": status.avg_wait_seconds,
            "avg_wait_formatted": format_wait_time(int(status.avg_wait_seconds)),
            "max_wait_seconds": status.max_wait_seconds,
            "max_wait_formatted": format_wait_time(status.max_wait_seconds),
            "updated_at": status.updated_at.isoformat()
        }

    return result


# ==================== Pose Estimation Endpoints ====================

class PoseStats(BaseModel):
    total_active: int
    seated: int
    standing: int
    unknown: int
    seated_by_zone: dict[str, int]
    standing_by_zone: dict[str, int]
    updated_at: str


@router.get("/pose/stats", response_model=PoseStats)
async def get_pose_stats(db: Session = Depends(get_db)):
    """
    Get current pose statistics - how many people are seated vs standing.

    This uses pose_state from PersonSighting records.
    """
    from models import PersonSighting, TrackedPerson
    from datetime import timedelta

    now = datetime.utcnow()
    cutoff = now - timedelta(minutes=30)

    # Get active sightings (no exit_time)
    active_sightings = db.query(PersonSighting).join(
        TrackedPerson, PersonSighting.person_id == TrackedPerson.id
    ).filter(
        PersonSighting.exit_time.is_(None),
        PersonSighting.enter_time >= cutoff,
        TrackedPerson.is_active == True
    ).all()

    seated = 0
    standing = 0
    unknown = 0
    seated_by_zone: dict[str, int] = {}
    standing_by_zone: dict[str, int] = {}

    for sighting in active_sightings:
        zone = sighting.zone_name or "unknown"
        pose = sighting.pose_state

        if pose == "seated":
            seated += 1
            seated_by_zone[zone] = seated_by_zone.get(zone, 0) + 1
        elif pose == "standing":
            standing += 1
            standing_by_zone[zone] = standing_by_zone.get(zone, 0) + 1
        else:
            unknown += 1

    return PoseStats(
        total_active=len(active_sightings),
        seated=seated,
        standing=standing,
        unknown=unknown,
        seated_by_zone=seated_by_zone,
        standing_by_zone=standing_by_zone,
        updated_at=now.isoformat()
    )


# ==================== Cache Stats Endpoint ====================

class CacheStatsResponse(BaseModel):
    name: str
    size: int
    max_size: int
    hits: int
    misses: int
    total_requests: int
    hit_rate_percent: float


@router.get("/cache/stats", response_model=CacheStatsResponse)
async def get_cache_stats():
    """
    Get analytics cache statistics including hit rate.

    Use this endpoint to monitor cache effectiveness.
    """
    stats = analytics_cache.get_stats()
    return CacheStatsResponse(**stats)


@router.post("/cache/reset")
async def reset_cache_stats():
    """Reset cache hit/miss counters (does not clear cached data)."""
    analytics_cache.reset_stats()
    return {"status": "ok", "message": "Cache stats reset"}


@router.post("/cache/clear")
async def clear_cache():
    """Clear all cached analytics data."""
    await analytics_cache.clear()
    analytics_cache.reset_stats()
    return {"status": "ok", "message": "Cache cleared"}


# ==================== Floor Plan Camera Positions ====================

# File to store camera positions
CAMERA_POSITIONS_FILE = "/app/data/camera_positions.json"

# Default positions if no file exists
DEFAULT_CAMERA_POSITIONS = {
    "entrance": {"x": 10, "y": 50, "label": "Entrance"},
    "bar_lounge": {"x": 25, "y": 40, "label": "Bar Lounge"},
    "bar": {"x": 25, "y": 25, "label": "Bar"},
    "seating": {"x": 50, "y": 55, "label": "Seating"},
    "cashier": {"x": 40, "y": 35, "label": "Cashier"},
    "food_pickup": {"x": 35, "y": 15, "label": "Food Pickup"},
    "kitchen": {"x": 50, "y": 10, "label": "Kitchen"},
    "hallway": {"x": 60, "y": 45, "label": "Hallway"},
    "back_hallway": {"x": 75, "y": 25, "label": "Back Hall"},
    "vip_room": {"x": 70, "y": 65, "label": "VIP Room"},
    "karaoke": {"x": 85, "y": 75, "label": "Karaoke"},
    "patio": {"x": 65, "y": 80, "label": "Patio"},
    "storage": {"x": 85, "y": 15, "label": "Storage"},
    "office": {"x": 90, "y": 30, "label": "Office"},
}


class CameraPosition(BaseModel):
    x: float
    y: float
    label: str


class CameraPositionsUpdate(BaseModel):
    positions: Dict[str, CameraPosition]


def load_camera_positions() -> dict:
    """Load camera positions from file or return defaults."""
    if os.path.exists(CAMERA_POSITIONS_FILE):
        try:
            with open(CAMERA_POSITIONS_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return DEFAULT_CAMERA_POSITIONS.copy()


def save_camera_positions(positions: dict):
    """Save camera positions to file."""
    os.makedirs(os.path.dirname(CAMERA_POSITIONS_FILE), exist_ok=True)
    with open(CAMERA_POSITIONS_FILE, "w") as f:
        json.dump(positions, f, indent=2)


@router.get("/floorplan/positions")
async def get_camera_positions():
    """
    Get camera positions for floor plan visualization.

    Returns dict of camera_id -> {x, y, label}
    Coordinates are percentages (0-100) of the floor plan dimensions.
    """
    positions = load_camera_positions()
    return {"positions": positions}


@router.put("/floorplan/positions")
async def update_camera_positions(update: CameraPositionsUpdate):
    """
    Update camera positions for floor plan.

    Expects dict of camera_id -> {x, y, label}
    Coordinates should be percentages (0-100).
    """
    # Load existing and merge with updates
    positions = load_camera_positions()

    for camera_id, pos in update.positions.items():
        positions[camera_id] = {
            "x": pos.x,
            "y": pos.y,
            "label": pos.label,
        }

    save_camera_positions(positions)
    return {"status": "ok", "message": f"Updated {len(update.positions)} camera positions"}


@router.put("/floorplan/positions/{camera_id}")
async def update_single_camera_position(camera_id: str, position: CameraPosition):
    """
    Update a single camera's position.
    """
    positions = load_camera_positions()
    positions[camera_id] = {
        "x": position.x,
        "y": position.y,
        "label": position.label,
    }
    save_camera_positions(positions)
    return {"status": "ok", "camera_id": camera_id, "position": positions[camera_id]}


@router.post("/floorplan/positions/reset")
async def reset_camera_positions():
    """Reset camera positions to defaults."""
    save_camera_positions(DEFAULT_CAMERA_POSITIONS.copy())
    return {"status": "ok", "message": "Camera positions reset to defaults"}


# ==================== Floor Plan Flow Connections ====================

FLOW_CONNECTIONS_FILE = "/app/data/flow_connections.json"

# Default flow connections: [from, to] pairs showing direction of typical flow
DEFAULT_FLOW_CONNECTIONS = [
    # From entrance
    ["entrance", "bar_lounge"],
    ["entrance", "hallway"],
    # From bar_lounge
    ["bar_lounge", "cashier"],
    ["bar_lounge", "seating"],
    ["bar_lounge", "bar"],
    # Bar area
    ["bar", "food_pickup"],
    ["food_pickup", "kitchen"],
    # Kitchen/back area
    ["kitchen", "back_hallway"],
    ["kitchen", "storage"],
    ["back_hallway", "storage"],
    ["back_hallway", "office"],
    ["back_hallway", "hallway"],
    # Main area
    ["hallway", "seating"],
    ["hallway", "cashier"],
    ["seating", "cashier"],
    ["seating", "patio"],
    # VIP/Karaoke
    ["cashier", "vip_room"],
    ["vip_room", "karaoke"],
]


class FlowConnection(BaseModel):
    from_camera: str
    to_camera: str


class FlowConnectionsUpdate(BaseModel):
    connections: List[List[str]]


def load_flow_connections() -> List[List[str]]:
    """Load flow connections from file or return defaults."""
    if os.path.exists(FLOW_CONNECTIONS_FILE):
        try:
            with open(FLOW_CONNECTIONS_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return [list(conn) for conn in DEFAULT_FLOW_CONNECTIONS]


def save_flow_connections(connections: List[List[str]]):
    """Save flow connections to file."""
    os.makedirs(os.path.dirname(FLOW_CONNECTIONS_FILE), exist_ok=True)
    with open(FLOW_CONNECTIONS_FILE, "w") as f:
        json.dump(connections, f, indent=2)


# Backup file path
FLOW_CONNECTIONS_BACKUP_FILE = "/app/data/flow_connections_backup.json"


def backup_flow_connections():
    """Create a backup of current flow connections."""
    connections = load_flow_connections()
    os.makedirs(os.path.dirname(FLOW_CONNECTIONS_BACKUP_FILE), exist_ok=True)
    with open(FLOW_CONNECTIONS_BACKUP_FILE, "w") as f:
        json.dump({
            "connections": connections,
            "backup_time": datetime.now().isoformat(),
        }, f, indent=2)


def load_flow_connections_backup() -> Optional[dict]:
    """Load backup of flow connections if it exists."""
    if os.path.exists(FLOW_CONNECTIONS_BACKUP_FILE):
        try:
            with open(FLOW_CONNECTIONS_BACKUP_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return None


@router.get("/floorplan/flows")
async def get_flow_connections():
    """
    Get flow connections for floor plan visualization.

    Returns list of [from_camera, to_camera] pairs indicating direction.
    """
    connections = load_flow_connections()
    return {"connections": connections}


@router.put("/floorplan/flows")
async def update_flow_connections(update: FlowConnectionsUpdate):
    """
    Update all flow connections.

    Expects list of [from_camera, to_camera] pairs.
    Creates a backup before saving and invalidates the ReID adjacency cache.
    """
    # Create backup before saving
    backup_flow_connections()

    # Save new connections
    save_flow_connections(update.connections)

    # Invalidate ReID adjacency cache so it picks up changes
    try:
        from reid_worker import invalidate_adjacency_cache
        invalidate_adjacency_cache()
    except ImportError:
        pass  # ReID worker may not be available

    return {"status": "ok", "message": f"Updated {len(update.connections)} flow connections (backup created)"}


@router.put("/floorplan/flows/reverse")
async def reverse_flow_connection(connection: FlowConnection):
    """
    Reverse a specific flow connection direction.
    """
    connections = load_flow_connections()

    # Find and reverse the connection
    for i, conn in enumerate(connections):
        if conn[0] == connection.from_camera and conn[1] == connection.to_camera:
            connections[i] = [connection.to_camera, connection.from_camera]
            save_flow_connections(connections)
            return {
                "status": "ok",
                "message": f"Reversed flow: {connection.to_camera} -> {connection.from_camera}",
                "connection": connections[i]
            }

    # Connection not found - maybe it's already reversed, check the other direction
    for i, conn in enumerate(connections):
        if conn[0] == connection.to_camera and conn[1] == connection.from_camera:
            connections[i] = [connection.from_camera, connection.to_camera]
            save_flow_connections(connections)
            return {
                "status": "ok",
                "message": f"Reversed flow: {connection.from_camera} -> {connection.to_camera}",
                "connection": connections[i]
            }

    return {"status": "error", "message": "Connection not found"}


@router.post("/floorplan/flows/reset")
async def reset_flow_connections():
    """Reset flow connections to defaults."""
    # Create backup before reset
    backup_flow_connections()

    save_flow_connections([list(conn) for conn in DEFAULT_FLOW_CONNECTIONS])

    # Invalidate ReID cache
    try:
        from reid_worker import invalidate_adjacency_cache
        invalidate_adjacency_cache()
    except ImportError:
        pass

    return {"status": "ok", "message": "Flow connections reset to defaults (backup created)"}


@router.post("/floorplan/flows/restore")
async def restore_flow_connections():
    """Restore flow connections from backup."""
    backup = load_flow_connections_backup()

    if not backup or "connections" not in backup:
        return {"status": "error", "message": "No backup found"}

    save_flow_connections(backup["connections"])

    # Invalidate ReID cache
    try:
        from reid_worker import invalidate_adjacency_cache
        invalidate_adjacency_cache()
    except ImportError:
        pass

    return {
        "status": "ok",
        "message": f"Restored from backup created at {backup.get('backup_time', 'unknown')}",
        "connections_count": len(backup["connections"])
    }


@router.get("/floorplan/flows/backup")
async def get_flow_connections_backup():
    """Get information about the current backup."""
    backup = load_flow_connections_backup()

    if not backup:
        return {"has_backup": False}

    return {
        "has_backup": True,
        "backup_time": backup.get("backup_time"),
        "connections_count": len(backup.get("connections", []))
    }
