"""Profile router for user profile management."""

import os
import shutil
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import User, AuditLog
from routers.auth import require_auth, get_password_hash, verify_password

router = APIRouter(prefix="/api/profile", tags=["profile"])

# Ensure upload directory exists
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "/app/uploads")
PROFILE_PHOTOS_DIR = os.path.join(UPLOAD_DIR, "profiles")
os.makedirs(PROFILE_PHOTOS_DIR, exist_ok=True)


# Pydantic models
class ProfileResponse(BaseModel):
    """User profile response."""
    id: int
    username: str
    email: Optional[str]
    display_name: Optional[str]
    role: str
    is_active: bool
    photo_path: Optional[str]
    notify_email: bool
    notify_in_app: bool
    notify_alerts: bool
    notify_reports: bool
    created_at: datetime
    last_login: Optional[datetime]

    class Config:
        from_attributes = True


class ProfileUpdate(BaseModel):
    """Profile update model."""
    email: Optional[str] = None
    display_name: Optional[str] = None


class NotificationPreferences(BaseModel):
    """Notification preferences model."""
    notify_email: bool = True
    notify_in_app: bool = True
    notify_alerts: bool = True
    notify_reports: bool = True


class PasswordChange(BaseModel):
    """Password change model."""
    current_password: str
    new_password: str


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


@router.get("", response_model=ProfileResponse)
async def get_profile(current_user: User = Depends(require_auth)):
    """Get current user's profile."""
    return current_user


@router.put("", response_model=ProfileResponse)
async def update_profile(
    update: ProfileUpdate,
    request: Request,
    current_user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """Update current user's profile."""
    changes = []

    if update.email is not None and update.email != current_user.email:
        # Check if email is already taken
        existing = db.query(User).filter(User.email == update.email, User.id != current_user.id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")
        changes.append(f"email: {current_user.email} -> {update.email}")
        current_user.email = update.email

    if update.display_name is not None and update.display_name != current_user.display_name:
        changes.append(f"display_name: {current_user.display_name} -> {update.display_name}")
        current_user.display_name = update.display_name

    if changes:
        log_action(db, current_user, "update", "profile",
                   str(current_user.id), "; ".join(changes), request.client.host)

    db.commit()
    db.refresh(current_user)
    return current_user


@router.put("/notifications", response_model=ProfileResponse)
async def update_notification_preferences(
    prefs: NotificationPreferences,
    request: Request,
    current_user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """Update notification preferences."""
    current_user.notify_email = prefs.notify_email
    current_user.notify_in_app = prefs.notify_in_app
    current_user.notify_alerts = prefs.notify_alerts
    current_user.notify_reports = prefs.notify_reports

    log_action(db, current_user, "update", "notifications",
               str(current_user.id), f"Updated notification preferences", request.client.host)

    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/password")
async def change_password(
    password_data: PasswordChange,
    request: Request,
    current_user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """Change current user's password."""
    if not verify_password(password_data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if len(password_data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    current_user.hashed_password = get_password_hash(password_data.new_password)

    log_action(db, current_user, "update", "password",
               str(current_user.id), "Password changed", request.client.host)

    db.commit()

    return {"success": True, "message": "Password changed successfully"}


@router.post("/photo")
async def upload_profile_photo(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """Upload profile photo."""
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type. Use JPEG, PNG, GIF, or WebP.")

    # Validate file size (max 5MB)
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 5MB.")

    # Delete old photo if exists
    if current_user.photo_path and os.path.exists(current_user.photo_path):
        try:
            os.remove(current_user.photo_path)
        except Exception:
            pass

    # Generate filename
    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    filename = f"user_{current_user.id}_{datetime.utcnow().timestamp()}.{ext}"
    filepath = os.path.join(PROFILE_PHOTOS_DIR, filename)

    # Save file
    with open(filepath, "wb") as f:
        f.write(contents)

    current_user.photo_path = filepath

    log_action(db, current_user, "update", "photo",
               str(current_user.id), "Profile photo uploaded", request.client.host)

    db.commit()
    db.refresh(current_user)

    return {"success": True, "photo_path": filepath}


@router.delete("/photo")
async def delete_profile_photo(
    request: Request,
    current_user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """Delete profile photo."""
    if current_user.photo_path and os.path.exists(current_user.photo_path):
        try:
            os.remove(current_user.photo_path)
        except Exception:
            pass

    current_user.photo_path = None

    log_action(db, current_user, "delete", "photo",
               str(current_user.id), "Profile photo deleted", request.client.host)

    db.commit()

    return {"success": True, "message": "Photo deleted"}


@router.get("/photo-file")
async def get_profile_photo(current_user: User = Depends(require_auth)):
    """Get current user's profile photo."""
    from fastapi.responses import FileResponse

    if not current_user.photo_path or not os.path.exists(current_user.photo_path):
        raise HTTPException(status_code=404, detail="No profile photo")

    return FileResponse(current_user.photo_path)
