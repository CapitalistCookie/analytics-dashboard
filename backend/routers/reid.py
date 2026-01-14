"""Person Re-Identification (ReID) API router."""

import string
from datetime import datetime, timedelta
from typing import Optional, List

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel

from database import get_db
from models import TrackedPerson, PersonEmbedding, PersonSighting, Staff, StaffAppearanceEmbedding, NegativePair
from reid_service import get_reid_service, ReIDService
from reid_worker import (
    get_adaptive_threshold,
    get_all_adaptive_thresholds,
    get_transition_stats,
    get_transition_time,
    ADAPTIVE_THRESHOLDS,
    CAMERA_ADJACENCY,
    CAMERA_TRANSITION_TIMES,
    EXIT_BOOST_THRESHOLDS,
    _active_tracks,
    _negative_pairs_cache,
    _transition_counts,
    _recent_exits,
)

router = APIRouter(prefix="/api/reid", tags=["reid"])

# Configuration
SIMILARITY_THRESHOLD = 0.80  # Minimum similarity to consider a match (increased from 0.7)
MAX_EMBEDDING_AGE = 3600  # Seconds before embeddings should be refreshed
EMBEDDINGS_PER_PERSON = 5  # Keep N most recent embeddings per person
INACTIVE_TIMEOUT = 300  # Seconds before person is marked inactive (5 min)

# Camera-to-zone mapping (shared with reid_worker)
CAMERA_ZONES = {
    "cam_009": "entrance",
    "cam_054": "hallway",
    "cam_028": "seating_main",
    "cam_192": "seating_service",
    "cam_179": "service_area",
    "cam_040": "cashier",
    "cam_108": "kitchen",
    "cam_239": "kitchen_prep",
}


# Pydantic schemas
class ExtractRequest(BaseModel):
    image: str  # Base64 encoded image
    camera_id: Optional[str] = None


class ExtractResponse(BaseModel):
    success: bool
    embedding_dim: int
    message: str


class MatchRequest(BaseModel):
    image: str  # Base64 encoded image
    camera_id: Optional[str] = None
    zone_name: Optional[str] = None
    frigate_event_id: Optional[str] = None
    confidence: float = 1.0


class MatchResponse(BaseModel):
    matched: bool
    person_id: Optional[int] = None
    display_id: Optional[str] = None
    similarity: Optional[float] = None
    is_staff: bool = False
    staff_name: Optional[str] = None
    is_new: bool = False


class PersonResponse(BaseModel):
    id: int
    display_id: str
    name: Optional[str] = None  # Named customer
    is_regular: bool = False
    notes: Optional[str] = None
    person_type: str = "visitor"  # "visitor", "regular", "staff"
    first_seen: datetime
    last_seen: datetime
    first_camera_id: Optional[str]
    last_camera_id: Optional[str]
    is_customer: bool
    is_staff: bool
    staff_name: Optional[str]
    visit_count: int
    is_active: bool
    embedding_count: int

    class Config:
        from_attributes = True


class PersonListResponse(BaseModel):
    persons: List[PersonResponse]
    total: int
    active_count: int


class SightingResponse(BaseModel):
    id: int
    camera_id: str
    zone_name: Optional[str]
    enter_time: datetime
    exit_time: Optional[datetime]
    confidence: float

    class Config:
        from_attributes = True


class PersonHistoryResponse(BaseModel):
    person_id: int
    display_id: str
    sightings: List[SightingResponse]


class JourneyStop(BaseModel):
    camera: str
    zone: str
    enter: str  # ISO timestamp
    exit: Optional[str]  # ISO timestamp or null if still there
    dwell_seconds: Optional[int]  # Time spent at this location


class JourneyResponse(BaseModel):
    person_id: int
    display_id: str
    journey: List[JourneyStop]
    total_duration: str
    total_seconds: int
    zone_summary: dict  # zone -> total_seconds
    current_zone: Optional[str]
    current_camera: Optional[str]
    is_active: bool


class ConfigResponse(BaseModel):
    similarity_threshold: float
    max_embedding_age: int
    embeddings_per_person: int
    inactive_timeout: int


class ConfigUpdate(BaseModel):
    similarity_threshold: Optional[float] = None
    max_embedding_age: Optional[int] = None
    embeddings_per_person: Optional[int] = None
    inactive_timeout: Optional[int] = None


class PersonUpdate(BaseModel):
    """Request to update a tracked person."""
    name: Optional[str] = None
    is_regular: Optional[bool] = None
    notes: Optional[str] = None
    person_type: Optional[str] = None  # "visitor", "regular", "staff"


class LabelAsRegularRequest(BaseModel):
    """Request to label a person as a regular customer."""
    name: str
    notes: Optional[str] = None


class MergeRequest(BaseModel):
    """Request to merge two persons into one."""
    keep_id: int  # Person ID to keep
    merge_id: int  # Person ID to merge into keep_id (will be deleted)


class SplitRequest(BaseModel):
    """Request to split sightings/embeddings from a person."""
    person_id: int
    sighting_ids: Optional[List[int]] = None  # Sightings to move to new person
    embedding_ids: Optional[List[int]] = None  # Embeddings to move to new person


class NegativePairRequest(BaseModel):
    """Request to mark two persons as NOT the same."""
    person_id_a: int
    person_id_b: int
    reason: Optional[str] = None


class EmbeddingResponse(BaseModel):
    """Response for embedding info."""
    id: int
    camera_id: Optional[str]
    confidence: float
    is_verified: bool
    created_at: datetime

    class Config:
        from_attributes = True


class PersonDetailResponse(BaseModel):
    """Detailed person response with embeddings and sightings."""
    id: int
    display_id: str
    name: Optional[str]
    is_regular: bool
    notes: Optional[str]
    person_type: str
    first_seen: datetime
    last_seen: datetime
    first_camera_id: Optional[str]
    last_camera_id: Optional[str]
    is_customer: bool
    is_staff: bool
    staff_name: Optional[str]
    visit_count: int
    is_active: bool
    embeddings: List[EmbeddingResponse]
    sightings: List[SightingResponse]


# Helper functions
def generate_display_id(db: Session) -> str:
    """Generate a unique display ID like A1, B23, etc."""
    # Get the highest existing display_id
    last_person = db.query(TrackedPerson).order_by(desc(TrackedPerson.id)).first()

    if not last_person:
        return "A1"

    # Parse the last display_id
    last_id = last_person.display_id
    letter = last_id[0]
    number = int(last_id[1:]) if len(last_id) > 1 else 0

    # Increment
    number += 1
    if number > 99:
        # Move to next letter
        letter_idx = string.ascii_uppercase.index(letter)
        if letter_idx < 25:
            letter = string.ascii_uppercase[letter_idx + 1]
            number = 1
        else:
            # Wrap around (unlikely but handle it)
            letter = "A"
            number = 1

    return f"{letter}{number}"


def serialize_embedding(embedding: np.ndarray) -> bytes:
    """Serialize numpy embedding to bytes."""
    return embedding.astype(np.float32).tobytes()


def deserialize_embedding(data: bytes) -> np.ndarray:
    """Deserialize bytes to numpy embedding."""
    return np.frombuffer(data, dtype=np.float32)


def get_person_embeddings(db: Session, person_id: int) -> List[np.ndarray]:
    """Get all embeddings for a person."""
    embeddings = db.query(PersonEmbedding).filter(
        PersonEmbedding.person_id == person_id
    ).order_by(desc(PersonEmbedding.created_at)).limit(EMBEDDINGS_PER_PERSON).all()
    return [deserialize_embedding(e.embedding) for e in embeddings]


def get_all_active_embeddings(db: Session) -> List[tuple]:
    """Get embeddings for all active persons."""
    # Get active persons (seen in last INACTIVE_TIMEOUT seconds)
    cutoff = datetime.utcnow() - timedelta(seconds=INACTIVE_TIMEOUT * 6)  # Look back further for matching
    persons = db.query(TrackedPerson).filter(
        TrackedPerson.last_seen >= cutoff
    ).all()

    result = []
    for person in persons:
        embeddings = get_person_embeddings(db, person.id)
        if embeddings:
            result.append((person.id, embeddings))
    return result


# Endpoints
@router.get("/status")
async def get_status(
    reid_service: ReIDService = Depends(get_reid_service)
):
    """Get ReID service status."""
    return {
        "initialized": reid_service.is_initialized(),
        "embedding_dim": reid_service.get_embedding_dim(),
        "device": "cuda" if reid_service.device.type == "cuda" else "cpu"
    }


@router.post("/initialize")
async def initialize_service(
    reid_service: ReIDService = Depends(get_reid_service)
):
    """Initialize the ReID service (download model if needed)."""
    success = await reid_service.initialize()
    if success:
        return {"status": "initialized", "message": "ReID service ready"}
    else:
        raise HTTPException(status_code=500, detail="Failed to initialize ReID service")


@router.post("/extract", response_model=ExtractResponse)
async def extract_embedding(
    request: ExtractRequest,
    reid_service: ReIDService = Depends(get_reid_service)
):
    """Extract appearance embedding from an image."""
    embedding = await reid_service.extract_features(request.image)

    if embedding is None:
        raise HTTPException(status_code=400, detail="Failed to extract features from image")

    return ExtractResponse(
        success=True,
        embedding_dim=len(embedding),
        message="Embedding extracted successfully"
    )


@router.post("/match", response_model=MatchResponse)
async def match_person(
    request: MatchRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    reid_service: ReIDService = Depends(get_reid_service)
):
    """Match a person image against known persons."""
    # Extract embedding
    embedding = await reid_service.extract_features(request.image)
    if embedding is None:
        raise HTTPException(status_code=400, detail="Failed to extract features from image")

    # Get all active person embeddings
    known_embeddings = get_all_active_embeddings(db)

    # Find match
    match_result = reid_service.find_matches_batch(
        embedding,
        known_embeddings,
        threshold=SIMILARITY_THRESHOLD
    )

    if match_result:
        person_id, similarity = match_result

        # Update existing person
        person = db.query(TrackedPerson).filter(TrackedPerson.id == person_id).first()
        if person:
            person.last_seen = datetime.utcnow()
            person.last_camera_id = request.camera_id
            person.is_active = True

            # Add new embedding if we don't have too many
            emb_count = db.query(PersonEmbedding).filter(
                PersonEmbedding.person_id == person_id
            ).count()

            if emb_count < EMBEDDINGS_PER_PERSON:
                new_emb = PersonEmbedding(
                    person_id=person_id,
                    embedding=serialize_embedding(embedding),
                    camera_id=request.camera_id,
                    confidence=request.confidence
                )
                db.add(new_emb)

            # Add sighting
            sighting = PersonSighting(
                person_id=person_id,
                camera_id=request.camera_id or "unknown",
                frigate_event_id=request.frigate_event_id,
                zone_name=request.zone_name,
                confidence=request.confidence
            )
            db.add(sighting)
            db.commit()

            is_staff = person.staff_id is not None
            staff_name = None
            if is_staff and person.staff:
                staff_name = person.staff.name

            return MatchResponse(
                matched=True,
                person_id=person.id,
                display_id=person.display_id,
                similarity=similarity,
                is_staff=is_staff,
                staff_name=staff_name,
                is_new=False
            )

    # No match - create new person
    display_id = generate_display_id(db)
    new_person = TrackedPerson(
        display_id=display_id,
        first_camera_id=request.camera_id,
        last_camera_id=request.camera_id,
        first_seen=datetime.utcnow(),
        last_seen=datetime.utcnow(),
        is_customer=True,
        is_active=True
    )
    db.add(new_person)
    db.flush()  # Get the ID

    # Add embedding
    new_emb = PersonEmbedding(
        person_id=new_person.id,
        embedding=serialize_embedding(embedding),
        camera_id=request.camera_id,
        confidence=request.confidence
    )
    db.add(new_emb)

    # Add first sighting
    sighting = PersonSighting(
        person_id=new_person.id,
        camera_id=request.camera_id or "unknown",
        frigate_event_id=request.frigate_event_id,
        zone_name=request.zone_name,
        confidence=request.confidence
    )
    db.add(sighting)
    db.commit()

    return MatchResponse(
        matched=True,
        person_id=new_person.id,
        display_id=new_person.display_id,
        similarity=1.0,
        is_staff=False,
        staff_name=None,
        is_new=True
    )


@router.get("/persons", response_model=PersonListResponse)
async def list_persons(
    active_only: bool = False,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """List tracked persons."""
    query = db.query(TrackedPerson)

    if active_only:
        cutoff = datetime.utcnow() - timedelta(seconds=INACTIVE_TIMEOUT)
        query = query.filter(
            TrackedPerson.is_active == True,
            TrackedPerson.last_seen >= cutoff
        )

    total = query.count()
    persons = query.order_by(desc(TrackedPerson.last_seen)).offset(offset).limit(limit).all()

    # Get active count
    cutoff = datetime.utcnow() - timedelta(seconds=INACTIVE_TIMEOUT)
    active_count = db.query(TrackedPerson).filter(
        TrackedPerson.is_active == True,
        TrackedPerson.last_seen >= cutoff
    ).count()

    result = []
    for person in persons:
        emb_count = db.query(PersonEmbedding).filter(
            PersonEmbedding.person_id == person.id
        ).count()

        result.append(PersonResponse(
            id=person.id,
            display_id=person.display_id,
            name=person.name,
            is_regular=person.is_regular or False,
            notes=person.notes,
            person_type=person.person_type or "visitor",
            first_seen=person.first_seen,
            last_seen=person.last_seen,
            first_camera_id=person.first_camera_id,
            last_camera_id=person.last_camera_id,
            is_customer=person.is_customer,
            is_staff=person.staff_id is not None,
            staff_name=person.staff.name if person.staff else None,
            visit_count=person.visit_count,
            is_active=person.is_active and person.last_seen >= cutoff,
            embedding_count=emb_count
        ))

    return PersonListResponse(
        persons=result,
        total=total,
        active_count=active_count
    )


@router.get("/persons/{person_id}", response_model=PersonResponse)
async def get_person(
    person_id: int,
    db: Session = Depends(get_db)
):
    """Get a specific tracked person."""
    person = db.query(TrackedPerson).filter(TrackedPerson.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    emb_count = db.query(PersonEmbedding).filter(
        PersonEmbedding.person_id == person.id
    ).count()

    cutoff = datetime.utcnow() - timedelta(seconds=INACTIVE_TIMEOUT)

    return PersonResponse(
        id=person.id,
        display_id=person.display_id,
        name=person.name,
        is_regular=person.is_regular or False,
        notes=person.notes,
        person_type=person.person_type or "visitor",
        first_seen=person.first_seen,
        last_seen=person.last_seen,
        first_camera_id=person.first_camera_id,
        last_camera_id=person.last_camera_id,
        is_customer=person.is_customer,
        is_staff=person.staff_id is not None,
        staff_name=person.staff.name if person.staff else None,
        visit_count=person.visit_count,
        is_active=person.is_active and person.last_seen >= cutoff,
        embedding_count=emb_count
    )


@router.get("/persons/{person_id}/history", response_model=PersonHistoryResponse)
async def get_person_history(
    person_id: int,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get camera history for a tracked person."""
    person = db.query(TrackedPerson).filter(TrackedPerson.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    sightings = db.query(PersonSighting).filter(
        PersonSighting.person_id == person_id
    ).order_by(desc(PersonSighting.enter_time)).limit(limit).all()

    return PersonHistoryResponse(
        person_id=person.id,
        display_id=person.display_id,
        sightings=[SightingResponse(
            id=s.id,
            camera_id=s.camera_id,
            zone_name=s.zone_name,
            enter_time=s.enter_time,
            exit_time=s.exit_time,
            confidence=s.confidence
        ) for s in sightings]
    )


@router.get("/persons/{person_id}/journey", response_model=JourneyResponse)
async def get_person_journey(
    person_id: int,
    db: Session = Depends(get_db)
):
    """
    Get the journey reconstruction for a tracked person.

    Returns ordered list of camera/zone visits with timestamps and dwell times.
    Consolidates multiple sightings on the same camera into single journey stops.
    """
    person = db.query(TrackedPerson).filter(TrackedPerson.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    # Get all sightings ordered by time
    sightings = db.query(PersonSighting).filter(
        PersonSighting.person_id == person_id
    ).order_by(PersonSighting.enter_time).all()

    # Reconstruct journey by consolidating consecutive same-camera sightings
    journey = []
    zone_times = {}  # zone -> total seconds
    current_stop = None

    for sighting in sightings:
        zone = CAMERA_ZONES.get(sighting.camera_id, sighting.zone_name or "unknown")

        if current_stop and current_stop["camera"] == sighting.camera_id:
            # Same camera - update exit time
            if sighting.exit_time:
                current_stop["exit"] = sighting.exit_time.isoformat()
            elif sighting.enter_time:
                current_stop["exit"] = sighting.enter_time.isoformat()
        else:
            # New camera - finalize previous stop and start new one
            if current_stop:
                # Calculate dwell time for previous stop
                if current_stop["exit"]:
                    enter = datetime.fromisoformat(current_stop["enter"])
                    exit_time = datetime.fromisoformat(current_stop["exit"])
                    dwell = int((exit_time - enter).total_seconds())
                    current_stop["dwell_seconds"] = dwell

                    # Add to zone summary
                    stop_zone = current_stop["zone"]
                    zone_times[stop_zone] = zone_times.get(stop_zone, 0) + dwell

                journey.append(JourneyStop(**current_stop))

            # Start new stop
            current_stop = {
                "camera": sighting.camera_id,
                "zone": zone,
                "enter": sighting.enter_time.isoformat(),
                "exit": sighting.exit_time.isoformat() if sighting.exit_time else None,
                "dwell_seconds": None
            }

    # Add final stop
    if current_stop:
        if current_stop["exit"]:
            enter = datetime.fromisoformat(current_stop["enter"])
            exit_time = datetime.fromisoformat(current_stop["exit"])
            dwell = int((exit_time - enter).total_seconds())
            current_stop["dwell_seconds"] = dwell
            zone_times[current_stop["zone"]] = zone_times.get(current_stop["zone"], 0) + dwell
        else:
            # Still at this location - calculate dwell from enter to now
            enter = datetime.fromisoformat(current_stop["enter"])
            dwell = int((datetime.utcnow() - enter).total_seconds())
            current_stop["dwell_seconds"] = dwell
            zone_times[current_stop["zone"]] = zone_times.get(current_stop["zone"], 0) + dwell

        journey.append(JourneyStop(**current_stop))

    # Calculate total duration
    if person.first_seen:
        total_seconds = int((datetime.utcnow() - person.first_seen).total_seconds())
        minutes = total_seconds // 60
        seconds = total_seconds % 60
        total_duration = f"{minutes}m {seconds}s"
    else:
        total_seconds = 0
        total_duration = "0m 0s"

    # Determine if active
    cutoff = datetime.utcnow() - timedelta(seconds=INACTIVE_TIMEOUT)
    is_active = person.is_active and person.last_seen and person.last_seen >= cutoff

    current_zone = CAMERA_ZONES.get(person.last_camera_id, "unknown") if person.last_camera_id else None

    return JourneyResponse(
        person_id=person.id,
        display_id=person.display_id,
        journey=journey,
        total_duration=total_duration,
        total_seconds=total_seconds,
        zone_summary=zone_times,
        current_zone=current_zone,
        current_camera=person.last_camera_id,
        is_active=is_active
    )


@router.post("/persons/{person_id}/link-staff")
async def link_person_to_staff(
    person_id: int,
    staff_id: int,
    db: Session = Depends(get_db)
):
    """Link a tracked person to a staff member."""
    person = db.query(TrackedPerson).filter(TrackedPerson.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    staff = db.query(Staff).filter(Staff.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")

    person.staff_id = staff_id
    person.is_customer = False
    db.commit()

    return {"message": f"Person {person.display_id} linked to staff {staff.name}"}


@router.delete("/persons/{person_id}")
async def delete_person(
    person_id: int,
    db: Session = Depends(get_db)
):
    """Delete a tracked person and their embeddings."""
    person = db.query(TrackedPerson).filter(TrackedPerson.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    db.delete(person)
    db.commit()

    return {"message": f"Person {person.display_id} deleted"}


@router.post("/cleanup")
async def cleanup_inactive_persons(
    hours: int = 24,
    db: Session = Depends(get_db)
):
    """Clean up persons not seen in the specified hours."""
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    deleted = db.query(TrackedPerson).filter(
        TrackedPerson.last_seen < cutoff
    ).delete()
    db.commit()

    return {"message": f"Deleted {deleted} inactive persons"}


@router.post("/reset")
async def reset_all_tracking(
    db: Session = Depends(get_db)
):
    """Reset all tracking data - delete all tracked persons, embeddings, and sightings."""
    # Delete in correct order due to foreign keys
    sightings_deleted = db.query(PersonSighting).delete()
    embeddings_deleted = db.query(PersonEmbedding).delete()
    persons_deleted = db.query(TrackedPerson).delete()
    db.commit()

    return {
        "message": "All tracking data reset",
        "deleted": {
            "persons": persons_deleted,
            "embeddings": embeddings_deleted,
            "sightings": sightings_deleted
        }
    }


@router.get("/config", response_model=ConfigResponse)
async def get_config():
    """Get ReID configuration."""
    return ConfigResponse(
        similarity_threshold=SIMILARITY_THRESHOLD,
        max_embedding_age=MAX_EMBEDDING_AGE,
        embeddings_per_person=EMBEDDINGS_PER_PERSON,
        inactive_timeout=INACTIVE_TIMEOUT
    )


@router.put("/config", response_model=ConfigResponse)
async def update_config(config: ConfigUpdate):
    """Update ReID configuration."""
    global SIMILARITY_THRESHOLD, MAX_EMBEDDING_AGE, EMBEDDINGS_PER_PERSON, INACTIVE_TIMEOUT

    if config.similarity_threshold is not None:
        SIMILARITY_THRESHOLD = config.similarity_threshold
    if config.max_embedding_age is not None:
        MAX_EMBEDDING_AGE = config.max_embedding_age
    if config.embeddings_per_person is not None:
        EMBEDDINGS_PER_PERSON = config.embeddings_per_person
    if config.inactive_timeout is not None:
        INACTIVE_TIMEOUT = config.inactive_timeout

    return ConfigResponse(
        similarity_threshold=SIMILARITY_THRESHOLD,
        max_embedding_age=MAX_EMBEDDING_AGE,
        embeddings_per_person=EMBEDDINGS_PER_PERSON,
        inactive_timeout=INACTIVE_TIMEOUT
    )


# ============== New Endpoints for Enhanced Labeling ==============

@router.put("/persons/{person_id}", response_model=PersonResponse)
async def update_person(
    person_id: int,
    update: PersonUpdate,
    db: Session = Depends(get_db)
):
    """Update a tracked person's details."""
    person = db.query(TrackedPerson).filter(TrackedPerson.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    # Update fields if provided
    if update.name is not None:
        person.name = update.name
    if update.is_regular is not None:
        person.is_regular = update.is_regular
        if update.is_regular:
            person.person_type = "regular"
    if update.notes is not None:
        person.notes = update.notes
    if update.person_type is not None:
        person.person_type = update.person_type

    person.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(person)

    emb_count = db.query(PersonEmbedding).filter(
        PersonEmbedding.person_id == person.id
    ).count()

    cutoff = datetime.utcnow() - timedelta(seconds=INACTIVE_TIMEOUT)

    return PersonResponse(
        id=person.id,
        display_id=person.display_id,
        name=person.name,
        is_regular=person.is_regular or False,
        notes=person.notes,
        person_type=person.person_type or "visitor",
        first_seen=person.first_seen,
        last_seen=person.last_seen,
        first_camera_id=person.first_camera_id,
        last_camera_id=person.last_camera_id,
        is_customer=person.is_customer,
        is_staff=person.staff_id is not None,
        staff_name=person.staff.name if person.staff else None,
        visit_count=person.visit_count,
        is_active=person.is_active and person.last_seen >= cutoff,
        embedding_count=emb_count
    )


@router.post("/persons/{person_id}/label-regular")
async def label_as_regular(
    person_id: int,
    request: LabelAsRegularRequest,
    db: Session = Depends(get_db)
):
    """Label a tracked person as a regular customer with a name."""
    person = db.query(TrackedPerson).filter(TrackedPerson.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    person.name = request.name
    person.is_regular = True
    person.person_type = "regular"
    if request.notes:
        person.notes = request.notes
    person.updated_at = datetime.utcnow()
    db.commit()

    return {"message": f"Person {person.display_id} labeled as regular customer '{request.name}'"}


@router.get("/persons/{person_id}/detail", response_model=PersonDetailResponse)
async def get_person_detail(
    person_id: int,
    db: Session = Depends(get_db)
):
    """Get detailed information about a tracked person including embeddings and sightings."""
    person = db.query(TrackedPerson).filter(TrackedPerson.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    embeddings = db.query(PersonEmbedding).filter(
        PersonEmbedding.person_id == person_id
    ).order_by(desc(PersonEmbedding.created_at)).all()

    sightings = db.query(PersonSighting).filter(
        PersonSighting.person_id == person_id
    ).order_by(desc(PersonSighting.enter_time)).limit(100).all()

    cutoff = datetime.utcnow() - timedelta(seconds=INACTIVE_TIMEOUT)

    return PersonDetailResponse(
        id=person.id,
        display_id=person.display_id,
        name=person.name,
        is_regular=person.is_regular or False,
        notes=person.notes,
        person_type=person.person_type or "visitor",
        first_seen=person.first_seen,
        last_seen=person.last_seen,
        first_camera_id=person.first_camera_id,
        last_camera_id=person.last_camera_id,
        is_customer=person.is_customer,
        is_staff=person.staff_id is not None,
        staff_name=person.staff.name if person.staff else None,
        visit_count=person.visit_count,
        is_active=person.is_active and person.last_seen >= cutoff,
        embeddings=[EmbeddingResponse(
            id=e.id,
            camera_id=e.camera_id,
            confidence=e.confidence,
            is_verified=e.is_verified if hasattr(e, 'is_verified') else False,
            created_at=e.created_at
        ) for e in embeddings],
        sightings=[SightingResponse(
            id=s.id,
            camera_id=s.camera_id,
            zone_name=s.zone_name,
            enter_time=s.enter_time,
            exit_time=s.exit_time,
            confidence=s.confidence
        ) for s in sightings]
    )


@router.post("/merge")
async def merge_persons(
    request: MergeRequest,
    db: Session = Depends(get_db)
):
    """
    Merge two persons into one.

    All embeddings and sightings from merge_id are transferred to keep_id.
    The merge_id person is then deleted.
    """
    # Get both persons
    keep_person = db.query(TrackedPerson).filter(TrackedPerson.id == request.keep_id).first()
    merge_person = db.query(TrackedPerson).filter(TrackedPerson.id == request.merge_id).first()

    if not keep_person:
        raise HTTPException(status_code=404, detail=f"Person with ID {request.keep_id} not found")
    if not merge_person:
        raise HTTPException(status_code=404, detail=f"Person with ID {request.merge_id} not found")

    # Transfer embeddings
    embeddings_moved = db.query(PersonEmbedding).filter(
        PersonEmbedding.person_id == request.merge_id
    ).update({PersonEmbedding.person_id: request.keep_id})

    # Transfer sightings
    sightings_moved = db.query(PersonSighting).filter(
        PersonSighting.person_id == request.merge_id
    ).update({PersonSighting.person_id: request.keep_id})

    # Update keep_person's first_seen if merge_person was seen earlier
    if merge_person.first_seen and (not keep_person.first_seen or merge_person.first_seen < keep_person.first_seen):
        keep_person.first_seen = merge_person.first_seen
        keep_person.first_camera_id = merge_person.first_camera_id

    # Update visit count
    keep_person.visit_count = (keep_person.visit_count or 1) + (merge_person.visit_count or 1) - 1

    # Delete the merged person
    db.delete(merge_person)
    db.commit()

    return {
        "message": f"Merged {merge_person.display_id} into {keep_person.display_id}",
        "embeddings_moved": embeddings_moved,
        "sightings_moved": sightings_moved
    }


@router.post("/split")
async def split_person(
    request: SplitRequest,
    db: Session = Depends(get_db)
):
    """
    Split sightings/embeddings from a person into a new person.

    Creates a new person and moves specified sightings/embeddings to it.
    """
    # Get the source person
    person = db.query(TrackedPerson).filter(TrackedPerson.id == request.person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    # Create new person
    display_id = generate_display_id(db)
    new_person = TrackedPerson(
        display_id=display_id,
        is_customer=True,
        is_active=True,
        first_seen=datetime.utcnow(),
        last_seen=datetime.utcnow()
    )
    db.add(new_person)
    db.flush()  # Get the new ID

    embeddings_moved = 0
    sightings_moved = 0

    # Move specified embeddings
    if request.embedding_ids:
        embeddings_moved = db.query(PersonEmbedding).filter(
            PersonEmbedding.id.in_(request.embedding_ids),
            PersonEmbedding.person_id == request.person_id
        ).update({PersonEmbedding.person_id: new_person.id}, synchronize_session=False)

    # Move specified sightings
    if request.sighting_ids:
        # Get the sightings to update first_seen/last_seen
        sightings = db.query(PersonSighting).filter(
            PersonSighting.id.in_(request.sighting_ids),
            PersonSighting.person_id == request.person_id
        ).all()

        if sightings:
            # Update first/last seen based on moved sightings
            first_sighting = min(sightings, key=lambda s: s.enter_time)
            last_sighting = max(sightings, key=lambda s: s.enter_time)
            new_person.first_seen = first_sighting.enter_time
            new_person.last_seen = last_sighting.enter_time
            new_person.first_camera_id = first_sighting.camera_id
            new_person.last_camera_id = last_sighting.camera_id

        sightings_moved = db.query(PersonSighting).filter(
            PersonSighting.id.in_(request.sighting_ids),
            PersonSighting.person_id == request.person_id
        ).update({PersonSighting.person_id: new_person.id}, synchronize_session=False)

    db.commit()

    return {
        "message": f"Split from {person.display_id}, created {new_person.display_id}",
        "new_person_id": new_person.id,
        "new_display_id": new_person.display_id,
        "embeddings_moved": embeddings_moved,
        "sightings_moved": sightings_moved
    }


@router.post("/negative-pair")
async def create_negative_pair(
    request: NegativePairRequest,
    db: Session = Depends(get_db)
):
    """
    Mark two persons as NOT being the same person.

    This creates a negative pair that the ReID system will avoid matching in the future.
    """
    # Verify both persons exist
    person_a = db.query(TrackedPerson).filter(TrackedPerson.id == request.person_id_a).first()
    person_b = db.query(TrackedPerson).filter(TrackedPerson.id == request.person_id_b).first()

    if not person_a:
        raise HTTPException(status_code=404, detail=f"Person {request.person_id_a} not found")
    if not person_b:
        raise HTTPException(status_code=404, detail=f"Person {request.person_id_b} not found")

    # Check if pair already exists
    existing = db.query(NegativePair).filter(
        ((NegativePair.person_id_a == request.person_id_a) & (NegativePair.person_id_b == request.person_id_b)) |
        ((NegativePair.person_id_a == request.person_id_b) & (NegativePair.person_id_b == request.person_id_a))
    ).first()

    if existing:
        return {"message": "Negative pair already exists", "id": existing.id}

    # Create negative pair
    negative_pair = NegativePair(
        person_id_a=request.person_id_a,
        person_id_b=request.person_id_b,
        reason=request.reason
    )
    db.add(negative_pair)
    db.commit()

    return {
        "message": f"Created negative pair: {person_a.display_id} and {person_b.display_id} are NOT the same",
        "id": negative_pair.id
    }


@router.get("/negative-pairs")
async def list_negative_pairs(
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """List all negative pairs."""
    pairs = db.query(NegativePair).order_by(desc(NegativePair.created_at)).limit(limit).all()

    result = []
    for pair in pairs:
        result.append({
            "id": pair.id,
            "person_a": {
                "id": pair.person_a.id if pair.person_a else None,
                "display_id": pair.person_a.display_id if pair.person_a else None
            },
            "person_b": {
                "id": pair.person_b.id if pair.person_b else None,
                "display_id": pair.person_b.display_id if pair.person_b else None
            },
            "reason": pair.reason,
            "created_at": pair.created_at.isoformat() if pair.created_at else None
        })

    return {"pairs": result, "total": len(result)}


@router.delete("/negative-pairs/{pair_id}")
async def delete_negative_pair(
    pair_id: int,
    db: Session = Depends(get_db)
):
    """Delete a negative pair."""
    pair = db.query(NegativePair).filter(NegativePair.id == pair_id).first()
    if not pair:
        raise HTTPException(status_code=404, detail="Negative pair not found")

    db.delete(pair)
    db.commit()

    return {"message": "Negative pair deleted"}


@router.delete("/persons/{person_id}/embeddings/{embedding_id}")
async def delete_embedding(
    person_id: int,
    embedding_id: int,
    db: Session = Depends(get_db)
):
    """Delete a specific embedding from a person."""
    embedding = db.query(PersonEmbedding).filter(
        PersonEmbedding.id == embedding_id,
        PersonEmbedding.person_id == person_id
    ).first()

    if not embedding:
        raise HTTPException(status_code=404, detail="Embedding not found")

    db.delete(embedding)
    db.commit()

    return {"message": f"Embedding {embedding_id} deleted from person {person_id}"}


@router.post("/persons/{person_id}/embeddings/{embedding_id}/verify")
async def verify_embedding(
    person_id: int,
    embedding_id: int,
    db: Session = Depends(get_db)
):
    """Mark an embedding as verified (higher trust in matching)."""
    embedding = db.query(PersonEmbedding).filter(
        PersonEmbedding.id == embedding_id,
        PersonEmbedding.person_id == person_id
    ).first()

    if not embedding:
        raise HTTPException(status_code=404, detail="Embedding not found")

    embedding.is_verified = True
    db.commit()

    return {"message": f"Embedding {embedding_id} marked as verified"}


@router.get("/regulars")
async def list_regular_customers(
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """List all regular (named) customers."""
    regulars = db.query(TrackedPerson).filter(
        TrackedPerson.is_regular == True
    ).order_by(desc(TrackedPerson.last_seen)).limit(limit).all()

    cutoff = datetime.utcnow() - timedelta(seconds=INACTIVE_TIMEOUT)

    result = []
    for person in regulars:
        emb_count = db.query(PersonEmbedding).filter(
            PersonEmbedding.person_id == person.id
        ).count()

        result.append(PersonResponse(
            id=person.id,
            display_id=person.display_id,
            name=person.name,
            is_regular=True,
            notes=person.notes,
            person_type="regular",
            first_seen=person.first_seen,
            last_seen=person.last_seen,
            first_camera_id=person.first_camera_id,
            last_camera_id=person.last_camera_id,
            is_customer=person.is_customer,
            is_staff=person.staff_id is not None,
            staff_name=person.staff.name if person.staff else None,
            visit_count=person.visit_count,
            is_active=person.is_active and person.last_seen >= cutoff,
            embedding_count=emb_count
        ))

    return {"regulars": result, "total": len(result)}


# ============== Adaptive Threshold Stats ==============

class ThresholdStatsResponse(BaseModel):
    """Response for threshold stats."""
    current_hour: int
    current_occupancy: int
    time_period: str  # "peak", "off_peak", "normal"
    density_level: str  # "high", "low", "normal"
    camera_thresholds: dict  # camera_id -> {"same": float, "cross": float}
    base_config: dict  # Base configuration values
    negative_pairs_count: int


@router.get("/threshold/stats", response_model=ThresholdStatsResponse)
async def get_threshold_stats():
    """
    Get current adaptive threshold statistics.

    Returns current thresholds for each camera based on:
    - Camera trust level
    - Time of day (peak vs off-peak)
    - Current occupancy (density)
    """
    current_hour = datetime.now().hour
    occupancy = len(_active_tracks)

    # Determine time period
    time_config = ADAPTIVE_THRESHOLDS["time_of_day"]
    if current_hour in time_config["peak_hours"]:
        time_period = "peak"
    elif current_hour in time_config["off_peak_hours"]:
        time_period = "off_peak"
    else:
        time_period = "normal"

    # Determine density level
    density_config = ADAPTIVE_THRESHOLDS["density"]
    if occupancy > density_config["high_threshold"]:
        density_level = "high"
    elif occupancy < density_config["low_threshold"]:
        density_level = "low"
    else:
        density_level = "normal"

    # Get all camera thresholds
    camera_thresholds = get_all_adaptive_thresholds(current_hour, occupancy)

    return ThresholdStatsResponse(
        current_hour=current_hour,
        current_occupancy=occupancy,
        time_period=time_period,
        density_level=density_level,
        camera_thresholds=camera_thresholds,
        base_config={
            "camera_settings": ADAPTIVE_THRESHOLDS["camera"],
            "time_adjustments": {
                "peak": time_config["peak_adjustment"],
                "off_peak": time_config["off_peak_adjustment"],
            },
            "density_adjustments": {
                "high": density_config["high_adjustment"],
                "low": density_config["low_adjustment"],
            },
            "bounds": {
                "min": ADAPTIVE_THRESHOLDS["min_threshold"],
                "max": ADAPTIVE_THRESHOLDS["max_threshold"],
            }
        },
        negative_pairs_count=len(_negative_pairs_cache)
    )


@router.get("/threshold/camera/{camera_id}")
async def get_camera_threshold(camera_id: str, is_cross_camera: bool = False):
    """
    Get the current adaptive threshold for a specific camera.

    Args:
        camera_id: Camera identifier
        is_cross_camera: Whether this is for cross-camera matching
    """
    current_hour = datetime.now().hour
    occupancy = len(_active_tracks)

    threshold = get_adaptive_threshold(
        camera_id=camera_id,
        is_cross_camera=is_cross_camera,
        current_hour=current_hour,
        occupancy=occupancy
    )

    # Get base threshold for comparison
    camera_config = ADAPTIVE_THRESHOLDS["camera"].get(camera_id, {})
    base_threshold = camera_config.get("cross" if is_cross_camera else "same")

    return {
        "camera_id": camera_id,
        "is_cross_camera": is_cross_camera,
        "current_threshold": round(threshold, 3),
        "base_threshold": base_threshold,
        "adjustment": round(threshold - base_threshold, 3) if base_threshold else None,
        "current_hour": current_hour,
        "occupancy": occupancy,
    }


# ============== Transition Statistics ==============

class TransitionStatsResponse(BaseModel):
    """Response for transition statistics."""
    total_transitions: int
    unique_paths: int
    transitions: list
    adjacency_graph: dict
    configured_times: dict
    exit_boost_config: dict
    recent_exits_count: int


@router.get("/transitions/stats", response_model=TransitionStatsResponse)
async def get_transitions_stats():
    """
    Get statistics on observed camera transitions.

    Returns:
    - Observed transitions with counts and average times
    - Camera adjacency graph
    - Configured transition times
    - Exit boost configuration
    """
    stats = get_transition_stats()

    # Convert tuple keys to string for JSON serialization
    configured_times = {
        f"{k[0]} -> {k[1]}": v
        for k, v in CAMERA_TRANSITION_TIMES.items()
    }

    return TransitionStatsResponse(
        total_transitions=stats["total_transitions"],
        unique_paths=stats["unique_paths"],
        transitions=stats["transitions"],
        adjacency_graph=CAMERA_ADJACENCY,
        configured_times=configured_times,
        exit_boost_config=EXIT_BOOST_THRESHOLDS,
        recent_exits_count=len(_recent_exits),
    )


@router.get("/transitions/path/{from_camera}/{to_camera}")
async def get_transition_path_info(from_camera: str, to_camera: str):
    """
    Get information about a specific camera transition path.

    Returns adjacency status, configured transition time, and observed statistics.
    """
    is_adjacent = to_camera in CAMERA_ADJACENCY.get(from_camera, [])
    min_time = get_transition_time(from_camera, to_camera)

    # Get observed stats for this path
    key = (from_camera, to_camera)
    observed_count = _transition_counts.get(key, 0)

    return {
        "from_camera": from_camera,
        "to_camera": to_camera,
        "is_adjacent": is_adjacent,
        "min_transition_seconds": min_time,
        "observed_count": observed_count,
        "adjacency_from": CAMERA_ADJACENCY.get(from_camera, []),
        "adjacency_to": CAMERA_ADJACENCY.get(to_camera, []),
    }


@router.get("/handoff/recent")
async def get_recent_exits():
    """
    Get persons who recently exited cameras (candidates for cross-camera handoff).

    These are persons tracked by the exit boost system.
    """
    now = datetime.utcnow()
    recent = []

    for person_id, (exit_camera, exit_time) in _recent_exits.items():
        seconds_ago = (now - exit_time).total_seconds()
        adjacent_cameras = CAMERA_ADJACENCY.get(exit_camera, [])

        recent.append({
            "person_id": person_id,
            "exit_camera": exit_camera,
            "exit_time": exit_time.isoformat(),
            "seconds_ago": round(seconds_ago, 1),
            "adjacent_cameras": adjacent_cameras,
            "exit_boost_eligible": seconds_ago <= EXIT_BOOST_THRESHOLDS["lingering"]["seconds"],
        })

    # Sort by most recent
    recent.sort(key=lambda x: x["seconds_ago"])

    return {
        "recent_exits": recent,
        "total": len(recent),
        "boost_thresholds": EXIT_BOOST_THRESHOLDS,
    }
