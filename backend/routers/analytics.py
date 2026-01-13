"""Analytics API router for dashboard charts using real InfluxDB data."""

import csv
import io
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Query, Response, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from services.influxdb_service import InfluxDBAnalyticsService
from services.dwell_time_service import DwellTimeService
from database import get_db

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
