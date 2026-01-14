"""
Staff Analytics Router - API endpoints for staff operations efficiency tracking.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from services.staff_analytics_service import StaffAnalyticsService

router = APIRouter(prefix="/api/staff-analytics", tags=["staff-analytics"])


@router.get("/summary")
async def get_staff_summary(
    hours: int = Query(24, ge=1, le=168, description="Number of hours to analyze"),
    db: Session = Depends(get_db)
):
    """
    Get summary of all staff activity.

    Returns staff detection counts, zones visited, and action breakdowns.
    """
    return StaffAnalyticsService.get_staff_summary(db, hours)


@router.get("/coverage")
async def get_coverage_analysis(
    hours: int = Query(8, ge=1, le=24, description="Number of hours to analyze"),
    db: Session = Depends(get_db)
):
    """
    Analyze staff coverage across customer-facing zones.

    Returns coverage scores per zone and identifies coverage gaps.
    """
    return StaffAnalyticsService.get_coverage_analysis(db, hours)


@router.get("/efficiency")
async def get_efficiency_metrics(
    hours: int = Query(24, ge=1, le=168, description="Number of hours to analyze"),
    db: Session = Depends(get_db)
):
    """
    Get efficiency metrics per staff member.

    Calculates activity rate, mobility, and overall efficiency score.
    """
    return StaffAnalyticsService.get_efficiency_metrics(db, hours)


@router.get("/service-times")
async def get_service_times(
    hours: int = Query(24, ge=1, le=168, description="Number of hours to analyze"),
    db: Session = Depends(get_db)
):
    """
    Get estimated service times by zone.

    Based on customer dwell times in service zones.
    """
    return StaffAnalyticsService.get_service_times(db, hours)


@router.get("/shifts")
async def get_shift_comparison(
    days: int = Query(7, ge=1, le=30, description="Number of days to analyze"),
    db: Session = Depends(get_db)
):
    """
    Compare staff performance across shifts.

    Breaks down activity by morning, afternoon, and evening shifts.
    """
    return StaffAnalyticsService.get_shift_comparison(db, days)


@router.get("/positions")
async def get_realtime_positions(db: Session = Depends(get_db)):
    """
    Get current positions of all active staff.

    Returns real-time location and action for each detected staff member.
    """
    return StaffAnalyticsService.get_realtime_staff_positions(db)


@router.get("/dashboard")
async def get_staff_dashboard(db: Session = Depends(get_db)):
    """
    Get complete staff analytics dashboard data.

    Combines summary, coverage, efficiency, positions, and service times.
    """
    return StaffAnalyticsService.get_staff_dashboard(db)
