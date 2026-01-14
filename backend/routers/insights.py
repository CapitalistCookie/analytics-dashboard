"""Customer Insights API endpoints."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database import get_db
from services.customer_insights_service import CustomerInsightsService

router = APIRouter(prefix="/api/insights", tags=["insights"])


@router.get("/summary")
async def get_insights_summary(db: Session = Depends(get_db)):
    """Get customer insights summary."""
    return CustomerInsightsService.get_insights_summary(db)


@router.get("/top-customers")
async def get_top_customers(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Get top customers by visits."""
    return CustomerInsightsService.get_top_customers(db, limit)


@router.get("/frequency")
async def get_visit_frequency(
    days: int = Query(30, ge=7, le=90),
    db: Session = Depends(get_db)
):
    """Get visit frequency analysis."""
    return CustomerInsightsService.get_visit_frequency(db, days)


@router.get("/retention")
async def get_retention_analysis(db: Session = Depends(get_db)):
    """Get customer retention analysis."""
    return CustomerInsightsService.get_retention_analysis(db)


@router.get("/churn-risk")
async def get_churn_risk(
    days: int = Query(30, ge=14, le=90),
    db: Session = Depends(get_db)
):
    """Get customers at risk of churning."""
    return CustomerInsightsService.get_churn_risk(db, days)


@router.get("/customer/{profile_id}")
async def get_customer_details(
    profile_id: str,
    db: Session = Depends(get_db)
):
    """Get detailed insights for a specific customer."""
    return CustomerInsightsService.get_customer_journey_patterns(db, profile_id)


@router.get("/dashboard")
async def get_insights_dashboard(db: Session = Depends(get_db)):
    """Get complete insights dashboard data."""
    return CustomerInsightsService.get_dashboard(db)
