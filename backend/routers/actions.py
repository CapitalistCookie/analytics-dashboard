"""
Actions Router - API endpoints for action recognition analytics.
"""

from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from services.action_service import ActionService, ActionType

router = APIRouter(prefix="/api/actions", tags=["actions"])


@router.get("/types")
async def get_action_types():
    """Get list of recognized action types."""
    return [{"type": a.value, "name": a.name.replace("_", " ").title()} for a in ActionType]


@router.get("/stats")
async def get_action_stats(
    hours: int = Query(24, ge=1, le=168, description="Number of hours to analyze"),
    db: Session = Depends(get_db)
):
    """
    Get action statistics for a time period.

    Returns counts, durations, and percentages for each action type.
    """
    return ActionService.get_action_stats(db, hours)


@router.get("/by-zone")
async def get_actions_by_zone(
    hours: int = Query(24, ge=1, le=168, description="Number of hours to analyze"),
    db: Session = Depends(get_db)
):
    """
    Get action breakdown by zone.

    Returns action counts and durations for each zone.
    """
    return ActionService.get_zone_actions(db, hours)


@router.get("/person/{person_id}")
async def get_person_actions(
    person_id: int,
    hours: int = Query(24, ge=1, le=168, description="Number of hours to analyze"),
    db: Session = Depends(get_db)
):
    """
    Get action history for a specific person.

    Returns chronological list of actions with timestamps and durations.
    """
    return ActionService.get_person_actions(db, person_id, hours)


@router.get("/current")
async def get_current_actions():
    """
    Get currently detected actions for all active persons.

    Returns real-time action state for each tracked person.
    """
    return ActionService.get_current_actions()


@router.get("/summary")
async def get_action_summary(
    hours: int = Query(24, ge=1, le=168),
    db: Session = Depends(get_db)
):
    """
    Get a comprehensive action summary with insights.

    Combines stats, zone breakdown, and activity level indicators.
    """
    stats = ActionService.get_action_stats(db, hours)
    zone_actions = ActionService.get_zone_actions(db, hours)
    current = ActionService.get_current_actions()

    # Calculate activity levels
    total_actions = sum(a.get("count", 0) for a in stats.get("actions", {}).values())
    sitting_time = stats.get("actions", {}).get("sitting", {}).get("total_minutes", 0)
    standing_time = stats.get("actions", {}).get("standing", {}).get("total_minutes", 0)
    walking_time = stats.get("actions", {}).get("walking", {}).get("total_minutes", 0)

    # Activity level: ratio of active (walking/reaching/bending) vs passive (sitting/standing)
    active_time = walking_time + stats.get("actions", {}).get("reaching", {}).get("total_minutes", 0) + \
                  stats.get("actions", {}).get("bending", {}).get("total_minutes", 0)
    passive_time = sitting_time + standing_time
    total_time = active_time + passive_time

    activity_ratio = active_time / total_time if total_time > 0 else 0

    # Determine activity level category
    if activity_ratio > 0.4:
        activity_level = "high"
    elif activity_ratio > 0.2:
        activity_level = "moderate"
    else:
        activity_level = "low"

    return {
        "period_hours": hours,
        "stats": stats,
        "zone_breakdown": zone_actions,
        "current_actions": current,
        "insights": {
            "total_actions": total_actions,
            "activity_level": activity_level,
            "activity_ratio": round(activity_ratio, 2),
            "sitting_percentage": round(sitting_time / total_time * 100, 1) if total_time > 0 else 0,
            "standing_percentage": round(standing_time / total_time * 100, 1) if total_time > 0 else 0,
            "walking_percentage": round(walking_time / total_time * 100, 1) if total_time > 0 else 0,
        }
    }
