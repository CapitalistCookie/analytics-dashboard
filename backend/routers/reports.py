"""Reports router for analytics export and scheduled reports."""

import csv
import io
import json
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import User, ScheduledReport, AuditLog
from routers.auth import require_auth, require_manager_or_admin

router = APIRouter(prefix="/api/reports", tags=["reports"])


# Pydantic models
class ScheduledReportResponse(BaseModel):
    """Scheduled report response."""
    id: int
    name: str
    report_type: str
    schedule: str
    day_of_week: Optional[int]
    day_of_month: Optional[int]
    hour: int
    email_recipients: Optional[str]
    is_enabled: bool
    last_run: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class ScheduledReportCreate(BaseModel):
    """Create scheduled report."""
    name: str
    report_type: str  # "daily_summary", "staff_performance", "customer_trends"
    schedule: str  # "daily", "weekly", "monthly"
    day_of_week: Optional[int] = None  # 0=Monday for weekly
    day_of_month: Optional[int] = None  # 1-28 for monthly
    hour: int = 8
    email_recipients: Optional[str] = None
    is_enabled: bool = True


class ScheduledReportUpdate(BaseModel):
    """Update scheduled report."""
    name: Optional[str] = None
    report_type: Optional[str] = None
    schedule: Optional[str] = None
    day_of_week: Optional[int] = None
    day_of_month: Optional[int] = None
    hour: Optional[int] = None
    email_recipients: Optional[str] = None
    is_enabled: Optional[bool] = None


class ExportRequest(BaseModel):
    """Export request model."""
    report_type: str
    format: str = "csv"  # "csv" or "pdf"
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


REPORT_TYPES = {
    "daily_summary": {
        "name": "Daily Summary",
        "description": "Overview of daily metrics including occupancy, wait times, and staff activity"
    },
    "staff_performance": {
        "name": "Staff Performance",
        "description": "Detailed staff metrics including floor time, idle time, and activity logs"
    },
    "customer_trends": {
        "name": "Customer Trends",
        "description": "Customer flow analysis, peak hours, and zone activity"
    },
    "occupancy": {
        "name": "Occupancy Report",
        "description": "Hourly occupancy data and capacity utilization"
    },
    "wait_times": {
        "name": "Wait Times",
        "description": "Customer wait time analysis by hour and zone"
    },
    "table_turnover": {
        "name": "Table Turnover",
        "description": "Table turnover rates and utilization metrics"
    }
}


def log_action(db: Session, user: User, action: str, resource_type: str,
               resource_id: str = None, details: str = None, ip: str = None):
    """Create an audit log entry."""
    log = AuditLog(
        user_id=user.id,
        username=user.username,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details=details,
        ip_address=ip
    )
    db.add(log)


def generate_demo_data(report_type: str, start_date: datetime, end_date: datetime) -> List[dict]:
    """Generate demo report data."""
    import random
    random.seed(42)

    data = []
    current = start_date

    if report_type == "daily_summary":
        while current <= end_date:
            data.append({
                "date": current.strftime("%Y-%m-%d"),
                "total_customers": random.randint(150, 300),
                "avg_wait_time": round(random.uniform(5, 20), 1),
                "peak_occupancy": random.randint(50, 100),
                "table_turnover": round(random.uniform(2.0, 4.5), 1),
                "staff_efficiency": round(random.uniform(70, 95), 1)
            })
            current += timedelta(days=1)

    elif report_type == "staff_performance":
        staff_names = ["John Smith", "Jane Doe", "Mike Johnson", "Sarah Williams", "Tom Brown"]
        for name in staff_names:
            data.append({
                "staff_name": name,
                "role": random.choice(["Server", "Host", "Manager"]),
                "floor_time_hours": round(random.uniform(5, 8), 1),
                "idle_time_hours": round(random.uniform(0.5, 2), 1),
                "customers_served": random.randint(20, 60),
                "avg_service_time_min": round(random.uniform(10, 25), 1)
            })

    elif report_type == "customer_trends":
        while current <= end_date:
            for hour in range(9, 23):
                data.append({
                    "date": current.strftime("%Y-%m-%d"),
                    "hour": hour,
                    "customer_count": random.randint(5, 50),
                    "avg_dwell_time_min": round(random.uniform(30, 90), 1),
                    "zone": random.choice(["Dining", "Bar", "Patio", "Lobby"])
                })
            current += timedelta(days=1)

    elif report_type == "occupancy":
        while current <= end_date:
            for hour in range(9, 23):
                data.append({
                    "date": current.strftime("%Y-%m-%d"),
                    "hour": hour,
                    "occupancy": random.randint(10, 100),
                    "capacity_pct": round(random.uniform(20, 100), 1)
                })
            current += timedelta(days=1)

    elif report_type == "wait_times":
        while current <= end_date:
            for hour in range(11, 22):
                data.append({
                    "date": current.strftime("%Y-%m-%d"),
                    "hour": hour,
                    "avg_wait_min": round(random.uniform(0, 30), 1),
                    "max_wait_min": round(random.uniform(10, 60), 1),
                    "customers_waited": random.randint(0, 20)
                })
            current += timedelta(days=1)

    elif report_type == "table_turnover":
        for table_num in range(1, 16):
            data.append({
                "table": f"Table {table_num}",
                "capacity": random.choice([2, 4, 6, 8]),
                "turnovers_today": random.randint(2, 8),
                "avg_seating_time_min": round(random.uniform(40, 90), 1),
                "utilization_pct": round(random.uniform(50, 95), 1)
            })

    return data


def data_to_csv(data: List[dict]) -> str:
    """Convert list of dicts to CSV string."""
    if not data:
        return ""

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=data[0].keys())
    writer.writeheader()
    writer.writerows(data)
    return output.getvalue()


# Report types endpoint
@router.get("/types")
async def get_report_types(current_user: User = Depends(require_auth)):
    """Get available report types."""
    return {"report_types": REPORT_TYPES}


# Export endpoints
@router.get("/export/{report_type}")
async def export_report(
    report_type: str,
    format: str = Query("csv", regex="^(csv|json)$"),
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    request: Request = None,
    current_user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """Export a report as CSV or JSON."""
    if report_type not in REPORT_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid report type: {report_type}")

    # Default date range: last 7 days
    if not end_date:
        end_date = datetime.utcnow()
    if not start_date:
        start_date = end_date - timedelta(days=7)

    # Generate report data
    data = generate_demo_data(report_type, start_date, end_date)

    # Log export action
    log_action(db, current_user, "export", "report",
               report_type, f"Exported {format.upper()} from {start_date} to {end_date}",
               request.client.host if request else None)
    db.commit()

    if format == "csv":
        csv_content = data_to_csv(data)
        filename = f"{report_type}_{start_date.strftime('%Y%m%d')}_{end_date.strftime('%Y%m%d')}.csv"
        return StreamingResponse(
            iter([csv_content]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    else:
        return {
            "report_type": report_type,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "data": data
        }


@router.post("/export")
async def export_report_post(
    export_req: ExportRequest,
    request: Request,
    current_user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """Export a report (POST method for complex requests)."""
    return await export_report(
        report_type=export_req.report_type,
        format=export_req.format,
        start_date=export_req.start_date,
        end_date=export_req.end_date,
        request=request,
        current_user=current_user,
        db=db
    )


# Scheduled reports CRUD
@router.get("/scheduled", response_model=List[ScheduledReportResponse])
async def list_scheduled_reports(
    current_user: User = Depends(require_manager_or_admin),
    db: Session = Depends(get_db)
):
    """List all scheduled reports."""
    return db.query(ScheduledReport).order_by(ScheduledReport.created_at.desc()).all()


@router.post("/scheduled", response_model=ScheduledReportResponse, status_code=201)
async def create_scheduled_report(
    report: ScheduledReportCreate,
    request: Request,
    current_user: User = Depends(require_manager_or_admin),
    db: Session = Depends(get_db)
):
    """Create a scheduled report."""
    if report.report_type not in REPORT_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid report type: {report.report_type}")

    if report.schedule not in ["daily", "weekly", "monthly"]:
        raise HTTPException(status_code=400, detail="Schedule must be daily, weekly, or monthly")

    if report.schedule == "weekly" and (report.day_of_week is None or report.day_of_week < 0 or report.day_of_week > 6):
        raise HTTPException(status_code=400, detail="Weekly reports require day_of_week (0-6)")

    if report.schedule == "monthly" and (report.day_of_month is None or report.day_of_month < 1 or report.day_of_month > 28):
        raise HTTPException(status_code=400, detail="Monthly reports require day_of_month (1-28)")

    if report.hour < 0 or report.hour > 23:
        raise HTTPException(status_code=400, detail="Hour must be 0-23")

    scheduled = ScheduledReport(
        name=report.name,
        report_type=report.report_type,
        schedule=report.schedule,
        day_of_week=report.day_of_week,
        day_of_month=report.day_of_month,
        hour=report.hour,
        email_recipients=report.email_recipients,
        is_enabled=report.is_enabled,
        created_by=current_user.id
    )
    db.add(scheduled)
    db.commit()
    db.refresh(scheduled)

    log_action(db, current_user, "create", "report",
               str(scheduled.id), f"Created scheduled report: {report.name}",
               request.client.host)
    db.commit()

    return scheduled


@router.get("/scheduled/{report_id}", response_model=ScheduledReportResponse)
async def get_scheduled_report(
    report_id: int,
    current_user: User = Depends(require_manager_or_admin),
    db: Session = Depends(get_db)
):
    """Get a specific scheduled report."""
    report = db.query(ScheduledReport).filter(ScheduledReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Scheduled report not found")
    return report


@router.put("/scheduled/{report_id}", response_model=ScheduledReportResponse)
async def update_scheduled_report(
    report_id: int,
    update: ScheduledReportUpdate,
    request: Request,
    current_user: User = Depends(require_manager_or_admin),
    db: Session = Depends(get_db)
):
    """Update a scheduled report."""
    report = db.query(ScheduledReport).filter(ScheduledReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Scheduled report not found")

    changes = []

    if update.name is not None:
        changes.append(f"name: {report.name} -> {update.name}")
        report.name = update.name

    if update.report_type is not None:
        if update.report_type not in REPORT_TYPES:
            raise HTTPException(status_code=400, detail=f"Invalid report type: {update.report_type}")
        changes.append(f"report_type: {report.report_type} -> {update.report_type}")
        report.report_type = update.report_type

    if update.schedule is not None:
        if update.schedule not in ["daily", "weekly", "monthly"]:
            raise HTTPException(status_code=400, detail="Invalid schedule")
        changes.append(f"schedule: {report.schedule} -> {update.schedule}")
        report.schedule = update.schedule

    if update.day_of_week is not None:
        report.day_of_week = update.day_of_week

    if update.day_of_month is not None:
        report.day_of_month = update.day_of_month

    if update.hour is not None:
        if update.hour < 0 or update.hour > 23:
            raise HTTPException(status_code=400, detail="Hour must be 0-23")
        report.hour = update.hour

    if update.email_recipients is not None:
        report.email_recipients = update.email_recipients

    if update.is_enabled is not None:
        changes.append(f"is_enabled: {report.is_enabled} -> {update.is_enabled}")
        report.is_enabled = update.is_enabled

    if changes:
        log_action(db, current_user, "update", "report",
                   str(report_id), "; ".join(changes), request.client.host)

    db.commit()
    db.refresh(report)
    return report


@router.delete("/scheduled/{report_id}")
async def delete_scheduled_report(
    report_id: int,
    request: Request,
    current_user: User = Depends(require_manager_or_admin),
    db: Session = Depends(get_db)
):
    """Delete a scheduled report."""
    report = db.query(ScheduledReport).filter(ScheduledReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Scheduled report not found")

    name = report.name
    db.delete(report)
    db.commit()

    log_action(db, current_user, "delete", "report",
               str(report_id), f"Deleted scheduled report: {name}",
               request.client.host)
    db.commit()

    return {"success": True, "message": f"Scheduled report '{name}' deleted"}


@router.post("/scheduled/{report_id}/run")
async def run_scheduled_report_now(
    report_id: int,
    request: Request,
    current_user: User = Depends(require_manager_or_admin),
    db: Session = Depends(get_db)
):
    """Manually run a scheduled report now."""
    report = db.query(ScheduledReport).filter(ScheduledReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Scheduled report not found")

    # Generate report
    end_date = datetime.utcnow()
    if report.schedule == "daily":
        start_date = end_date - timedelta(days=1)
    elif report.schedule == "weekly":
        start_date = end_date - timedelta(days=7)
    else:
        start_date = end_date - timedelta(days=30)

    data = generate_demo_data(report.report_type, start_date, end_date)

    # Update last_run
    report.last_run = datetime.utcnow()
    db.commit()

    log_action(db, current_user, "export", "report",
               str(report_id), f"Manually ran scheduled report: {report.name}",
               request.client.host)
    db.commit()

    return {
        "success": True,
        "message": f"Report '{report.name}' generated",
        "records": len(data),
        "recipients": report.email_recipients
    }


@router.post("/scheduled/{report_id}/toggle")
async def toggle_scheduled_report(
    report_id: int,
    request: Request,
    current_user: User = Depends(require_manager_or_admin),
    db: Session = Depends(get_db)
):
    """Toggle a scheduled report on/off."""
    report = db.query(ScheduledReport).filter(ScheduledReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Scheduled report not found")

    report.is_enabled = not report.is_enabled
    db.commit()

    log_action(db, current_user, "update", "report",
               str(report_id), f"Toggled report: {report.is_enabled}",
               request.client.host)
    db.commit()

    return {"success": True, "is_enabled": report.is_enabled}
