"""Staff management API router."""

import os
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models import Staff
from frigate_service import frigate_service

router = APIRouter(prefix="/api/staff", tags=["staff"])

# Photo storage path
PHOTO_STORAGE_PATH = os.getenv("PHOTO_STORAGE_PATH", "/app/data/photos")


# Pydantic schemas
class StaffCreate(BaseModel):
    name: str
    role: str
    badge_id: Optional[str] = None


class StaffUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    badge_id: Optional[str] = None
    is_active: Optional[bool] = None


class StaffResponse(BaseModel):
    id: int
    name: str
    role: str
    badge_id: Optional[str]
    photo_path: Optional[str]
    frigate_face_id: Optional[str]
    face_trained: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class StaffListResponse(BaseModel):
    staff: list[StaffResponse]
    total: int


class TrainingStatusResponse(BaseModel):
    staff_id: int
    name: str
    face_trained: bool
    frigate_face_id: Optional[str]
    message: str


# CRUD Endpoints
@router.get("", response_model=StaffListResponse)
async def list_staff(
    skip: int = 0,
    limit: int = 100,
    active_only: bool = False,
    db: Session = Depends(get_db)
):
    """Get list of all staff members."""
    query = db.query(Staff)
    if active_only:
        query = query.filter(Staff.is_active == True)

    total = query.count()
    staff = query.offset(skip).limit(limit).all()

    return StaffListResponse(staff=staff, total=total)


@router.post("", response_model=StaffResponse, status_code=201)
async def create_staff(
    staff_data: StaffCreate,
    db: Session = Depends(get_db)
):
    """Create a new staff member."""
    # Check for duplicate badge_id
    if staff_data.badge_id:
        existing = db.query(Staff).filter(Staff.badge_id == staff_data.badge_id).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Badge ID {staff_data.badge_id} is already assigned"
            )

    staff = Staff(
        name=staff_data.name,
        role=staff_data.role,
        badge_id=staff_data.badge_id
    )
    db.add(staff)
    db.commit()
    db.refresh(staff)

    return staff


@router.get("/{staff_id}", response_model=StaffResponse)
async def get_staff(staff_id: int, db: Session = Depends(get_db)):
    """Get a specific staff member by ID."""
    staff = db.query(Staff).filter(Staff.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")
    return staff


@router.put("/{staff_id}", response_model=StaffResponse)
async def update_staff(
    staff_id: int,
    staff_data: StaffUpdate,
    db: Session = Depends(get_db)
):
    """Update a staff member."""
    staff = db.query(Staff).filter(Staff.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")

    # Check for duplicate badge_id if changing
    if staff_data.badge_id and staff_data.badge_id != staff.badge_id:
        existing = db.query(Staff).filter(Staff.badge_id == staff_data.badge_id).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Badge ID {staff_data.badge_id} is already assigned"
            )

    # Update fields
    update_data = staff_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(staff, field, value)

    db.commit()
    db.refresh(staff)

    return staff


@router.delete("/{staff_id}")
async def delete_staff(staff_id: int, db: Session = Depends(get_db)):
    """Delete a staff member."""
    staff = db.query(Staff).filter(Staff.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")

    # Delete face from Frigate if registered
    if staff.frigate_face_id:
        try:
            await frigate_service.delete_face(staff.frigate_face_id)
        except Exception:
            pass  # Continue even if Frigate delete fails

    # Delete photo file if exists
    if staff.photo_path and os.path.exists(staff.photo_path):
        try:
            os.remove(staff.photo_path)
        except Exception:
            pass

    db.delete(staff)
    db.commit()

    return {"message": f"Staff member {staff_id} deleted"}


# Photo Upload Endpoint
@router.post("/{staff_id}/photo", response_model=StaffResponse)
async def upload_photo(
    staff_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Upload a face photo for a staff member."""
    staff = db.query(Staff).filter(Staff.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")

    # Validate file type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    # Create storage directory if needed
    os.makedirs(PHOTO_STORAGE_PATH, exist_ok=True)

    # Generate unique filename
    ext = file.filename.split(".")[-1] if file.filename and "." in file.filename else "jpg"
    filename = f"staff_{staff_id}_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = os.path.join(PHOTO_STORAGE_PATH, filename)

    # Delete old photo if exists
    if staff.photo_path and os.path.exists(staff.photo_path):
        try:
            os.remove(staff.photo_path)
        except Exception:
            pass

    # Save new photo
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    # Update staff record
    staff.photo_path = filepath
    staff.face_trained = False  # Reset training status
    db.commit()
    db.refresh(staff)

    return staff


# Face Training Endpoints
@router.post("/{staff_id}/train", response_model=TrainingStatusResponse)
async def train_face(staff_id: int, db: Session = Depends(get_db)):
    """Upload face to Frigate and trigger training for a staff member."""
    staff = db.query(Staff).filter(Staff.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")

    if not staff.photo_path or not os.path.exists(staff.photo_path):
        raise HTTPException(
            status_code=400,
            detail="Staff member has no photo. Upload a photo first."
        )

    # Generate face ID from staff name (sanitize for Frigate)
    face_id = staff.name.lower().replace(" ", "_").replace("-", "_")
    face_id = "".join(c for c in face_id if c.isalnum() or c == "_")

    try:
        # Read photo file
        with open(staff.photo_path, "rb") as f:
            image_data = f.read()

        # Upload face to Frigate
        await frigate_service.upload_face(face_id, image_data)

        # Trigger training
        await frigate_service.train_face(face_id)

        # Update staff record
        staff.frigate_face_id = face_id
        staff.face_trained = True
        db.commit()
        db.refresh(staff)

        return TrainingStatusResponse(
            staff_id=staff.id,
            name=staff.name,
            face_trained=True,
            frigate_face_id=face_id,
            message=f"Face training completed for {staff.name}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Face training failed: {str(e)}"
        )


@router.get("/{staff_id}/training-status", response_model=TrainingStatusResponse)
async def get_training_status(staff_id: int, db: Session = Depends(get_db)):
    """Get the face training status for a staff member."""
    staff = db.query(Staff).filter(Staff.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")

    message = "Face trained and registered" if staff.face_trained else "Face not trained"
    if not staff.photo_path:
        message = "No photo uploaded"

    return TrainingStatusResponse(
        staff_id=staff.id,
        name=staff.name,
        face_trained=staff.face_trained,
        frigate_face_id=staff.frigate_face_id,
        message=message
    )


@router.delete("/{staff_id}/face")
async def delete_face(staff_id: int, db: Session = Depends(get_db)):
    """Delete a staff member's face from Frigate."""
    staff = db.query(Staff).filter(Staff.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")

    if not staff.frigate_face_id:
        raise HTTPException(
            status_code=400,
            detail="Staff member has no registered face"
        )

    try:
        await frigate_service.delete_face(staff.frigate_face_id)

        staff.frigate_face_id = None
        staff.face_trained = False
        db.commit()

        return {"message": f"Face deleted for staff member {staff_id}"}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete face: {str(e)}"
        )


# Photo Serving Endpoint
@router.get("/{staff_id}/photo-file")
async def get_staff_photo(staff_id: int, db: Session = Depends(get_db)):
    """Serve the photo file for a staff member."""
    staff = db.query(Staff).filter(Staff.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")

    if not staff.photo_path or not os.path.exists(staff.photo_path):
        raise HTTPException(status_code=404, detail="No photo available")

    # Determine media type from extension
    ext = staff.photo_path.split(".")[-1].lower()
    media_types = {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "gif": "image/gif",
        "webp": "image/webp"
    }
    media_type = media_types.get(ext, "image/jpeg")

    return FileResponse(staff.photo_path, media_type=media_type)


# Activity Log Endpoint
class StaffActivityResponse(BaseModel):
    id: int
    staff_id: int
    action: str
    details: str
    timestamp: datetime


@router.get("/{staff_id}/activity", response_model=list[StaffActivityResponse])
async def get_staff_activity(
    staff_id: int,
    limit: int = 20,
    db: Session = Depends(get_db)
):
    """Get activity log for a staff member.

    Note: Activity tracking is not fully implemented yet.
    This endpoint returns an empty list for now.
    """
    staff = db.query(Staff).filter(Staff.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")

    # Activity log is not implemented yet - return empty list
    # In the future, this would query a StaffActivity table
    return []


# Quick Create from Detection Endpoints

class QuickCreateRequest(BaseModel):
    """Request body for quick staff creation with face image."""
    name: str
    role: str = "server"
    face_image: str  # Base64 encoded JPEG image


class AddFaceFromDetectionRequest(BaseModel):
    """Request body for adding a face from detection."""
    face_image: str  # Base64 encoded JPEG image


@router.post("/quick-create", response_model=StaffResponse, status_code=201)
async def quick_create_staff_with_face(
    request: QuickCreateRequest,
    db: Session = Depends(get_db)
):
    """Create a new staff member and train their face in one step.

    This endpoint is used when labeling a detected person from camera feed.
    It creates the staff record, saves the face image, and trains Frigate.
    """
    import base64

    # Create staff record
    staff = Staff(
        name=request.name,
        role=request.role
    )
    db.add(staff)
    db.commit()
    db.refresh(staff)

    try:
        # Decode base64 image
        # Handle data URL format (data:image/jpeg;base64,...)
        image_data_str = request.face_image
        if "," in image_data_str:
            image_data_str = image_data_str.split(",")[1]

        image_data = base64.b64decode(image_data_str)

        # Create storage directory if needed
        os.makedirs(PHOTO_STORAGE_PATH, exist_ok=True)

        # Save photo locally
        filename = f"staff_{staff.id}_{uuid.uuid4().hex[:8]}.jpg"
        filepath = os.path.join(PHOTO_STORAGE_PATH, filename)
        with open(filepath, "wb") as f:
            f.write(image_data)

        staff.photo_path = filepath

        # Generate face ID from staff name
        face_id = request.name.lower().replace(" ", "_").replace("-", "_")
        face_id = "".join(c for c in face_id if c.isalnum() or c == "_")

        # Upload face to Frigate
        await frigate_service.upload_face(face_id, image_data)

        # Trigger training
        await frigate_service.train_face(face_id)

        # Update staff record with face info
        staff.frigate_face_id = face_id
        staff.face_trained = True
        db.commit()
        db.refresh(staff)

        return staff

    except Exception as e:
        # If training fails, still keep the staff record but mark as not trained
        db.commit()
        db.refresh(staff)
        raise HTTPException(
            status_code=500,
            detail=f"Staff created but face training failed: {str(e)}"
        )


@router.post("/{staff_id}/face/add-from-detection", response_model=TrainingStatusResponse)
async def add_face_from_detection(
    staff_id: int,
    request: AddFaceFromDetectionRequest,
    db: Session = Depends(get_db)
):
    """Add an additional training photo for an existing staff member.

    This endpoint is used when labeling a detected person as an existing staff member.
    The image is added to Frigate's face training dataset for that person.
    """
    import base64

    staff = db.query(Staff).filter(Staff.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")

    try:
        # Decode base64 image
        image_data_str = request.face_image
        if "," in image_data_str:
            image_data_str = image_data_str.split(",")[1]

        image_data = base64.b64decode(image_data_str)

        # Generate face ID from staff name (or use existing)
        face_id = staff.frigate_face_id
        if not face_id:
            face_id = staff.name.lower().replace(" ", "_").replace("-", "_")
            face_id = "".join(c for c in face_id if c.isalnum() or c == "_")

        # Upload additional face image to Frigate
        await frigate_service.upload_face(face_id, image_data)

        # Trigger training refresh
        await frigate_service.train_face(face_id)

        # Update staff record if not already trained
        if not staff.face_trained or not staff.frigate_face_id:
            staff.frigate_face_id = face_id
            staff.face_trained = True
            db.commit()
            db.refresh(staff)

        return TrainingStatusResponse(
            staff_id=staff.id,
            name=staff.name,
            face_trained=True,
            frigate_face_id=face_id,
            message=f"Additional training image added for {staff.name}"
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to add training image: {str(e)}"
        )
