"""Shift notes router for staff handoff communication."""

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import ShiftNote, User

router = APIRouter(prefix="/api/notes", tags=["shift-notes"])

# Note categories
NOTE_CATEGORIES = {
    "general": {"name": "General", "description": "General notes and observations", "color": "#6B7280"},
    "maintenance": {"name": "Maintenance", "description": "Equipment or facility maintenance needed", "color": "#F59E0B"},
    "customer": {"name": "Customer", "description": "Customer-related notes (VIPs, complaints, etc.)", "color": "#3B82F6"},
    "inventory": {"name": "Inventory", "description": "Inventory levels or supply needs", "color": "#10B981"},
    "staff": {"name": "Staff", "description": "Staff-related notes (absences, performance, etc.)", "color": "#8B5CF6"},
    "safety": {"name": "Safety", "description": "Safety concerns or reminders", "color": "#EF4444"}
}


def get_current_shift_type() -> str:
    """Determine current shift type based on time of day."""
    hour = datetime.utcnow().hour
    if 5 <= hour < 12:
        return "morning"
    elif 12 <= hour < 17:
        return "afternoon"
    else:
        return "evening"


# Pydantic models
class NoteCreate(BaseModel):
    """Create shift note."""
    content: str = Field(..., min_length=1, max_length=2000)
    category: str = Field(default="general", pattern="^(general|maintenance|customer|inventory|staff|safety)$")
    is_pinned: bool = False
    shift_date: Optional[str] = None  # ISO date, defaults to today
    shift_type: Optional[str] = Field(None, pattern="^(morning|afternoon|evening)$")


class NoteUpdate(BaseModel):
    """Update shift note."""
    content: Optional[str] = Field(None, min_length=1, max_length=2000)
    category: Optional[str] = Field(None, pattern="^(general|maintenance|customer|inventory|staff|safety)$")
    is_pinned: Optional[bool] = None


class NoteResponse(BaseModel):
    """Shift note response."""
    id: int
    content: str
    category: str
    is_pinned: bool
    is_acknowledged: bool
    acknowledged_by: Optional[int]
    acknowledged_by_name: Optional[str] = None
    acknowledged_at: Optional[datetime]
    created_by: int
    created_by_name: Optional[str] = None
    shift_date: datetime
    shift_type: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class NoteStats(BaseModel):
    """Note statistics."""
    total: int
    unread: int
    pinned: int
    by_category: dict


# Helper functions
def format_note_response(note: ShiftNote) -> dict:
    """Format note with related names."""
    return {
        "id": note.id,
        "content": note.content,
        "category": note.category,
        "is_pinned": note.is_pinned,
        "is_acknowledged": note.is_acknowledged,
        "acknowledged_by": note.acknowledged_by,
        "acknowledged_by_name": note.acknowledger.username if note.acknowledger else None,
        "acknowledged_at": note.acknowledged_at,
        "created_by": note.created_by,
        "created_by_name": note.creator.username if note.creator else None,
        "shift_date": note.shift_date,
        "shift_type": note.shift_type,
        "created_at": note.created_at,
        "updated_at": note.updated_at
    }


# ============== Categories ==============

@router.get("/categories")
async def get_note_categories():
    """Get available note categories."""
    return {"categories": NOTE_CATEGORIES}


# ============== Notes CRUD ==============

@router.get("", response_model=list[NoteResponse])
async def list_notes(
    category: Optional[str] = None,
    is_pinned: Optional[bool] = None,
    is_acknowledged: Optional[bool] = None,
    shift_type: Optional[str] = None,
    days: int = Query(default=7, ge=1, le=90),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db)
):
    """List shift notes with filtering."""
    query = db.query(ShiftNote).options(
        joinedload(ShiftNote.creator),
        joinedload(ShiftNote.acknowledger)
    )

    # Date range filter
    since = datetime.utcnow() - timedelta(days=days)
    query = query.filter(ShiftNote.created_at >= since)

    # Apply filters
    if category:
        query = query.filter(ShiftNote.category == category)
    if is_pinned is not None:
        query = query.filter(ShiftNote.is_pinned == is_pinned)
    if is_acknowledged is not None:
        query = query.filter(ShiftNote.is_acknowledged == is_acknowledged)
    if shift_type:
        query = query.filter(ShiftNote.shift_type == shift_type)

    # Order: pinned first, then by date
    notes = query.order_by(
        ShiftNote.is_pinned.desc(),
        ShiftNote.created_at.desc()
    ).offset(skip).limit(limit).all()

    return [format_note_response(n) for n in notes]


@router.get("/current-shift", response_model=list[NoteResponse])
async def get_current_shift_notes(
    include_unacknowledged_only: bool = Query(default=False),
    db: Session = Depends(get_db)
):
    """Get notes for the current shift (unread/pinned prioritized)."""
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    current_shift = get_current_shift_type()

    query = db.query(ShiftNote).options(
        joinedload(ShiftNote.creator),
        joinedload(ShiftNote.acknowledger)
    ).filter(
        ShiftNote.shift_date >= today - timedelta(days=1)  # Include yesterday's notes
    )

    if include_unacknowledged_only:
        query = query.filter(ShiftNote.is_acknowledged == False)

    notes = query.order_by(
        ShiftNote.is_pinned.desc(),
        ShiftNote.is_acknowledged.asc(),
        ShiftNote.created_at.desc()
    ).all()

    return [format_note_response(n) for n in notes]


@router.get("/unread-count")
async def get_unread_count(db: Session = Depends(get_db)):
    """Get count of unread (unacknowledged) notes."""
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    count = db.query(ShiftNote).filter(
        ShiftNote.shift_date >= today - timedelta(days=1),
        ShiftNote.is_acknowledged == False
    ).count()

    return {"unread_count": count}


# ============== Statistics (before dynamic routes) ==============

@router.get("/stats/summary", response_model=NoteStats)
async def get_note_stats(
    days: int = Query(default=7, ge=1, le=90),
    db: Session = Depends(get_db)
):
    """Get shift notes statistics."""
    since = datetime.utcnow() - timedelta(days=days)

    total = db.query(ShiftNote).filter(ShiftNote.created_at >= since).count()
    unread = db.query(ShiftNote).filter(
        ShiftNote.created_at >= since,
        ShiftNote.is_acknowledged == False
    ).count()
    pinned = db.query(ShiftNote).filter(
        ShiftNote.created_at >= since,
        ShiftNote.is_pinned == True
    ).count()

    # By category
    by_category = {}
    for cat in NOTE_CATEGORIES.keys():
        by_category[cat] = db.query(ShiftNote).filter(
            ShiftNote.created_at >= since,
            ShiftNote.category == cat
        ).count()

    return {
        "total": total,
        "unread": unread,
        "pinned": pinned,
        "by_category": by_category
    }


# ============== Quick Note Templates (before dynamic routes) ==============

@router.get("/templates")
async def get_note_templates():
    """Get quick note templates for common situations."""
    templates = [
        {"id": "low_inventory", "category": "inventory", "content": "Low inventory: [item]. Need restock by [date]."},
        {"id": "vip_customer", "category": "customer", "content": "VIP customer expected: [name]. Special requirements: [details]."},
        {"id": "maintenance_needed", "category": "maintenance", "content": "[Equipment/Area] needs maintenance. Issue: [description]."},
        {"id": "staff_callout", "category": "staff", "content": "[Staff name] called out. Coverage needed for [shift/position]."},
        {"id": "safety_concern", "category": "safety", "content": "Safety concern: [location]. Issue: [description]. Action taken: [action]."},
        {"id": "special_event", "category": "general", "content": "Special event: [event name]. Expected guests: [number]. Special notes: [details]."},
        {"id": "customer_feedback", "category": "customer", "content": "Customer feedback received. Type: [positive/negative]. Details: [summary]."},
        {"id": "equipment_issue", "category": "maintenance", "content": "[Equipment] is not working properly. Symptoms: [description]. Workaround: [if any]."}
    ]
    return {"templates": templates}


# ============== Note CRUD ==============

@router.post("", response_model=NoteResponse, status_code=201)
async def create_note(
    note: NoteCreate,
    created_by: int = Query(..., description="User ID of note creator"),
    db: Session = Depends(get_db)
):
    """Create a new shift note."""
    # Validate user
    user = db.query(User).filter(User.id == created_by).first()
    if not user:
        raise HTTPException(status_code=400, detail="User not found")

    # Parse shift date
    if note.shift_date:
        try:
            shift_date = datetime.fromisoformat(note.shift_date.replace('Z', '+00:00'))
        except ValueError:
            shift_date = datetime.utcnow()
    else:
        shift_date = datetime.utcnow()

    # Determine shift type if not provided
    shift_type = note.shift_type or get_current_shift_type()

    db_note = ShiftNote(
        content=note.content,
        category=note.category,
        is_pinned=note.is_pinned,
        created_by=created_by,
        shift_date=shift_date,
        shift_type=shift_type
    )
    db.add(db_note)
    db.commit()
    db.refresh(db_note)

    # Reload with relationships
    db_note = db.query(ShiftNote).options(
        joinedload(ShiftNote.creator),
        joinedload(ShiftNote.acknowledger)
    ).filter(ShiftNote.id == db_note.id).first()

    return format_note_response(db_note)


@router.get("/{note_id}", response_model=NoteResponse)
async def get_note(note_id: int, db: Session = Depends(get_db)):
    """Get a specific shift note."""
    note = db.query(ShiftNote).options(
        joinedload(ShiftNote.creator),
        joinedload(ShiftNote.acknowledger)
    ).filter(ShiftNote.id == note_id).first()

    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    return format_note_response(note)


@router.put("/{note_id}", response_model=NoteResponse)
async def update_note(
    note_id: int,
    update: NoteUpdate,
    db: Session = Depends(get_db)
):
    """Update a shift note."""
    note = db.query(ShiftNote).filter(ShiftNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    update_data = update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(note, key, value)

    note.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(note)

    # Reload with relationships
    note = db.query(ShiftNote).options(
        joinedload(ShiftNote.creator),
        joinedload(ShiftNote.acknowledger)
    ).filter(ShiftNote.id == note_id).first()

    return format_note_response(note)


@router.delete("/{note_id}")
async def delete_note(note_id: int, db: Session = Depends(get_db)):
    """Delete a shift note."""
    note = db.query(ShiftNote).filter(ShiftNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    db.delete(note)
    db.commit()
    return {"success": True, "message": f"Note {note_id} deleted"}


# ============== Note Actions ==============

@router.post("/{note_id}/pin")
async def toggle_pin(note_id: int, db: Session = Depends(get_db)):
    """Toggle pin status of a note."""
    note = db.query(ShiftNote).filter(ShiftNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    note.is_pinned = not note.is_pinned
    note.updated_at = datetime.utcnow()
    db.commit()

    return {"success": True, "is_pinned": note.is_pinned}


@router.post("/{note_id}/acknowledge")
async def acknowledge_note(
    note_id: int,
    acknowledged_by: int = Query(..., description="User ID acknowledging the note"),
    db: Session = Depends(get_db)
):
    """Mark a note as acknowledged."""
    note = db.query(ShiftNote).filter(ShiftNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    # Validate user
    user = db.query(User).filter(User.id == acknowledged_by).first()
    if not user:
        raise HTTPException(status_code=400, detail="User not found")

    note.is_acknowledged = True
    note.acknowledged_by = acknowledged_by
    note.acknowledged_at = datetime.utcnow()
    note.updated_at = datetime.utcnow()
    db.commit()

    return {"success": True, "message": f"Note {note_id} acknowledged"}


@router.post("/acknowledge-all")
async def acknowledge_all_notes(
    acknowledged_by: int = Query(..., description="User ID acknowledging the notes"),
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Acknowledge all unread notes."""
    # Validate user
    user = db.query(User).filter(User.id == acknowledged_by).first()
    if not user:
        raise HTTPException(status_code=400, detail="User not found")

    query = db.query(ShiftNote).filter(ShiftNote.is_acknowledged == False)

    if category:
        query = query.filter(ShiftNote.category == category)

    count = query.update({
        "is_acknowledged": True,
        "acknowledged_by": acknowledged_by,
        "acknowledged_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    })
    db.commit()

    return {"success": True, "acknowledged_count": count}
