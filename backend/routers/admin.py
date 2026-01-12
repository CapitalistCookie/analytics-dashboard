"""Admin router for user management and audit logs."""

import json
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import User, AuditLog
from routers.auth import require_admin, get_password_hash

router = APIRouter(prefix="/api/admin", tags=["admin"])


# Pydantic models
class UserResponse(BaseModel):
    """User response model."""
    id: int
    username: str
    email: Optional[str]
    display_name: Optional[str]
    role: str
    is_active: bool
    photo_path: Optional[str]
    created_at: datetime
    last_login: Optional[datetime]

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    """User creation model."""
    username: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    password: str
    role: str = "viewer"


class UserUpdate(BaseModel):
    """User update model."""
    email: Optional[str] = None
    display_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class PasswordReset(BaseModel):
    """Password reset model."""
    new_password: str


class AuditLogResponse(BaseModel):
    """Audit log response model."""
    id: int
    user_id: Optional[int]
    username: Optional[str]
    action: str
    resource_type: str
    resource_id: Optional[str]
    details: Optional[str]
    ip_address: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class AuditLogFilter(BaseModel):
    """Audit log filter model."""
    user_id: Optional[int] = None
    action: Optional[str] = None
    resource_type: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


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
    db.commit()


# User management endpoints
@router.get("/users", response_model=List[UserResponse])
async def list_users(
    skip: int = 0,
    limit: int = 100,
    role: Optional[str] = None,
    is_active: Optional[bool] = None,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """List all users (admin only)."""
    query = db.query(User)

    if role:
        query = query.filter(User.role == role)
    if is_active is not None:
        query = query.filter(User.is_active == is_active)

    return query.order_by(User.created_at.desc()).offset(skip).limit(limit).all()


@router.post("/users", response_model=UserResponse, status_code=201)
async def create_user(
    user_data: UserCreate,
    request: Request,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Create a new user (admin only)."""
    # Check if username exists
    if db.query(User).filter(User.username == user_data.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")

    # Check if email exists
    if user_data.email and db.query(User).filter(User.email == user_data.email).first():
        raise HTTPException(status_code=400, detail="Email already exists")

    # Validate role
    if user_data.role not in ["admin", "manager", "viewer"]:
        raise HTTPException(status_code=400, detail="Invalid role. Use admin, manager, or viewer.")

    # Create user
    user = User(
        username=user_data.username,
        email=user_data.email,
        display_name=user_data.display_name,
        hashed_password=get_password_hash(user_data.password),
        role=user_data.role
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    log_action(db, current_user, "create", "user",
               str(user.id), f"Created user {user.username} with role {user.role}",
               request.client.host)

    return user


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Get a specific user (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    update: UserUpdate,
    request: Request,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Update a user (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    changes = []

    if update.email is not None and update.email != user.email:
        # Check if email is taken
        if db.query(User).filter(User.email == update.email, User.id != user_id).first():
            raise HTTPException(status_code=400, detail="Email already in use")
        changes.append(f"email: {user.email} -> {update.email}")
        user.email = update.email

    if update.display_name is not None and update.display_name != user.display_name:
        changes.append(f"display_name: {user.display_name} -> {update.display_name}")
        user.display_name = update.display_name

    if update.role is not None and update.role != user.role:
        if update.role not in ["admin", "manager", "viewer"]:
            raise HTTPException(status_code=400, detail="Invalid role")
        # Prevent demoting self
        if user_id == current_user.id and update.role != "admin":
            raise HTTPException(status_code=400, detail="Cannot demote yourself")
        changes.append(f"role: {user.role} -> {update.role}")
        user.role = update.role

    if update.is_active is not None and update.is_active != user.is_active:
        # Prevent deactivating self
        if user_id == current_user.id and not update.is_active:
            raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
        changes.append(f"is_active: {user.is_active} -> {update.is_active}")
        user.is_active = update.is_active

    if changes:
        log_action(db, current_user, "update", "user",
                   str(user_id), "; ".join(changes), request.client.host)

    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    request: Request,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Delete a user (admin only)."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    username = user.username
    db.delete(user)
    db.commit()

    log_action(db, current_user, "delete", "user",
               str(user_id), f"Deleted user {username}", request.client.host)

    return {"success": True, "message": f"User {username} deleted"}


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: int,
    password_data: PasswordReset,
    request: Request,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Reset a user's password (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if len(password_data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    user.hashed_password = get_password_hash(password_data.new_password)
    db.commit()

    log_action(db, current_user, "update", "password",
               str(user_id), f"Password reset for {user.username}", request.client.host)

    return {"success": True, "message": f"Password reset for {user.username}"}


# Role management endpoints
@router.get("/roles")
async def get_roles(current_user: User = Depends(require_admin)):
    """Get available roles and their permissions."""
    return {
        "roles": [
            {
                "name": "admin",
                "display_name": "Administrator",
                "description": "Full access to all features including user management",
                "permissions": ["all"]
            },
            {
                "name": "manager",
                "display_name": "Manager",
                "description": "Access to all features except user management",
                "permissions": ["view", "edit", "alerts", "reports", "settings"]
            },
            {
                "name": "viewer",
                "display_name": "Viewer",
                "description": "Read-only access to dashboards and reports",
                "permissions": ["view"]
            }
        ]
    }


@router.put("/users/{user_id}/role")
async def assign_role(
    user_id: int,
    role: str,
    request: Request,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Assign a role to a user (admin only)."""
    if role not in ["admin", "manager", "viewer"]:
        raise HTTPException(status_code=400, detail="Invalid role")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user_id == current_user.id and role != "admin":
        raise HTTPException(status_code=400, detail="Cannot demote yourself")

    old_role = user.role
    user.role = role
    db.commit()

    log_action(db, current_user, "update", "role",
               str(user_id), f"Role changed: {old_role} -> {role}", request.client.host)

    return {"success": True, "message": f"Role updated to {role}"}


# Audit log endpoints
@router.get("/audit-logs", response_model=List[AuditLogResponse])
async def get_audit_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Get audit logs with filtering (admin only)."""
    query = db.query(AuditLog)

    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    if action:
        query = query.filter(AuditLog.action == action)
    if resource_type:
        query = query.filter(AuditLog.resource_type == resource_type)
    if start_date:
        query = query.filter(AuditLog.created_at >= start_date)
    if end_date:
        query = query.filter(AuditLog.created_at <= end_date)

    return query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()


@router.get("/audit-logs/stats")
async def get_audit_log_stats(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Get audit log statistics (admin only)."""
    from sqlalchemy import func
    from datetime import timedelta

    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)

    total = db.query(func.count(AuditLog.id)).scalar() or 0
    today = db.query(func.count(AuditLog.id)).filter(
        AuditLog.created_at >= today_start
    ).scalar() or 0
    this_week = db.query(func.count(AuditLog.id)).filter(
        AuditLog.created_at >= week_start
    ).scalar() or 0

    # Count by action type
    by_action = dict(db.query(
        AuditLog.action, func.count(AuditLog.id)
    ).group_by(AuditLog.action).all())

    # Count by resource type
    by_resource = dict(db.query(
        AuditLog.resource_type, func.count(AuditLog.id)
    ).group_by(AuditLog.resource_type).all())

    return {
        "total": total,
        "today": today,
        "this_week": this_week,
        "by_action": by_action,
        "by_resource": by_resource
    }


@router.get("/audit-logs/actions")
async def get_audit_log_actions(current_user: User = Depends(require_admin)):
    """Get available audit log action types."""
    return {
        "actions": ["create", "update", "delete", "login", "logout", "export"]
    }


@router.get("/audit-logs/resource-types")
async def get_audit_log_resource_types(current_user: User = Depends(require_admin)):
    """Get available audit log resource types."""
    return {
        "resource_types": [
            "user", "profile", "photo", "password", "role",
            "notifications", "settings", "staff", "alert",
            "report", "business_hours"
        ]
    }
