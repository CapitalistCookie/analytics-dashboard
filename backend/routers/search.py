"""Search router for Frigate semantic search."""

import os
from datetime import datetime, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

FRIGATE_URL = os.getenv("FRIGATE_URL", "http://localhost:5000")

router = APIRouter(prefix="/api/search", tags=["search"])


class SearchResult(BaseModel):
    """Search result model."""
    id: str
    camera: str
    label: str
    start_time: float
    end_time: Optional[float] = None
    score: float
    thumbnail_url: str
    has_snapshot: bool
    has_clip: bool
    description: Optional[str] = None
    sub_label: Optional[str] = None


class SearchResponse(BaseModel):
    """Search response with pagination."""
    results: list[SearchResult]
    total: int
    page: int
    limit: int
    has_more: bool


@router.get("", response_model=SearchResponse)
async def search_events(
    query: str = Query(default="", description="Search query (semantic search)"),
    camera: Optional[str] = Query(default=None, description="Filter by camera ID"),
    label: str = Query(default="person", description="Filter by label (person, car, etc.)"),
    start_date: Optional[str] = Query(default=None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(default=None, description="End date (YYYY-MM-DD)"),
    min_score: float = Query(default=0.5, ge=0, le=1, description="Minimum confidence score"),
    has_snapshot: Optional[bool] = Query(default=None, description="Filter for events with snapshots"),
    has_clip: Optional[bool] = Query(default=None, description="Filter for events with clips"),
    page: int = Query(default=1, ge=1, description="Page number"),
    limit: int = Query(default=20, ge=1, le=100, description="Results per page")
):
    """
    Search events using Frigate's API.

    Supports semantic search when query is provided, otherwise returns filtered events.
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Build params for Frigate API
            params = {
                "limit": limit,
                "label": label,
            }

            # Calculate time range
            if start_date:
                try:
                    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
                    params["after"] = int(start_dt.timestamp())
                except ValueError:
                    raise HTTPException(status_code=400, detail="Invalid start_date format")

            if end_date:
                try:
                    end_dt = datetime.strptime(end_date, "%Y-%m-%d")
                    end_dt = end_dt.replace(hour=23, minute=59, second=59)
                    params["before"] = int(end_dt.timestamp())
                except ValueError:
                    raise HTTPException(status_code=400, detail="Invalid end_date format")

            if camera:
                params["camera"] = camera

            if min_score > 0:
                params["min_score"] = min_score

            if has_snapshot is not None:
                params["has_snapshot"] = 1 if has_snapshot else 0

            if has_clip is not None:
                params["has_clip"] = 1 if has_clip else 0

            # Use semantic search endpoint if query provided
            if query.strip():
                # Frigate's semantic search endpoint
                params["search_type"] = "description"
                params["query"] = query
                response = await client.get(
                    f"{FRIGATE_URL}/api/events/search",
                    params=params
                )
            else:
                # Regular events endpoint
                response = await client.get(
                    f"{FRIGATE_URL}/api/events",
                    params=params
                )

            response.raise_for_status()
            events = response.json()

            # Transform to search results
            results = []
            for event in events:
                # Calculate thumbnail URL
                thumbnail_url = f"{FRIGATE_URL}/api/events/{event['id']}/thumbnail.jpg"

                results.append(SearchResult(
                    id=event["id"],
                    camera=event.get("camera", "unknown"),
                    label=event.get("label", "unknown"),
                    start_time=event.get("start_time", 0),
                    end_time=event.get("end_time"),
                    score=event.get("data", {}).get("score", 0) if isinstance(event.get("data"), dict) else 0,
                    thumbnail_url=thumbnail_url,
                    has_snapshot=event.get("has_snapshot", False),
                    has_clip=event.get("has_clip", False),
                    description=event.get("data", {}).get("description") if isinstance(event.get("data"), dict) else None,
                    sub_label=event.get("sub_label")
                ))

            # Paginate results
            total = len(results)
            start_idx = (page - 1) * limit
            end_idx = start_idx + limit
            paginated = results[start_idx:end_idx]

            return SearchResponse(
                results=paginated,
                total=total,
                page=page,
                limit=limit,
                has_more=end_idx < total
            )

    except httpx.HTTPError as e:
        raise HTTPException(status_code=503, detail=f"Failed to connect to Frigate: {e}")


@router.get("/suggestions")
async def get_search_suggestions():
    """Get search suggestions based on recent events and common queries."""
    suggestions = [
        "person entering",
        "person leaving",
        "person at counter",
        "person at table",
        "person waiting",
        "person with bag",
        "group of people",
        "person standing",
        "person sitting",
        "person walking"
    ]

    return {"suggestions": suggestions}


@router.get("/cameras")
async def get_searchable_cameras():
    """Get list of cameras available for search filtering."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{FRIGATE_URL}/api/stats")
            response.raise_for_status()
            stats = response.json()

            cameras = [
                {"id": cam_id, "name": cam_id}
                for cam_id in stats.get("cameras", {}).keys()
            ]

            return {"cameras": cameras}
    except httpx.HTTPError as e:
        raise HTTPException(status_code=503, detail=f"Failed to connect to Frigate: {e}")


@router.get("/labels")
async def get_searchable_labels():
    """Get list of detectable object labels."""
    labels = [
        {"id": "person", "name": "Person"},
        {"id": "car", "name": "Car"},
        {"id": "dog", "name": "Dog"},
        {"id": "cat", "name": "Cat"},
        {"id": "face", "name": "Face"},
    ]

    return {"labels": labels}
