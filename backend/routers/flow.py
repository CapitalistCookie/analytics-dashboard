"""Flow optimization router for bottleneck analysis and staffing recommendations."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from services.flow_service import FlowService

router = APIRouter(prefix="/api/flow", tags=["flow"])


@router.get("/bottlenecks")
async def get_bottlenecks(
    hours: int = Query(24, ge=1, le=168, description="Analysis period in hours"),
    db: Session = Depends(get_db)
):
    """
    Get bottleneck analysis for zones.

    Identifies zones with high dwell times and traffic volume.
    Returns zones sorted by bottleneck severity.
    """
    return FlowService.get_bottlenecks(db, hours)


@router.get("/transitions")
async def get_transitions(
    hours: int = Query(24, ge=1, le=168, description="Analysis period in hours"),
    db: Session = Depends(get_db)
):
    """
    Get transition probability matrix.

    Shows P(next_zone | current_zone) based on actual journey data.
    """
    return FlowService.get_transition_matrix(db, hours)


@router.get("/paths")
async def get_common_paths(
    hours: int = Query(24, ge=1, le=168, description="Analysis period in hours"),
    min_count: int = Query(2, ge=1, description="Minimum occurrences to include"),
    db: Session = Depends(get_db)
):
    """
    Get most common journey paths.

    Returns top 20 most frequent routes through the restaurant.
    """
    return FlowService.get_common_paths(db, hours, min_count)


@router.get("/heatmap")
async def get_hourly_heatmap(
    days: int = Query(7, ge=1, le=30, description="Analysis period in days"),
    db: Session = Depends(get_db)
):
    """
    Get zone activity heatmap by hour.

    Shows traffic patterns throughout the day for each zone.
    """
    return FlowService.get_hourly_heatmap(db, days)


@router.get("/staffing")
async def get_staffing_recommendations(
    hours: int = Query(168, ge=24, le=720, description="Analysis period in hours (default: 1 week)"),
    db: Session = Depends(get_db)
):
    """
    Get staffing recommendations based on traffic patterns.

    Analyzes historical data to suggest optimal staff positioning by zone and hour.
    """
    return FlowService.get_staffing_recommendations(db, hours)


@router.get("/score")
async def get_flow_score(
    hours: int = Query(24, ge=1, le=168, description="Analysis period in hours"),
    db: Session = Depends(get_db)
):
    """
    Get overall flow efficiency score.

    Returns a score (0-100) and grade (A-F) based on bottleneck analysis.
    """
    return FlowService.get_flow_score(db, hours)


@router.get("/summary")
async def get_flow_summary(
    db: Session = Depends(get_db)
):
    """
    Get complete flow analysis summary.

    Returns:
    - Flow score (24h)
    - Top 5 bottlenecks (24h)
    - Top 5 common paths (24h)
    - Top 5 staffing recommendations (1 week)
    """
    return FlowService.get_flow_summary(db)


@router.get("/adjacency")
async def get_adjacency_map():
    """
    Get zone adjacency map.

    Returns bidirectional adjacency map derived from flow connections.
    """
    return FlowService.get_adjacency_map()
