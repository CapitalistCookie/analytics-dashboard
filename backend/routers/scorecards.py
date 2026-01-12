"""Staff scorecards API router."""

import random
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import APIRouter, Query, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Staff

router = APIRouter(prefix="/api/scorecards", tags=["scorecards"])


# Response models
class PerformanceMetrics(BaseModel):
    avg_response_time: float  # seconds
    tables_served_per_hour: float
    floor_time_percent: float
    idle_time_percent: float
    customer_interactions: int
    zones_covered: List[str]


class TrendPoint(BaseModel):
    date: str
    value: float


class PerformanceTrend(BaseModel):
    metric: str
    trend: str  # "improving", "declining", "stable"
    change_percent: float
    data_points: List[TrendPoint]


class TeamComparison(BaseModel):
    metric: str
    staff_value: float
    team_average: float
    percentile: int  # 0-100, where they rank


class WeeklyStats(BaseModel):
    week_start: str
    week_end: str
    total_hours: float
    tables_served: int
    customers_served: int
    avg_response_time: float
    floor_time_percent: float


class StaffScorecard(BaseModel):
    staff_id: int
    name: str
    role: str
    photo_url: Optional[str]
    current_metrics: PerformanceMetrics
    trends: List[PerformanceTrend]
    team_comparisons: List[TeamComparison]
    weekly_summaries: List[WeeklyStats]
    badges: List[str]
    streak_days: int
    rank: int
    total_staff: int


class LeaderboardEntry(BaseModel):
    rank: int
    staff_id: int
    name: str
    role: str
    photo_url: Optional[str]
    score: float
    tables_served: int
    response_time: float
    badges: List[str]
    streak_days: int
    trend: str  # "up", "down", "same"


class BadgeInfo(BaseModel):
    id: str
    name: str
    description: str
    icon: str
    earned_date: Optional[str]


def generate_demo_scorecard(staff_id: int, name: str, role: str, period: str = "week"):
    """Generate realistic demo scorecard data for a staff member."""
    random.seed(staff_id * 100 + hash(period))

    # Current metrics vary by role
    if role == "server":
        base_tables = random.uniform(4, 8)
        base_interactions = random.randint(80, 150)
    elif role == "host":
        base_tables = random.uniform(0, 2)
        base_interactions = random.randint(120, 200)
    elif role == "manager":
        base_tables = random.uniform(1, 3)
        base_interactions = random.randint(60, 100)
    else:  # busser, bartender, etc.
        base_tables = random.uniform(1, 4)
        base_interactions = random.randint(40, 80)

    floor_pct = random.uniform(75, 92)
    idle_pct = 100 - floor_pct

    current_metrics = PerformanceMetrics(
        avg_response_time=round(random.uniform(1.5, 4.0), 1),
        tables_served_per_hour=round(base_tables, 1),
        floor_time_percent=round(floor_pct, 1),
        idle_time_percent=round(idle_pct, 1),
        customer_interactions=base_interactions,
        zones_covered=random.sample(
            ["Main Dining", "Bar Area", "Patio", "Private Room", "Entrance", "Waiting Area"],
            random.randint(2, 4)
        )
    )

    # Generate trends
    trends = []
    metrics_info = [
        ("response_time", "Response Time", random.uniform(-15, 20)),
        ("tables_per_hour", "Tables/Hour", random.uniform(-10, 15)),
        ("floor_time", "Floor Time %", random.uniform(-5, 10)),
    ]

    for metric_id, metric_name, change in metrics_info:
        data_points = []
        base_val = random.uniform(2.0, 5.0) if "time" in metric_id else random.uniform(70, 90)

        for i in range(7):
            date = datetime.now() - timedelta(days=6 - i)
            variation = random.uniform(-5, 5)
            val = base_val + (change / 7) * i + variation
            data_points.append(TrendPoint(
                date=date.strftime("%Y-%m-%d"),
                value=round(max(0, val), 1)
            ))

        if change < -5:
            trend = "improving" if "time" in metric_id else "declining"
        elif change > 5:
            trend = "declining" if "time" in metric_id else "improving"
        else:
            trend = "stable"

        trends.append(PerformanceTrend(
            metric=metric_name,
            trend=trend,
            change_percent=round(change, 1),
            data_points=data_points
        ))

    # Team comparisons
    team_comparisons = [
        TeamComparison(
            metric="Response Time",
            staff_value=current_metrics.avg_response_time,
            team_average=round(random.uniform(2.5, 3.5), 1),
            percentile=random.randint(40, 95)
        ),
        TeamComparison(
            metric="Tables/Hour",
            staff_value=current_metrics.tables_served_per_hour,
            team_average=round(random.uniform(4, 6), 1),
            percentile=random.randint(30, 90)
        ),
        TeamComparison(
            metric="Floor Time %",
            staff_value=current_metrics.floor_time_percent,
            team_average=round(random.uniform(78, 85), 1),
            percentile=random.randint(45, 95)
        ),
        TeamComparison(
            metric="Customer Interactions",
            staff_value=current_metrics.customer_interactions,
            team_average=round(random.uniform(80, 120)),
            percentile=random.randint(35, 92)
        ),
    ]

    # Weekly summaries
    weekly_summaries = []
    for week in range(4):
        week_start = datetime.now() - timedelta(weeks=week + 1)
        week_end = week_start + timedelta(days=6)
        random.seed(staff_id * 100 + week)

        weekly_summaries.append(WeeklyStats(
            week_start=week_start.strftime("%Y-%m-%d"),
            week_end=week_end.strftime("%Y-%m-%d"),
            total_hours=round(random.uniform(32, 45), 1),
            tables_served=random.randint(80, 180),
            customers_served=random.randint(200, 500),
            avg_response_time=round(random.uniform(1.8, 3.5), 1),
            floor_time_percent=round(random.uniform(75, 90), 1)
        ))

    # Badges
    all_badges = [
        "Speed Star", "Customer Favorite", "Team Player", "Early Bird",
        "Night Owl", "Perfect Attendance", "Top Seller", "Zone Master",
        "Quick Responder", "5-Star Service"
    ]
    num_badges = random.randint(2, 6)
    badges = random.sample(all_badges, num_badges)

    # Streak and rank
    streak_days = random.randint(0, 21)
    rank = random.randint(1, 8)

    return StaffScorecard(
        staff_id=staff_id,
        name=name,
        role=role,
        photo_url=None,
        current_metrics=current_metrics,
        trends=trends,
        team_comparisons=team_comparisons,
        weekly_summaries=weekly_summaries,
        badges=badges,
        streak_days=streak_days,
        rank=rank,
        total_staff=8
    )


@router.get("/staff/{staff_id}", response_model=StaffScorecard)
async def get_staff_scorecard(
    staff_id: int,
    period: str = Query("week", pattern="^(week|month)$"),
    db: Session = Depends(get_db)
):
    """Get individual staff performance scorecard."""
    # Check if staff exists in database
    staff = db.query(Staff).filter(Staff.id == staff_id).first()

    if staff:
        return generate_demo_scorecard(staff.id, staff.name, staff.role, period)

    # Generate demo data for non-existent staff
    demo_staff = [
        (1, "John Smith", "server"),
        (2, "Maria Garcia", "server"),
        (3, "James Lee", "server"),
        (4, "Sarah Kim", "host"),
        (5, "Mike Rodriguez", "busser"),
        (6, "Lisa Thompson", "manager"),
        (7, "David Wilson", "server"),
        (8, "Emily Chen", "bartender"),
    ]

    for sid, name, role in demo_staff:
        if sid == staff_id:
            return generate_demo_scorecard(sid, name, role, period)

    raise HTTPException(status_code=404, detail="Staff member not found")


@router.get("/leaderboard", response_model=List[LeaderboardEntry])
async def get_leaderboard(
    period: str = Query("week", pattern="^(week|month)$"),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db)
):
    """Get staff performance leaderboard."""
    # Get all staff from database
    staff_list = db.query(Staff).filter(Staff.is_active == True).all()

    # If no staff in DB, use demo data
    if not staff_list:
        demo_staff = [
            (1, "John Smith", "server"),
            (2, "Maria Garcia", "server"),
            (3, "James Lee", "server"),
            (4, "Sarah Kim", "host"),
            (5, "Mike Rodriguez", "busser"),
            (6, "Lisa Thompson", "manager"),
            (7, "David Wilson", "server"),
            (8, "Emily Chen", "bartender"),
        ]
        staff_data = [(sid, name, role) for sid, name, role in demo_staff]
    else:
        staff_data = [(s.id, s.name, s.role) for s in staff_list]

    # Generate scores for each staff
    entries = []
    random.seed(hash(period) + datetime.now().day)

    for staff_id, name, role in staff_data:
        random.seed(staff_id * 200 + hash(period))

        # Calculate composite score
        response_time = round(random.uniform(1.5, 4.0), 1)
        tables = random.randint(60, 180)
        floor_pct = random.uniform(75, 95)

        # Score formula: higher tables, lower response time, higher floor time = better
        score = round((tables / 2) + (100 - response_time * 20) + floor_pct, 1)

        badges = random.sample(
            ["Speed Star", "Customer Favorite", "Team Player", "Top Seller", "Quick Responder"],
            random.randint(0, 3)
        )

        trend_options = ["up", "down", "same"]
        trend_weights = [0.4, 0.3, 0.3]  # Slight bias toward improvement

        entries.append(LeaderboardEntry(
            rank=0,  # Will be set after sorting
            staff_id=staff_id,
            name=name,
            role=role,
            photo_url=None,
            score=score,
            tables_served=tables,
            response_time=response_time,
            badges=badges,
            streak_days=random.randint(0, 14),
            trend=random.choices(trend_options, trend_weights)[0]
        ))

    # Sort by score and assign ranks
    entries.sort(key=lambda x: x.score, reverse=True)
    for i, entry in enumerate(entries):
        entry.rank = i + 1

    return entries[:limit]


@router.get("/badges", response_model=List[BadgeInfo])
async def get_available_badges():
    """Get list of all available badges and their descriptions."""
    badges = [
        BadgeInfo(
            id="speed_star",
            name="Speed Star",
            description="Maintained response time under 2 seconds for a full shift",
            icon="lightning",
            earned_date=None
        ),
        BadgeInfo(
            id="customer_favorite",
            name="Customer Favorite",
            description="Received 5 or more positive mentions in customer feedback",
            icon="heart",
            earned_date=None
        ),
        BadgeInfo(
            id="team_player",
            name="Team Player",
            description="Helped 10+ teammates during a single shift",
            icon="users",
            earned_date=None
        ),
        BadgeInfo(
            id="early_bird",
            name="Early Bird",
            description="Clocked in early for 5 consecutive shifts",
            icon="sunrise",
            earned_date=None
        ),
        BadgeInfo(
            id="night_owl",
            name="Night Owl",
            description="Worked 10+ evening shifts in a month",
            icon="moon",
            earned_date=None
        ),
        BadgeInfo(
            id="perfect_attendance",
            name="Perfect Attendance",
            description="No missed shifts for an entire month",
            icon="calendar-check",
            earned_date=None
        ),
        BadgeInfo(
            id="top_seller",
            name="Top Seller",
            description="Highest sales in a single shift",
            icon="trophy",
            earned_date=None
        ),
        BadgeInfo(
            id="zone_master",
            name="Zone Master",
            description="Covered all zones in a single week",
            icon="map",
            earned_date=None
        ),
        BadgeInfo(
            id="quick_responder",
            name="Quick Responder",
            description="Fastest average response time of the week",
            icon="zap",
            earned_date=None
        ),
        BadgeInfo(
            id="five_star",
            name="5-Star Service",
            description="Maintained 5-star rating for a full month",
            icon="star",
            earned_date=None
        ),
        BadgeInfo(
            id="streak_7",
            name="7-Day Streak",
            description="Achieved performance goals for 7 consecutive days",
            icon="fire",
            earned_date=None
        ),
        BadgeInfo(
            id="streak_30",
            name="30-Day Streak",
            description="Achieved performance goals for 30 consecutive days",
            icon="fire",
            earned_date=None
        ),
    ]

    return badges


@router.get("/staff/{staff_id}/badges", response_model=List[BadgeInfo])
async def get_staff_badges(
    staff_id: int,
    db: Session = Depends(get_db)
):
    """Get badges earned by a specific staff member."""
    random.seed(staff_id * 50)

    all_badges = await get_available_badges()
    num_earned = random.randint(2, 7)
    earned_badges = random.sample(all_badges, num_earned)

    # Assign earned dates
    for badge in earned_badges:
        days_ago = random.randint(1, 60)
        badge.earned_date = (datetime.now() - timedelta(days=days_ago)).strftime("%Y-%m-%d")

    return sorted(earned_badges, key=lambda x: x.earned_date or "", reverse=True)


@router.get("/team/summary")
async def get_team_summary(
    period: str = Query("week", pattern="^(week|month)$"),
    db: Session = Depends(get_db)
):
    """Get overall team performance summary."""
    random.seed(hash(period) + datetime.now().isocalendar()[1])

    multiplier = 4 if period == "month" else 1

    return {
        "period": period,
        "total_staff": 8,
        "active_staff": random.randint(6, 8),
        "avg_response_time": round(random.uniform(2.0, 3.0), 1),
        "avg_floor_time_percent": round(random.uniform(80, 88), 1),
        "total_tables_served": random.randint(400, 600) * multiplier,
        "total_customers_served": random.randint(1000, 1500) * multiplier,
        "badges_earned_this_period": random.randint(5, 15) * multiplier,
        "top_performer": {
            "staff_id": random.randint(1, 8),
            "name": random.choice(["John Smith", "Maria Garcia", "James Lee", "Sarah Kim"]),
            "score": round(random.uniform(180, 220), 1)
        },
        "most_improved": {
            "staff_id": random.randint(1, 8),
            "name": random.choice(["Mike Rodriguez", "Lisa Thompson", "David Wilson", "Emily Chen"]),
            "improvement_percent": round(random.uniform(10, 25), 1)
        }
    }
