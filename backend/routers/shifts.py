"""Shift summaries API router."""

import random
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import APIRouter, Query, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import ShiftSummary, Staff

router = APIRouter(prefix="/api/shifts", tags=["shifts"])


# Response models
class StaffShiftStats(BaseModel):
    staff_id: int
    name: str
    role: str
    tables_served: int
    customers_served: int
    floor_time_minutes: int
    idle_time_minutes: int
    response_time_avg: float  # seconds


class ShiftMetrics(BaseModel):
    total_customers: int
    peak_hour: str
    peak_occupancy: int
    avg_wait_time: float
    table_turnovers: int
    incidents_count: int
    revenue_estimate: float


class ShiftComparison(BaseModel):
    previous_date: str
    total_customers_change: float  # percentage
    avg_wait_time_change: float
    table_turnovers_change: float
    is_improvement: bool


class ShiftSummaryResponse(BaseModel):
    id: int
    shift_date: str
    shift_type: str  # "morning", "afternoon", "evening"
    start_time: str
    end_time: str
    metrics: ShiftMetrics
    staff_on_shift: List[StaffShiftStats]
    comparison: Optional[ShiftComparison]
    notes: Optional[str]
    created_at: str


class ShiftSummaryCreate(BaseModel):
    shift_date: Optional[str] = None
    shift_type: str = "evening"  # "morning", "afternoon", "evening"
    notes: Optional[str] = None


class ShiftSummaryList(BaseModel):
    id: int
    shift_date: str
    shift_type: str
    total_customers: int
    staff_count: int
    avg_wait_time: float
    created_at: str


def get_shift_times(shift_type: str) -> tuple:
    """Get start and end times for a shift type."""
    if shift_type == "morning":
        return "06:00", "14:00"
    elif shift_type == "afternoon":
        return "14:00", "22:00"
    else:  # evening
        return "17:00", "01:00"


def generate_demo_shift_data(shift_date: datetime, shift_type: str, db: Session):
    """Generate realistic demo data for a shift summary."""
    random.seed(int(shift_date.timestamp()) + hash(shift_type))

    start_time, end_time = get_shift_times(shift_type)

    # Generate metrics based on shift type
    if shift_type == "morning":
        base_customers = random.randint(80, 150)
        peak_hour = random.choice(["08:00 AM", "09:00 AM", "10:00 AM"])
    elif shift_type == "afternoon":
        base_customers = random.randint(150, 280)
        peak_hour = random.choice(["12:00 PM", "1:00 PM", "2:00 PM"])
    else:  # evening
        base_customers = random.randint(200, 350)
        peak_hour = random.choice(["7:00 PM", "8:00 PM", "9:00 PM"])

    metrics = ShiftMetrics(
        total_customers=base_customers,
        peak_hour=peak_hour,
        peak_occupancy=random.randint(55, 95),
        avg_wait_time=round(random.uniform(5, 25), 1),
        table_turnovers=random.randint(15, 45),
        incidents_count=random.randint(0, 3),
        revenue_estimate=round(base_customers * random.uniform(25, 45), 2)
    )

    # Generate staff on shift
    staff_names = [
        ("John Smith", "server"),
        ("Maria Garcia", "server"),
        ("James Lee", "server"),
        ("Sarah Kim", "host"),
        ("Mike Rodriguez", "busser"),
        ("Lisa Thompson", "manager"),
        ("David Wilson", "server"),
        ("Emily Chen", "bartender"),
    ]

    num_staff = random.randint(4, 7)
    selected_staff = random.sample(staff_names, num_staff)

    staff_on_shift = []
    for i, (name, role) in enumerate(selected_staff):
        shift_hours = 8 if shift_type != "morning" else 6
        floor_time = random.randint(int(shift_hours * 45), int(shift_hours * 55))
        idle_time = shift_hours * 60 - floor_time

        staff_on_shift.append(StaffShiftStats(
            staff_id=i + 1,
            name=name,
            role=role,
            tables_served=random.randint(8, 25) if role == "server" else random.randint(0, 5),
            customers_served=random.randint(20, 60) if role == "server" else random.randint(5, 20),
            floor_time_minutes=floor_time,
            idle_time_minutes=idle_time,
            response_time_avg=round(random.uniform(1.5, 4.5), 1)
        ))

    # Generate comparison to previous same-day shift
    prev_date = shift_date - timedelta(days=7)
    random.seed(int(prev_date.timestamp()) + hash(shift_type))
    prev_customers = random.randint(80, 350)
    prev_wait = round(random.uniform(5, 25), 1)
    prev_turnovers = random.randint(15, 45)

    random.seed(int(shift_date.timestamp()) + hash(shift_type))  # Reset seed

    customer_change = round(((base_customers - prev_customers) / prev_customers) * 100, 1)
    wait_change = round(((metrics.avg_wait_time - prev_wait) / prev_wait) * 100, 1)
    turnover_change = round(((metrics.table_turnovers - prev_turnovers) / prev_turnovers) * 100, 1)

    comparison = ShiftComparison(
        previous_date=prev_date.strftime("%Y-%m-%d"),
        total_customers_change=customer_change,
        avg_wait_time_change=wait_change,
        table_turnovers_change=turnover_change,
        is_improvement=customer_change > 0 and wait_change < 0
    )

    return metrics, staff_on_shift, comparison, start_time, end_time


@router.get("/current", response_model=ShiftSummaryResponse)
async def get_current_shift(db: Session = Depends(get_db)):
    """Get the current active shift summary or generate one."""
    now = datetime.now()
    hour = now.hour

    # Determine current shift type
    if 6 <= hour < 14:
        shift_type = "morning"
    elif 14 <= hour < 22:
        shift_type = "afternoon"
    else:
        shift_type = "evening"

    metrics, staff_on_shift, comparison, start_time, end_time = generate_demo_shift_data(
        now, shift_type, db
    )

    return ShiftSummaryResponse(
        id=0,
        shift_date=now.strftime("%Y-%m-%d"),
        shift_type=shift_type,
        start_time=start_time,
        end_time=end_time,
        metrics=metrics,
        staff_on_shift=staff_on_shift,
        comparison=comparison,
        notes=None,
        created_at=now.isoformat()
    )


@router.post("/generate", response_model=ShiftSummaryResponse)
async def generate_shift_summary(
    data: ShiftSummaryCreate,
    db: Session = Depends(get_db)
):
    """Generate an end-of-shift summary."""
    if data.shift_date:
        shift_date = datetime.strptime(data.shift_date, "%Y-%m-%d")
    else:
        shift_date = datetime.now()

    metrics, staff_on_shift, comparison, start_time, end_time = generate_demo_shift_data(
        shift_date, data.shift_type, db
    )

    # Save to database
    summary = ShiftSummary(
        shift_date=shift_date.date(),
        shift_type=data.shift_type,
        start_time=start_time,
        end_time=end_time,
        total_customers=metrics.total_customers,
        peak_hour=metrics.peak_hour,
        peak_occupancy=metrics.peak_occupancy,
        avg_wait_time=metrics.avg_wait_time,
        table_turnovers=metrics.table_turnovers,
        incidents_count=metrics.incidents_count,
        revenue_estimate=metrics.revenue_estimate,
        staff_count=len(staff_on_shift),
        notes=data.notes
    )
    db.add(summary)
    db.commit()
    db.refresh(summary)

    return ShiftSummaryResponse(
        id=summary.id,
        shift_date=shift_date.strftime("%Y-%m-%d"),
        shift_type=data.shift_type,
        start_time=start_time,
        end_time=end_time,
        metrics=metrics,
        staff_on_shift=staff_on_shift,
        comparison=comparison,
        notes=data.notes,
        created_at=summary.created_at.isoformat()
    )


@router.get("/history", response_model=List[ShiftSummaryList])
async def get_shift_history(
    days: int = Query(30, ge=1, le=90),
    shift_type: Optional[str] = Query(None, pattern="^(morning|afternoon|evening)$"),
    db: Session = Depends(get_db)
):
    """Get past shift summaries."""
    # Query saved summaries from database
    query = db.query(ShiftSummary)

    if shift_type:
        query = query.filter(ShiftSummary.shift_type == shift_type)

    cutoff = datetime.now() - timedelta(days=days)
    query = query.filter(ShiftSummary.shift_date >= cutoff.date())

    saved_summaries = query.order_by(ShiftSummary.shift_date.desc()).all()

    # If we have saved summaries, return them
    if saved_summaries:
        return [
            ShiftSummaryList(
                id=s.id,
                shift_date=s.shift_date.strftime("%Y-%m-%d"),
                shift_type=s.shift_type,
                total_customers=s.total_customers,
                staff_count=s.staff_count,
                avg_wait_time=s.avg_wait_time,
                created_at=s.created_at.isoformat()
            )
            for s in saved_summaries
        ]

    # Generate demo history
    history = []
    for i in range(min(days, 14)):  # Last 14 days of demo data
        date = datetime.now() - timedelta(days=i)
        for st in ["morning", "afternoon", "evening"]:
            if shift_type and st != shift_type:
                continue

            random.seed(int(date.timestamp()) + hash(st))
            if st == "morning":
                customers = random.randint(80, 150)
            elif st == "afternoon":
                customers = random.randint(150, 280)
            else:
                customers = random.randint(200, 350)

            history.append(ShiftSummaryList(
                id=i * 3 + ["morning", "afternoon", "evening"].index(st) + 1,
                shift_date=date.strftime("%Y-%m-%d"),
                shift_type=st,
                total_customers=customers,
                staff_count=random.randint(4, 7),
                avg_wait_time=round(random.uniform(5, 25), 1),
                created_at=date.isoformat()
            ))

    return sorted(history, key=lambda x: (x.shift_date, x.shift_type), reverse=True)


@router.get("/{shift_id}", response_model=ShiftSummaryResponse)
async def get_shift_summary(
    shift_id: int,
    db: Session = Depends(get_db)
):
    """Get a specific shift summary by ID."""
    summary = db.query(ShiftSummary).filter(ShiftSummary.id == shift_id).first()

    if not summary:
        # Generate demo data for the ID
        base_date = datetime.now() - timedelta(days=shift_id // 3)
        shift_types = ["morning", "afternoon", "evening"]
        shift_type = shift_types[shift_id % 3]

        metrics, staff_on_shift, comparison, start_time, end_time = generate_demo_shift_data(
            base_date, shift_type, db
        )

        return ShiftSummaryResponse(
            id=shift_id,
            shift_date=base_date.strftime("%Y-%m-%d"),
            shift_type=shift_type,
            start_time=start_time,
            end_time=end_time,
            metrics=metrics,
            staff_on_shift=staff_on_shift,
            comparison=comparison,
            notes=None,
            created_at=base_date.isoformat()
        )

    # Build response from saved summary
    shift_date = datetime.combine(summary.shift_date, datetime.min.time())
    _, staff_on_shift, comparison, _, _ = generate_demo_shift_data(
        shift_date, summary.shift_type, db
    )

    metrics = ShiftMetrics(
        total_customers=summary.total_customers,
        peak_hour=summary.peak_hour,
        peak_occupancy=summary.peak_occupancy,
        avg_wait_time=summary.avg_wait_time,
        table_turnovers=summary.table_turnovers,
        incidents_count=summary.incidents_count,
        revenue_estimate=summary.revenue_estimate
    )

    return ShiftSummaryResponse(
        id=summary.id,
        shift_date=summary.shift_date.strftime("%Y-%m-%d"),
        shift_type=summary.shift_type,
        start_time=summary.start_time,
        end_time=summary.end_time,
        metrics=metrics,
        staff_on_shift=staff_on_shift,
        comparison=comparison,
        notes=summary.notes,
        created_at=summary.created_at.isoformat()
    )


@router.delete("/{shift_id}")
async def delete_shift_summary(
    shift_id: int,
    db: Session = Depends(get_db)
):
    """Delete a shift summary."""
    summary = db.query(ShiftSummary).filter(ShiftSummary.id == shift_id).first()
    if not summary:
        raise HTTPException(status_code=404, detail="Shift summary not found")

    db.delete(summary)
    db.commit()

    return {"message": "Shift summary deleted"}


@router.post("/{shift_id}/email")
async def email_shift_summary(
    shift_id: int,
    recipients: List[str] = Query(...),
    db: Session = Depends(get_db)
):
    """Send shift summary via email (demo implementation)."""
    # In a real implementation, this would send an actual email
    return {
        "message": f"Shift summary #{shift_id} sent to {len(recipients)} recipients",
        "recipients": recipients,
        "status": "sent"
    }
