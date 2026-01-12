"""
ReID MQTT Worker - Processes Frigate detections and enriches with person IDs.

This worker subscribes to Frigate MQTT events, extracts appearance embeddings,
matches against known persons, and publishes enriched events.

Enhanced for cross-camera tracking with temporal logic and camera adjacency.
"""

import os
import json
import asyncio
import logging
import gc
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Tuple
from contextlib import asynccontextmanager

import httpx
import numpy as np

from database import SessionLocal
from models import TrackedPerson, PersonEmbedding, PersonSighting, Staff
from reid_service import get_reid_service

logger = logging.getLogger(__name__)

# Memory management constants - AGGRESSIVE to prevent leaks
MAX_ACTIVE_TRACKS = 50  # Maximum concurrent tracked persons
MAX_CANDIDATES_PER_CAMERA = 10  # Maximum pending candidates per camera
MAX_CANDIDATE_EMBEDDINGS = 3  # Maximum embeddings to store per candidate
MAX_COLOR_HISTOGRAMS = 100  # Maximum color histograms in memory
MAX_RECENT_EXITS = 25  # Maximum recent exits to track
CACHE_CLEANUP_INTERVAL = 30  # Seconds between cache cleanup (was 60)
CANDIDATE_EXPIRY_SECONDS = 120  # Candidates expire after 2 minutes (was 5)
DETECTION_COUNT_FOR_GC = 50  # Run garbage collection every N detections (was 100)
MAX_LAST_EMBEDDING_TIME = 50  # Maximum entries in _last_embedding_time
MAX_PERSON_LAST_CAMERA = 100  # Maximum entries in _person_last_camera

# Configuration
MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USER = os.getenv("MQTT_USER", "")
MQTT_PASS = os.getenv("MQTT_PASS", "")
FRIGATE_URL = os.getenv("FRIGATE_URL", "http://localhost:5000")

# ReID thresholds - strict to reduce over-matching
SIMILARITY_THRESHOLD = float(os.getenv("REID_SIMILARITY_THRESHOLD", "0.90"))  # Same camera threshold
CROSS_CAMERA_THRESHOLD = float(os.getenv("REID_CROSS_CAMERA_THRESHOLD", "0.85"))  # Cross camera threshold
MIN_MATCH_EMBEDDINGS = int(os.getenv("REID_MIN_MATCH_EMBEDDINGS", "2"))  # Require N embeddings to confirm match
EMBEDDINGS_PER_PERSON = int(os.getenv("REID_EMBEDDINGS_PER_PERSON", "5"))
MIN_DETECTION_AREA = int(os.getenv("REID_MIN_DETECTION_AREA", "5000"))  # Minimum detection area in pixels
MIN_DETECTION_CONFIDENCE = float(os.getenv("REID_MIN_DETECTION_CONFIDENCE", "0.75"))  # Minimum Frigate confidence

# Embedding quality gate - new embedding must be this similar to person's average
EMBEDDING_QUALITY_GATE = float(os.getenv("REID_EMBEDDING_QUALITY_GATE", "0.85"))

# Multi-frame verification - require N detections before confirming new person
MIN_DETECTIONS_FOR_CONFIRMATION = int(os.getenv("REID_MIN_DETECTIONS_CONFIRM", "3"))

# Temporal exclusion - can't be in two places within this many seconds
TEMPORAL_EXCLUSION_SECONDS = int(os.getenv("REID_TEMPORAL_EXCLUSION", "5"))

# Cross-camera tracking
MAX_HANDOFF_TIME = int(os.getenv("REID_MAX_HANDOFF_TIME", "120"))  # Max seconds between camera transitions
TEMPORAL_DECAY_FACTOR = float(os.getenv("REID_TEMPORAL_DECAY", "0.995"))  # Per-second decay for recency weighting
ADJACENCY_BOOST = float(os.getenv("REID_ADJACENCY_BOOST", "0.05"))  # Reduced similarity boost for adjacent cameras

# Color histogram matching threshold (0-1, higher = stricter)
COLOR_HISTOGRAM_THRESHOLD = float(os.getenv("REID_COLOR_THRESHOLD", "0.4"))  # Minimum color similarity

# Camera exclusions - these cameras don't extract embeddings (top-down views)
EXCLUDED_CAMERAS = {"cam_068", "cam_060"}

# Cameras that need rotation before embedding extraction
# Key: camera_id, Value: rotation degrees clockwise
ROTATED_CAMERAS = {
    "cam_040": 90  # Mounted sideways, rotate 90 degrees clockwise
}

# Camera trust levels
# High trust: can create new person IDs
# Medium trust: can only match to existing persons
# Excluded: no embedding extraction (top-down service cameras)
ENTRY_CAMERAS = {"cam_009"}  # Only these can create new person IDs
HIGH_TRUST_CAMERAS = {"cam_009", "cam_238", "cam_192"}  # Good angle for embeddings
MEDIUM_TRUST_CAMERAS = {"cam_108", "cam_179", "cam_028", "cam_054", "cam_040"}  # Match only, don't create

# Camera-to-zone mapping
CAMERA_ZONES: Dict[str, str] = {
    "cam_009": "entrance",
    "cam_054": "hallway",
    "cam_028": "seating_main",
    "cam_192": "seating_service",
    "cam_179": "service_area",
    "cam_040": "cashier",
    "cam_108": "kitchen",
    "cam_239": "kitchen_prep",
}

# Camera adjacency graph - defines which cameras can see handoffs
# Format: camera_id -> list of adjacent camera_ids (direction of travel)
CAMERA_ADJACENCY: Dict[str, List[str]] = {
    "cam_009": ["cam_054"],  # entrance -> hallway
    "cam_054": ["cam_009", "cam_028", "cam_192"],  # hallway connects to multiple
    "cam_028": ["cam_054", "cam_192", "cam_040"],  # seating_main
    "cam_192": ["cam_054", "cam_028", "cam_179"],  # seating_service
    "cam_179": ["cam_192", "cam_108"],  # service_area
    "cam_040": ["cam_028", "cam_054"],  # cashier
    "cam_108": ["cam_179", "cam_239"],  # kitchen
    "cam_239": ["cam_108"],  # kitchen_prep
}

# Tracking state
_active_tracks: Dict[str, int] = {}  # frigate_id -> person_id mapping
_last_embedding_time: Dict[int, datetime] = {}  # person_id -> timestamp
_person_last_camera: Dict[int, Tuple[str, datetime]] = {}  # person_id -> (camera_id, timestamp)
_recent_exits: Dict[int, Tuple[str, datetime]] = {}  # person_id -> (last_camera, exit_time)

# Multi-frame verification: candidates awaiting confirmation
# Structure: {camera_id: {frigate_id: {"embedding": np.array, "count": int, "first_seen": datetime, "color_hist": array}}}
_candidate_detections: Dict[str, Dict[str, dict]] = {}

# Person color histograms for matching
_person_color_histograms: Dict[int, np.ndarray] = {}  # person_id -> average color histogram

# Memory management state
_detection_count = 0
_last_cleanup_time = datetime.utcnow()


def get_memory_mb():
    """Get current process memory usage in MB."""
    try:
        import resource
        usage = resource.getrusage(resource.RUSAGE_SELF)
        return usage.ru_maxrss / 1024  # Convert KB to MB on Linux
    except Exception:
        return 0.0


def log_cache_sizes():
    """Log current cache sizes for debugging."""
    total_candidates = sum(len(v) for v in _candidate_detections.values())
    logger.info(
        f"[CACHE] tracks:{len(_active_tracks)} candidates:{total_candidates} "
        f"colors:{len(_person_color_histograms)} embed_time:{len(_last_embedding_time)} "
        f"last_cam:{len(_person_last_camera)} exits:{len(_recent_exits)}"
    )


def cleanup_stale_caches():
    """Clean up stale entries from all in-memory caches."""
    global _active_tracks, _last_embedding_time, _person_last_camera
    global _recent_exits, _candidate_detections, _person_color_histograms
    global _last_cleanup_time

    now = datetime.utcnow()
    cleaned = 0
    mem_before = get_memory_mb()

    # Clean _last_embedding_time - remove entries older than 30 minutes AND limit size
    cutoff = now - timedelta(minutes=30)
    stale_keys = [k for k, v in _last_embedding_time.items() if v < cutoff]
    for k in stale_keys:
        del _last_embedding_time[k]
        cleaned += 1

    # Hard limit on _last_embedding_time
    if len(_last_embedding_time) > MAX_LAST_EMBEDDING_TIME:
        sorted_items = sorted(_last_embedding_time.items(), key=lambda x: x[1], reverse=True)
        _last_embedding_time.clear()
        for k, v in sorted_items[:MAX_LAST_EMBEDDING_TIME]:
            _last_embedding_time[k] = v
        cleaned += len(sorted_items) - MAX_LAST_EMBEDDING_TIME

    # Clean _person_last_camera - remove entries older than 2 hours AND limit size
    cutoff = now - timedelta(hours=2)
    stale_keys = [k for k, (_, ts) in _person_last_camera.items() if ts < cutoff]
    for k in stale_keys:
        del _person_last_camera[k]
        cleaned += 1

    # Hard limit on _person_last_camera
    if len(_person_last_camera) > MAX_PERSON_LAST_CAMERA:
        sorted_items = sorted(_person_last_camera.items(), key=lambda x: x[1][1], reverse=True)
        _person_last_camera.clear()
        for k, v in sorted_items[:MAX_PERSON_LAST_CAMERA]:
            _person_last_camera[k] = v
        cleaned += len(sorted_items) - MAX_PERSON_LAST_CAMERA

    # Clean _recent_exits - remove entries older than 2 minutes AND limit size
    cutoff = now - timedelta(minutes=2)
    stale_keys = [k for k, (_, ts) in _recent_exits.items() if ts < cutoff]
    for k in stale_keys:
        del _recent_exits[k]
        cleaned += 1

    # Hard limit on _recent_exits
    if len(_recent_exits) > MAX_RECENT_EXITS:
        sorted_exits = sorted(_recent_exits.items(), key=lambda x: x[1][1], reverse=True)
        _recent_exits.clear()
        for k, v in sorted_exits[:MAX_RECENT_EXITS]:
            _recent_exits[k] = v
        cleaned += len(sorted_exits) - MAX_RECENT_EXITS

    # Clean _candidate_detections - remove expired candidates
    cutoff = now - timedelta(seconds=CANDIDATE_EXPIRY_SECONDS)
    for camera_id in list(_candidate_detections.keys()):
        candidates = _candidate_detections[camera_id]
        expired = [fid for fid, data in candidates.items()
                   if data.get("first_seen", now) < cutoff]
        for fid in expired:
            del candidates[fid]
            cleaned += 1

        # Hard limit candidates per camera
        if len(candidates) > MAX_CANDIDATES_PER_CAMERA:
            sorted_cands = sorted(candidates.items(),
                                  key=lambda x: x[1].get("first_seen", now),
                                  reverse=True)
            _candidate_detections[camera_id] = dict(sorted_cands[:MAX_CANDIDATES_PER_CAMERA])
            cleaned += len(sorted_cands) - MAX_CANDIDATES_PER_CAMERA

        # Clean up empty camera entries
        if not _candidate_detections[camera_id]:
            del _candidate_detections[camera_id]

    # Hard limit on _person_color_histograms
    if len(_person_color_histograms) > MAX_COLOR_HISTOGRAMS:
        # Keep histograms for most recently seen persons
        recent_persons = set()
        for person_id, (_, ts) in sorted(_person_last_camera.items(),
                                          key=lambda x: x[1][1], reverse=True)[:MAX_COLOR_HISTOGRAMS]:
            recent_persons.add(person_id)

        stale_keys = [k for k in _person_color_histograms.keys() if k not in recent_persons]
        for k in stale_keys[:len(_person_color_histograms) - MAX_COLOR_HISTOGRAMS]:
            del _person_color_histograms[k]
            cleaned += 1

    # Hard limit on _active_tracks
    if len(_active_tracks) > MAX_ACTIVE_TRACKS:
        excess = len(_active_tracks) - MAX_ACTIVE_TRACKS
        for key in list(_active_tracks.keys())[:excess]:
            del _active_tracks[key]
            cleaned += 1

    _last_cleanup_time = now

    # Force garbage collection
    gc.collect()

    mem_after = get_memory_mb()
    logger.info(f"[CLEANUP] Removed {cleaned} entries. Memory: {mem_before:.0f}MB -> {mem_after:.0f}MB")
    log_cache_sizes()

    return cleaned


class ReIDWorker:
    """Worker that processes Frigate events with ReID."""

    def __init__(self):
        self.reid_service = get_reid_service()
        self.http_client: Optional[httpx.AsyncClient] = None
        self.mqtt_client = None
        self._running = False
        self._cleanup_task = None
        self._recent_event_ids: set = set()  # Track recent events to skip duplicates

    async def start(self):
        """Start the ReID worker."""
        try:
            import aiomqtt
        except ImportError:
            logger.error("aiomqtt not installed. Run: pip install aiomqtt")
            return

        # Initialize ReID service
        await self.reid_service.initialize()
        logger.info("ReID service initialized")

        # Create HTTP client for Frigate API
        self.http_client = httpx.AsyncClient(timeout=10.0)
        self._running = True

        logger.info(f"Connecting to MQTT broker at {MQTT_HOST}:{MQTT_PORT}")

        try:
            async with aiomqtt.Client(
                hostname=MQTT_HOST,
                port=MQTT_PORT,
                username=MQTT_USER if MQTT_USER else None,
                password=MQTT_PASS if MQTT_PASS else None,
            ) as client:
                self.mqtt_client = client

                # Subscribe to Frigate events
                await client.subscribe("frigate/events")
                await client.subscribe("frigate/+/person")  # Per-camera person detections
                logger.info("Subscribed to Frigate MQTT topics")

                # Start periodic cleanup task
                self._cleanup_task = asyncio.create_task(self._periodic_cleanup())
                logger.info("Started periodic cleanup task")

                # Process messages
                async for message in client.messages:
                    if not self._running:
                        break
                    await self._process_message(message)

        except Exception as e:
            logger.error(f"MQTT connection error: {e}")
            raise
        finally:
            # Cancel cleanup task
            if self._cleanup_task:
                self._cleanup_task.cancel()
                try:
                    await self._cleanup_task
                except asyncio.CancelledError:
                    pass
            if self.http_client:
                await self.http_client.aclose()

    async def stop(self):
        """Stop the worker."""
        self._running = False

    async def _periodic_cleanup(self):
        """Background task that runs cleanup periodically."""
        logger.info("[CLEANUP] Periodic cleanup task started")
        while self._running:
            try:
                await asyncio.sleep(CACHE_CLEANUP_INTERVAL)
                if self._running:
                    cleanup_stale_caches()

                    # Also clean up recent event IDs to prevent growth
                    if len(self._recent_event_ids) > 200:
                        self._recent_event_ids = set(list(self._recent_event_ids)[-100:])

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[CLEANUP] Error in periodic cleanup: {e}")

        logger.info("[CLEANUP] Periodic cleanup task stopped")

    async def _process_message(self, message):
        """Process an MQTT message."""
        global _detection_count, _last_cleanup_time

        try:
            topic = str(message.topic)
            payload = message.payload.decode()

            if topic == "frigate/events":
                await self._process_event(json.loads(payload))

                # Increment detection count and perform periodic maintenance
                _detection_count += 1

                # Run garbage collection periodically
                if _detection_count % DETECTION_COUNT_FOR_GC == 0:
                    gc.collect()
                    logger.debug(f"Garbage collection triggered at detection {_detection_count}")

                # Run cache cleanup periodically
                now = datetime.utcnow()
                if (now - _last_cleanup_time).total_seconds() > CACHE_CLEANUP_INTERVAL:
                    cleanup_stale_caches()

            elif "/person" in topic:
                # Per-camera person detection (lightweight, for tracking)
                await self._process_detection(topic, payload)

        except Exception as e:
            logger.error(f"Error processing message: {e}")

    async def _process_event(self, event: dict):
        """Process a Frigate event."""
        event_type = event.get("type")
        before = event.get("before", {})
        after = event.get("after", {})

        # Only process person events
        if after.get("label") != "person":
            return

        frigate_id = after.get("id")
        camera_id = after.get("camera")

        # Skip duplicate events (same frigate_id + event_type combo)
        event_key = f"{frigate_id}:{event_type}"
        if event_type in ("new", "end"):  # Only dedupe new/end, allow updates
            if event_key in self._recent_event_ids:
                return  # Skip duplicate
            self._recent_event_ids.add(event_key)
        box = after.get("box", [])
        detection_score = after.get("score", 0)

        # Skip excluded cameras (top-down views - bad for ReID but still track zones)
        if camera_id in EXCLUDED_CAMERAS:
            logger.debug(f"Skipping ReID for excluded camera {camera_id}")
            return

        # Skip low confidence detections
        if detection_score < MIN_DETECTION_CONFIDENCE:
            logger.debug(f"Skipping low confidence detection: {detection_score:.2f} < {MIN_DETECTION_CONFIDENCE}")
            return

        # Calculate detection area
        if len(box) >= 4:
            width = box[2] - box[0]
            height = box[3] - box[1]
            area = width * height * 1920 * 1080  # Assuming 1080p
        else:
            area = 0

        # Skip small detections
        if area < MIN_DETECTION_AREA:
            logger.debug(f"Skipping small detection: {area} < {MIN_DETECTION_AREA}")
            return

        if event_type == "new":
            # New person detected - extract embedding and match
            await self._handle_new_detection(frigate_id, camera_id, after)
        elif event_type == "update":
            # Update tracking if we already have a match, or process candidate
            if frigate_id in _active_tracks:
                await self._update_tracking(frigate_id, camera_id, after)
            else:
                # Check if this is a candidate needing more frames
                await self._update_candidate(frigate_id, camera_id, after)
        elif event_type == "end":
            # Person left - clean up tracking
            await self._handle_end_detection(frigate_id, camera_id)

    async def _handle_new_detection(self, frigate_id: str, camera_id: str, data: dict):
        """Handle a new person detection with comprehensive matching and verification."""
        # Fetch thumbnail from Frigate
        thumbnail = await self._fetch_thumbnail(frigate_id)
        if thumbnail is None:
            logger.warning(f"Failed to fetch thumbnail for {frigate_id}")
            return

        # Rotate thumbnail if camera is mounted sideways (e.g., cam_040)
        thumbnail = self._rotate_thumbnail_if_needed(thumbnail, camera_id)

        # Extract embedding
        embedding = await self.reid_service.extract_features(thumbnail)
        if embedding is None:
            logger.warning(f"Failed to extract embedding for {frigate_id}")
            return

        # Extract color histogram for secondary verification
        color_hist = self._extract_color_histogram(thumbnail)

        # Match against known persons with cross-camera scoring
        db = SessionLocal()
        try:
            # Get embeddings with metadata for cross-camera scoring
            known_embeddings = self._get_known_embeddings_with_average(db, current_camera=camera_id)

            # Use enhanced matching with temporal exclusion and color check
            match_result = self._find_best_match_enhanced(
                embedding,
                color_hist,
                known_embeddings,
                current_camera=camera_id
            )

            zone_name = CAMERA_ZONES.get(camera_id, ",".join(data.get("current_zones", [])))
            is_cross_camera = False

            if match_result:
                person_id, similarity = match_result
                person = db.query(TrackedPerson).filter(TrackedPerson.id == person_id).first()
                if person:
                    # Check if this is a cross-camera handoff
                    prev_camera = person.last_camera_id
                    is_cross_camera = prev_camera and prev_camera != camera_id

                    if is_cross_camera:
                        logger.info(
                            f"Cross-camera handoff: {person.display_id} from {prev_camera} to {camera_id} "
                            f"(similarity: {similarity:.2f})"
                        )
                        # Record the handoff in recent exits
                        _recent_exits[person_id] = (prev_camera, person.last_seen)

                    # Update existing person
                    person.last_seen = datetime.utcnow()
                    person.last_camera_id = camera_id
                    person.is_active = True

                    # Track person's camera history with timestamp
                    _person_last_camera[person_id] = (camera_id, datetime.utcnow())

                    # Add embedding only if it passes quality gate
                    await self._maybe_add_embedding_with_quality_gate(db, person_id, embedding, camera_id)

                    # Update color histogram
                    self._update_person_color_histogram(person_id, color_hist)

                    # Record sighting with zone info
                    sighting = PersonSighting(
                        person_id=person_id,
                        camera_id=camera_id,
                        frigate_event_id=frigate_id,
                        zone_name=zone_name,
                        confidence=data.get("score", 1.0)
                    )
                    db.add(sighting)

                    _active_tracks[frigate_id] = person_id
                    logger.info(f"Matched {frigate_id} to person {person.display_id} (similarity: {similarity:.2f})")

                    # Publish enriched event
                    await self._publish_enriched_event(
                        camera_id, frigate_id, person, similarity, is_cross_camera
                    )

                    # Publish journey update
                    await self._publish_journey_update(db, person)
            else:
                # No match found - check if we can create a new person
                # Only entry cameras (cam_009) can create new person IDs
                if camera_id not in ENTRY_CAMERAS:
                    # Store as candidate for multi-frame verification
                    logger.info(f"No match on non-entry camera {camera_id} - storing as candidate")
                    self._store_candidate(camera_id, frigate_id, embedding, color_hist)
                    # Don't create new person, just skip
                else:
                    # Entry camera - use multi-frame verification
                    if self._should_create_person(camera_id, frigate_id, embedding, color_hist):
                        # Create new person after verification
                        person = await self._create_new_person(
                            db, embedding, camera_id, frigate_id, data, color_hist
                        )
                        _active_tracks[frigate_id] = person.id
                        _person_last_camera[person.id] = (camera_id, datetime.utcnow())
                        logger.info(f"Created new person {person.display_id} from {frigate_id} (entry camera)")

                        # Publish enriched event
                        await self._publish_enriched_event(
                            camera_id, frigate_id, person, 1.0, False
                        )

                        # Publish initial journey update
                        await self._publish_journey_update(db, person)
                    else:
                        # Not enough frames yet - store candidate
                        logger.debug(f"Candidate {frigate_id} needs more frames for verification")
                        self._store_candidate(camera_id, frigate_id, embedding, color_hist)

            db.commit()

        finally:
            db.close()

    async def _update_tracking(self, frigate_id: str, camera_id: str, data: dict):
        """Update tracking for an existing detection."""
        person_id = _active_tracks.get(frigate_id)
        if not person_id:
            return

        db = SessionLocal()
        try:
            person = db.query(TrackedPerson).filter(TrackedPerson.id == person_id).first()
            if person:
                person.last_seen = datetime.utcnow()
                person.last_camera_id = camera_id
                db.commit()
        finally:
            db.close()

    async def _handle_end_detection(self, frigate_id: str, camera_id: str):
        """Handle when a person leaves the frame."""
        person_id = _active_tracks.pop(frigate_id, None)
        if not person_id:
            return

        db = SessionLocal()
        try:
            # Update the last sighting with exit time
            sighting = db.query(PersonSighting).filter(
                PersonSighting.person_id == person_id,
                PersonSighting.frigate_event_id == frigate_id
            ).first()
            if sighting:
                sighting.exit_time = datetime.utcnow()

            # Check if person is still visible on any camera
            if person_id not in _active_tracks.values():
                person = db.query(TrackedPerson).filter(TrackedPerson.id == person_id).first()
                if person:
                    person.is_active = False

            db.commit()
            logger.info(f"Person {person_id} left camera {camera_id}")

        finally:
            db.close()

    async def _fetch_thumbnail(self, frigate_id: str) -> Optional[bytes]:
        """Fetch thumbnail from Frigate."""
        try:
            url = f"{FRIGATE_URL}/api/events/{frigate_id}/thumbnail.jpg"
            response = await self.http_client.get(url)
            if response.status_code == 200:
                return response.content
            return None
        except Exception as e:
            logger.error(f"Error fetching thumbnail: {e}")
            return None

    def _get_known_embeddings(self, db, current_camera: str = None) -> list:
        """
        Get embeddings for all recently active persons with metadata for scoring.

        Returns list of (person_id, embeddings, metadata) where metadata includes:
        - last_camera: last camera where person was seen
        - last_seen: timestamp of last sighting
        - is_adjacent: whether last camera is adjacent to current camera
        """
        cutoff = datetime.utcnow() - timedelta(hours=6)

        persons = db.query(TrackedPerson).filter(
            TrackedPerson.last_seen >= cutoff
        ).all()

        result = []
        for person in persons:
            embeddings = db.query(PersonEmbedding).filter(
                PersonEmbedding.person_id == person.id
            ).order_by(PersonEmbedding.created_at.desc()).limit(EMBEDDINGS_PER_PERSON).all()

            if embeddings:
                emb_arrays = [
                    np.frombuffer(e.embedding, dtype=np.float32)
                    for e in embeddings
                ]

                # Build metadata for temporal and adjacency scoring
                metadata = {
                    "last_camera": person.last_camera_id,
                    "last_seen": person.last_seen,
                    "is_adjacent": self._cameras_adjacent(person.last_camera_id, current_camera),
                    "is_same_camera": person.last_camera_id == current_camera,
                }

                result.append((person.id, emb_arrays, metadata))

        return result

    def _cameras_adjacent(self, cam1: str, cam2: str) -> bool:
        """Check if two cameras are adjacent in the adjacency graph."""
        if not cam1 or not cam2:
            return False
        adjacent_to_1 = CAMERA_ADJACENCY.get(cam1, [])
        return cam2 in adjacent_to_1

    def _compute_temporal_weight(self, last_seen: datetime) -> float:
        """
        Compute temporal weight based on recency.
        More recent sightings get higher weight.
        """
        if not last_seen:
            return 1.0

        seconds_ago = (datetime.utcnow() - last_seen).total_seconds()
        if seconds_ago < 0:
            seconds_ago = 0

        # Exponential decay - recent detections weighted higher
        weight = TEMPORAL_DECAY_FACTOR ** seconds_ago

        # Clamp to reasonable range
        return max(0.5, min(1.0, weight))

    def _find_best_match_cross_camera(
        self,
        embedding: np.ndarray,
        known_embeddings: list,
        current_camera: str
    ) -> Optional[Tuple[int, float]]:
        """
        Find best match with cross-camera scoring.

        Applies:
        - Base similarity from embedding comparison
        - Temporal weighting (recent detections weighted higher)
        - Adjacency boost (adjacent cameras get similarity boost)
        - Minimum embedding confirmation (require multiple embeddings to exceed threshold)
        - Lower threshold for cross-camera matches
        """
        if not known_embeddings:
            return None

        best_match = None
        best_score = 0.0
        debug_scores = []  # For logging

        for person_id, emb_arrays, metadata in known_embeddings:
            num_embeddings = len(emb_arrays)

            # Compute similarity against each embedding individually
            embedding_norm = embedding / (np.linalg.norm(embedding) + 1e-8)
            individual_similarities = []

            for emb in emb_arrays:
                emb_norm = emb / (np.linalg.norm(emb) + 1e-8)
                sim = float(np.dot(embedding_norm, emb_norm))
                individual_similarities.append(sim)

            # Use average similarity
            base_similarity = np.mean(individual_similarities)
            max_similarity = max(individual_similarities)
            min_similarity = min(individual_similarities)

            # Apply temporal weight
            temporal_weight = self._compute_temporal_weight(metadata.get("last_seen"))

            # Apply adjacency boost
            adjacency_boost = 0.0
            if metadata.get("is_adjacent"):
                adjacency_boost = ADJACENCY_BOOST

            # Compute final score
            adjusted_score = base_similarity * temporal_weight + adjacency_boost

            # Determine threshold based on camera relationship
            if metadata.get("is_same_camera"):
                threshold = SIMILARITY_THRESHOLD
            else:
                threshold = CROSS_CAMERA_THRESHOLD

            # Count how many embeddings exceed threshold
            embeddings_above_threshold = sum(1 for s in individual_similarities if s >= threshold)

            # Log for debugging
            debug_scores.append({
                "person_id": person_id,
                "num_embeddings": num_embeddings,
                "avg_sim": round(base_similarity, 3),
                "max_sim": round(max_similarity, 3),
                "min_sim": round(min_similarity, 3),
                "adjusted": round(adjusted_score, 3),
                "threshold": threshold,
                "above_threshold": embeddings_above_threshold,
                "is_same_cam": metadata.get("is_same_camera", False)
            })

            # MINIMUM MATCH CONFIRMATION:
            # For first-time matches (person has few embeddings), be more strict
            # For established persons (multiple embeddings), require multiple to match
            min_required = MIN_MATCH_EMBEDDINGS if num_embeddings >= MIN_MATCH_EMBEDDINGS else 1

            # Check if enough embeddings exceed threshold AND adjusted score is high
            meets_confirmation = embeddings_above_threshold >= min_required

            if adjusted_score > threshold and meets_confirmation and adjusted_score > best_score:
                best_score = adjusted_score
                best_match = (person_id, base_similarity)  # Return base similarity for logging

        # Log similarity scores for debugging
        if debug_scores:
            logger.debug(f"ReID match scores for camera {current_camera}: {debug_scores}")
            # Also log at INFO level if we have a potential match
            if best_match:
                logger.info(
                    f"ReID match: person_id={best_match[0]}, similarity={best_match[1]:.3f}, "
                    f"adjusted_score={best_score:.3f}, threshold used"
                )
            else:
                # Log top candidates that didn't match for debugging
                top_candidates = sorted(debug_scores, key=lambda x: x['adjusted'], reverse=True)[:3]
                logger.info(f"ReID no match on {current_camera}. Top candidates: {top_candidates}")

        return best_match

    async def _maybe_add_embedding(self, db, person_id: int, embedding: np.ndarray, camera_id: str):
        """Add new embedding if enough time has passed."""
        from datetime import timedelta

        last_time = _last_embedding_time.get(person_id)
        now = datetime.utcnow()

        # Only add new embedding every 60 seconds
        if last_time and (now - last_time).total_seconds() < 60:
            return

        # Check current embedding count
        count = db.query(PersonEmbedding).filter(
            PersonEmbedding.person_id == person_id
        ).count()

        if count >= EMBEDDINGS_PER_PERSON:
            # Delete oldest embedding
            oldest = db.query(PersonEmbedding).filter(
                PersonEmbedding.person_id == person_id
            ).order_by(PersonEmbedding.created_at).first()
            if oldest:
                db.delete(oldest)

        # Add new embedding
        new_emb = PersonEmbedding(
            person_id=person_id,
            embedding=embedding.astype(np.float32).tobytes(),
            camera_id=camera_id
        )
        db.add(new_emb)
        _last_embedding_time[person_id] = now

    async def _create_new_person(self, db, embedding: np.ndarray, camera_id: str,
                                  frigate_id: str, data: dict,
                                  color_hist: np.ndarray = None) -> TrackedPerson:
        """Create a new tracked person with color histogram."""
        import string

        # Generate display ID
        last_person = db.query(TrackedPerson).order_by(TrackedPerson.id.desc()).first()
        if last_person:
            last_id = last_person.display_id
            letter = last_id[0]
            number = int(last_id[1:]) if len(last_id) > 1 else 0
            number += 1
            if number > 99:
                letter_idx = string.ascii_uppercase.index(letter)
                letter = string.ascii_uppercase[(letter_idx + 1) % 26]
                number = 1
            display_id = f"{letter}{number}"
        else:
            display_id = "A1"

        # Create person
        person = TrackedPerson(
            display_id=display_id,
            first_camera_id=camera_id,
            last_camera_id=camera_id,
            first_seen=datetime.utcnow(),
            last_seen=datetime.utcnow(),
            is_customer=True,
            is_active=True
        )
        db.add(person)
        db.flush()

        # Add embedding
        new_emb = PersonEmbedding(
            person_id=person.id,
            embedding=embedding.astype(np.float32).tobytes(),
            camera_id=camera_id
        )
        db.add(new_emb)

        # Get zone name from mapping or fallback to Frigate zones
        zone_name = CAMERA_ZONES.get(camera_id, ",".join(data.get("current_zones", [])))

        # Add sighting
        sighting = PersonSighting(
            person_id=person.id,
            camera_id=camera_id,
            frigate_event_id=frigate_id,
            zone_name=zone_name,
            confidence=data.get("score", 1.0)
        )
        db.add(sighting)

        _last_embedding_time[person.id] = datetime.utcnow()

        # Store color histogram for this person
        if color_hist is not None:
            _person_color_histograms[person.id] = color_hist

        return person

    async def _publish_enriched_event(self, camera_id: str, frigate_id: str,
                                       person: TrackedPerson, similarity: float,
                                       is_cross_camera: bool = False):
        """Publish enriched event with person info."""
        if not self.mqtt_client:
            return

        is_staff = person.staff_id is not None
        staff_name = None
        if is_staff:
            db = SessionLocal()
            try:
                staff = db.query(Staff).filter(Staff.id == person.staff_id).first()
                if staff:
                    staff_name = staff.name
            finally:
                db.close()

        zone_name = CAMERA_ZONES.get(camera_id, "unknown")

        enriched = {
            "camera_id": camera_id,
            "frigate_id": frigate_id,
            "person_id": person.id,
            "display_id": person.display_id,
            "is_staff": is_staff,
            "staff_name": staff_name,
            "similarity": similarity,
            "zone": zone_name,
            "is_cross_camera": is_cross_camera,
            "timestamp": datetime.utcnow().isoformat() + "Z"  # Append Z to indicate UTC
        }

        try:
            await self.mqtt_client.publish(
                f"analytics/reid/{camera_id}",
                json.dumps(enriched)
            )
        except Exception as e:
            logger.error(f"Error publishing enriched event: {e}")

    async def _publish_journey_update(self, db, person: TrackedPerson):
        """Publish journey update for a person via MQTT."""
        if not self.mqtt_client:
            return

        try:
            # Get recent sightings for journey
            sightings = db.query(PersonSighting).filter(
                PersonSighting.person_id == person.id
            ).order_by(PersonSighting.enter_time.desc()).limit(20).all()

            # Build journey summary
            journey = []
            seen_cameras = set()

            for sighting in reversed(sightings):
                # Group consecutive sightings on same camera
                if sighting.camera_id in seen_cameras and journey:
                    # Update exit time of previous entry
                    if journey[-1]["camera"] == sighting.camera_id:
                        if sighting.exit_time:
                            journey[-1]["exit"] = sighting.exit_time.isoformat() + "Z"
                        continue

                zone = CAMERA_ZONES.get(sighting.camera_id, "unknown")
                journey.append({
                    "camera": sighting.camera_id,
                    "zone": zone,
                    "enter": sighting.enter_time.isoformat() + "Z",
                    "exit": sighting.exit_time.isoformat() + "Z" if sighting.exit_time else None
                })
                seen_cameras.add(sighting.camera_id)

            # Calculate total duration
            if person.first_seen:
                total_seconds = (datetime.utcnow() - person.first_seen).total_seconds()
                minutes = int(total_seconds // 60)
                seconds = int(total_seconds % 60)
                total_duration = f"{minutes}m {seconds}s"
            else:
                total_duration = "0m 0s"

            # Get current zone
            current_zone = CAMERA_ZONES.get(person.last_camera_id, "unknown")

            journey_update = {
                "person_id": person.id,
                "display_id": person.display_id,
                "current_camera": person.last_camera_id,
                "current_zone": current_zone,
                "is_staff": person.staff_id is not None,
                "journey": journey[-10:],  # Last 10 transitions
                "total_duration": total_duration,
                "first_seen": person.first_seen.isoformat() + "Z" if person.first_seen else None,
                "last_seen": person.last_seen.isoformat() + "Z" if person.last_seen else None,
                "timestamp": datetime.utcnow().isoformat() + "Z"  # Append Z to indicate UTC
            }

            await self.mqtt_client.publish(
                f"analytics/journey/{person.display_id}",
                json.dumps(journey_update)
            )
        except Exception as e:
            logger.error(f"Error publishing journey update: {e}")

    # ===== NEW COMPREHENSIVE REID METHODS =====

    def _rotate_thumbnail_if_needed(self, image_bytes: bytes, camera_id: str) -> bytes:
        """Rotate thumbnail for cameras that are mounted sideways."""
        if camera_id not in ROTATED_CAMERAS:
            return image_bytes

        img = None
        img_out = None
        buffer = None
        input_buffer = None

        try:
            import cv2
            from PIL import Image
            import io

            # Load image
            input_buffer = io.BytesIO(image_bytes)
            img = Image.open(input_buffer)
            img_array = np.array(img)

            # Convert RGB to BGR for cv2
            if len(img_array.shape) == 3 and img_array.shape[2] == 3:
                img_array = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)

            # Get rotation angle
            rotation = ROTATED_CAMERAS[camera_id]

            # Rotate using cv2 (fast, pure numpy operations)
            if rotation == 90:
                rotated = cv2.rotate(img_array, cv2.ROTATE_90_CLOCKWISE)
            elif rotation == 180:
                rotated = cv2.rotate(img_array, cv2.ROTATE_180)
            elif rotation == 270:
                rotated = cv2.rotate(img_array, cv2.ROTATE_90_COUNTERCLOCKWISE)
            else:
                logger.warning(f"Unsupported rotation angle {rotation} for {camera_id}")
                return image_bytes

            # Convert back to RGB for PIL
            rotated = cv2.cvtColor(rotated, cv2.COLOR_BGR2RGB)

            # Convert back to JPEG bytes
            img_out = Image.fromarray(rotated)
            buffer = io.BytesIO()
            img_out.save(buffer, format='JPEG', quality=95)
            buffer.seek(0)
            result = buffer.read()

            # Clean up arrays
            del img_array
            del rotated

            logger.debug(f"Rotated thumbnail for {camera_id} by {rotation} degrees")
            return result

        except Exception as e:
            logger.error(f"Failed to rotate thumbnail for {camera_id}: {e}")
            return image_bytes
        finally:
            # Explicitly close all PIL images and buffers
            if img is not None:
                try:
                    img.close()
                except Exception:
                    pass
            if img_out is not None:
                try:
                    img_out.close()
                except Exception:
                    pass
            if buffer is not None:
                try:
                    buffer.close()
                except Exception:
                    pass
            if input_buffer is not None:
                try:
                    input_buffer.close()
                except Exception:
                    pass

    def _extract_color_histogram(self, image_bytes: bytes) -> Optional[np.ndarray]:
        """Extract color histogram from image for clothing color verification."""
        img = None
        input_buffer = None

        try:
            from PIL import Image
            import io

            # Load image
            input_buffer = io.BytesIO(image_bytes)
            img = Image.open(input_buffer).convert('RGB')
            img_array = np.array(img)

            # Focus on middle portion (likely clothing, not background)
            h, w = img_array.shape[:2]
            middle = img_array[h//4:3*h//4, w//4:3*w//4]

            # Calculate color histogram (RGB, 8 bins each)
            hist_r = np.histogram(middle[:, :, 0], bins=8, range=(0, 256))[0]
            hist_g = np.histogram(middle[:, :, 1], bins=8, range=(0, 256))[0]
            hist_b = np.histogram(middle[:, :, 2], bins=8, range=(0, 256))[0]

            # Combine and normalize
            hist = np.concatenate([hist_r, hist_g, hist_b]).astype(float)
            hist = hist / (np.sum(hist) + 1e-8)

            # Clean up arrays
            del img_array
            del middle

            return hist
        except Exception as e:
            logger.debug(f"Failed to extract color histogram: {e}")
            return None
        finally:
            # Explicitly close PIL image and buffer
            if img is not None:
                try:
                    img.close()
                except Exception:
                    pass
            if input_buffer is not None:
                try:
                    input_buffer.close()
                except Exception:
                    pass

    def _compare_color_histograms(self, hist1: np.ndarray, hist2: np.ndarray) -> float:
        """Compare two color histograms using histogram intersection."""
        if hist1 is None or hist2 is None:
            return 1.0  # Skip check if either histogram is missing
        return float(np.sum(np.minimum(hist1, hist2)))

    def _get_known_embeddings_with_average(self, db, current_camera: str = None) -> list:
        """
        Get embeddings for all recently active persons with AVERAGE embedding for matching.

        Returns list of (person_id, avg_embedding, embeddings, metadata) where:
        - avg_embedding: mean of all embeddings for this person
        - embeddings: individual embeddings for confirmation check
        - metadata: includes camera/temporal info
        """
        cutoff = datetime.utcnow() - timedelta(hours=6)

        persons = db.query(TrackedPerson).filter(
            TrackedPerson.last_seen >= cutoff
        ).all()

        result = []
        for person in persons:
            embeddings = db.query(PersonEmbedding).filter(
                PersonEmbedding.person_id == person.id
            ).order_by(PersonEmbedding.created_at.desc()).limit(EMBEDDINGS_PER_PERSON).all()

            if embeddings:
                emb_arrays = [
                    np.frombuffer(e.embedding, dtype=np.float32)
                    for e in embeddings
                ]

                # Calculate AVERAGE embedding for this person
                avg_embedding = np.mean(emb_arrays, axis=0)
                avg_embedding = avg_embedding / (np.linalg.norm(avg_embedding) + 1e-8)

                # Get color histogram for this person
                color_hist = _person_color_histograms.get(person.id)

                # Build metadata for temporal and adjacency scoring
                metadata = {
                    "last_camera": person.last_camera_id,
                    "last_seen": person.last_seen,
                    "is_adjacent": self._cameras_adjacent(person.last_camera_id, current_camera),
                    "is_same_camera": person.last_camera_id == current_camera,
                    "display_id": person.display_id,
                    "color_hist": color_hist,
                }

                result.append((person.id, avg_embedding, emb_arrays, metadata))

        return result

    def _find_best_match_enhanced(
        self,
        embedding: np.ndarray,
        color_hist: Optional[np.ndarray],
        known_embeddings: list,
        current_camera: str
    ) -> Optional[Tuple[int, float]]:
        """
        Enhanced matching with:
        - Average embedding comparison (not individual)
        - Temporal exclusion (can't be two places at once)
        - Color histogram sanity check
        - Stricter thresholds
        """
        if not known_embeddings:
            return None

        best_match = None
        best_score = 0.0
        debug_scores = []

        embedding_norm = embedding / (np.linalg.norm(embedding) + 1e-8)
        now = datetime.utcnow()

        for person_id, avg_embedding, emb_arrays, metadata in known_embeddings:
            # TEMPORAL EXCLUSION: Check if this person was just seen on a different camera
            # If so, they can't physically be here too (within TEMPORAL_EXCLUSION_SECONDS)
            last_camera = metadata.get("last_camera")
            last_seen = metadata.get("last_seen")

            if last_camera and last_camera != current_camera and last_seen:
                seconds_since_last = (now - last_seen).total_seconds()
                if seconds_since_last < TEMPORAL_EXCLUSION_SECONDS:
                    logger.debug(
                        f"Temporal exclusion: {metadata.get('display_id')} seen on {last_camera} "
                        f"{seconds_since_last:.1f}s ago - can't be on {current_camera}"
                    )
                    continue  # Skip this person - physically impossible

            # COLOR HISTOGRAM CHECK: Quick sanity check before expensive embedding comparison
            person_color_hist = metadata.get("color_hist")
            if color_hist is not None and person_color_hist is not None:
                color_similarity = self._compare_color_histograms(color_hist, person_color_hist)
                if color_similarity < COLOR_HISTOGRAM_THRESHOLD:
                    logger.debug(
                        f"Color mismatch for {metadata.get('display_id')}: {color_similarity:.2f} < {COLOR_HISTOGRAM_THRESHOLD}"
                    )
                    continue  # Skip - clothing color too different

            # AVERAGE EMBEDDING MATCH: Compare against average, not individuals
            similarity = float(np.dot(embedding_norm, avg_embedding))

            # Also check individual embeddings for confirmation
            individual_sims = []
            for emb in emb_arrays:
                emb_norm = emb / (np.linalg.norm(emb) + 1e-8)
                individual_sims.append(float(np.dot(embedding_norm, emb_norm)))

            # Apply temporal weight (more recent = higher weight)
            temporal_weight = self._compute_temporal_weight(last_seen)

            # Apply small adjacency boost
            adjacency_boost = ADJACENCY_BOOST if metadata.get("is_adjacent") else 0.0

            # Compute final score
            adjusted_score = similarity * temporal_weight + adjacency_boost

            # Determine threshold based on camera relationship
            if metadata.get("is_same_camera"):
                threshold = SIMILARITY_THRESHOLD
            else:
                threshold = CROSS_CAMERA_THRESHOLD

            # Count embeddings above threshold for confirmation
            embeddings_above = sum(1 for s in individual_sims if s >= threshold)
            num_embeddings = len(emb_arrays)
            min_required = MIN_MATCH_EMBEDDINGS if num_embeddings >= MIN_MATCH_EMBEDDINGS else 1
            meets_confirmation = embeddings_above >= min_required

            debug_scores.append({
                "person_id": person_id,
                "display_id": metadata.get("display_id"),
                "avg_sim": round(similarity, 3),
                "adjusted": round(adjusted_score, 3),
                "threshold": threshold,
                "above_threshold": embeddings_above,
                "meets_confirm": meets_confirmation,
                "is_same_cam": metadata.get("is_same_camera", False)
            })

            # Must exceed threshold AND meet confirmation
            if adjusted_score >= threshold and meets_confirmation and adjusted_score > best_score:
                best_score = adjusted_score
                best_match = (person_id, similarity)

        # Logging
        if debug_scores:
            logger.debug(f"Enhanced ReID scores for {current_camera}: {debug_scores}")
            if best_match:
                logger.info(
                    f"ReID match: person_id={best_match[0]}, similarity={best_match[1]:.3f}, "
                    f"adjusted={best_score:.3f}"
                )
            else:
                top = sorted(debug_scores, key=lambda x: x['adjusted'], reverse=True)[:3]
                logger.info(f"ReID no match on {current_camera}. Top candidates: {top}")

        return best_match

    async def _maybe_add_embedding_with_quality_gate(
        self, db, person_id: int, embedding: np.ndarray, camera_id: str
    ):
        """Add new embedding only if it passes quality gate (similar to existing average)."""
        last_time = _last_embedding_time.get(person_id)
        now = datetime.utcnow()

        # Only add new embedding every 60 seconds
        if last_time and (now - last_time).total_seconds() < 60:
            return

        # Get existing embeddings to calculate average
        existing = db.query(PersonEmbedding).filter(
            PersonEmbedding.person_id == person_id
        ).all()

        if existing:
            # Calculate current average
            emb_arrays = [np.frombuffer(e.embedding, dtype=np.float32) for e in existing]
            avg_embedding = np.mean(emb_arrays, axis=0)
            avg_embedding = avg_embedding / (np.linalg.norm(avg_embedding) + 1e-8)

            # Check similarity of new embedding to average
            new_norm = embedding / (np.linalg.norm(embedding) + 1e-8)
            similarity = float(np.dot(new_norm, avg_embedding))

            # QUALITY GATE: Only add if similar enough to existing identity
            if similarity < EMBEDDING_QUALITY_GATE:
                logger.debug(
                    f"Embedding quality gate failed for person {person_id}: "
                    f"{similarity:.3f} < {EMBEDDING_QUALITY_GATE}"
                )
                return

        # Check current embedding count
        count = len(existing) if existing else 0

        if count >= EMBEDDINGS_PER_PERSON:
            # Delete oldest embedding
            oldest = db.query(PersonEmbedding).filter(
                PersonEmbedding.person_id == person_id
            ).order_by(PersonEmbedding.created_at).first()
            if oldest:
                db.delete(oldest)

        # Add new embedding
        new_emb = PersonEmbedding(
            person_id=person_id,
            embedding=embedding.astype(np.float32).tobytes(),
            camera_id=camera_id
        )
        db.add(new_emb)
        _last_embedding_time[person_id] = now
        logger.debug(f"Added quality-gated embedding for person {person_id}")

    def _update_person_color_histogram(self, person_id: int, new_hist: np.ndarray):
        """Update person's average color histogram."""
        if new_hist is None:
            return

        existing = _person_color_histograms.get(person_id)
        if existing is not None:
            # Running average
            _person_color_histograms[person_id] = 0.8 * existing + 0.2 * new_hist
        else:
            _person_color_histograms[person_id] = new_hist

    def _store_candidate(
        self, camera_id: str, frigate_id: str, embedding: np.ndarray, color_hist: np.ndarray
    ):
        """Store a candidate detection for multi-frame verification."""
        if camera_id not in _candidate_detections:
            _candidate_detections[camera_id] = {}

        if frigate_id not in _candidate_detections[camera_id]:
            _candidate_detections[camera_id][frigate_id] = {
                "embedding": embedding,
                "color_hist": color_hist,
                "count": 1,
                "first_seen": datetime.utcnow(),
                "embeddings": [embedding],
            }
        else:
            cand = _candidate_detections[camera_id][frigate_id]
            cand["count"] += 1
            # Limit embeddings list to prevent memory growth
            if len(cand["embeddings"]) < MAX_CANDIDATE_EMBEDDINGS:
                cand["embeddings"].append(embedding)
            else:
                # Replace oldest embedding (keep most recent N)
                cand["embeddings"] = cand["embeddings"][1:] + [embedding]
            # Update to latest embedding
            cand["embedding"] = embedding
            if color_hist is not None:
                cand["color_hist"] = color_hist

    def _should_create_person(
        self, camera_id: str, frigate_id: str, embedding: np.ndarray, color_hist: np.ndarray
    ) -> bool:
        """
        Check if we should create a new person based on multi-frame verification.

        Requires MIN_DETECTIONS_FOR_CONFIRMATION consistent detections.
        """
        if camera_id not in _candidate_detections:
            _candidate_detections[camera_id] = {}

        if frigate_id not in _candidate_detections[camera_id]:
            # First detection - store as candidate
            self._store_candidate(camera_id, frigate_id, embedding, color_hist)
            return False

        cand = _candidate_detections[camera_id][frigate_id]
        cand["count"] += 1
        cand["embeddings"].append(embedding)

        # Check if we have enough consistent detections
        if cand["count"] < MIN_DETECTIONS_FOR_CONFIRMATION:
            return False

        # Verify consistency: embeddings should be similar to each other
        if len(cand["embeddings"]) >= 2:
            embeddings = cand["embeddings"]
            # Check that recent embeddings are consistent
            recent = embeddings[-MIN_DETECTIONS_FOR_CONFIRMATION:]
            avg = np.mean(recent, axis=0)
            avg = avg / (np.linalg.norm(avg) + 1e-8)

            for emb in recent:
                emb_norm = emb / (np.linalg.norm(emb) + 1e-8)
                sim = float(np.dot(emb_norm, avg))
                if sim < 0.80:  # Embeddings should be consistent
                    logger.debug(f"Candidate {frigate_id} has inconsistent embeddings: {sim:.2f}")
                    return False

        # Verified - clean up candidate
        del _candidate_detections[camera_id][frigate_id]
        logger.info(f"Candidate {frigate_id} verified after {cand['count']} frames")
        return True

    async def _update_candidate(self, frigate_id: str, camera_id: str, data: dict):
        """Update candidate tracking on update events."""
        # Check if this frigate_id is in candidates
        if camera_id not in _candidate_detections:
            return
        if frigate_id not in _candidate_detections[camera_id]:
            return

        # Fetch new thumbnail and embedding
        thumbnail = await self._fetch_thumbnail(frigate_id)
        if thumbnail is None:
            return

        # Rotate thumbnail if camera is mounted sideways (e.g., cam_040)
        thumbnail = self._rotate_thumbnail_if_needed(thumbnail, camera_id)

        embedding = await self.reid_service.extract_features(thumbnail)
        if embedding is None:
            return

        color_hist = self._extract_color_histogram(thumbnail)

        # Try to match against known persons first
        db = SessionLocal()
        try:
            known_embeddings = self._get_known_embeddings_with_average(db, current_camera=camera_id)
            match_result = self._find_best_match_enhanced(
                embedding, color_hist, known_embeddings, current_camera=camera_id
            )

            if match_result:
                # Found a match! Assign to this person
                person_id, similarity = match_result
                person = db.query(TrackedPerson).filter(TrackedPerson.id == person_id).first()
                if person:
                    person.last_seen = datetime.utcnow()
                    person.last_camera_id = camera_id
                    person.is_active = True
                    _person_last_camera[person_id] = (camera_id, datetime.utcnow())

                    await self._maybe_add_embedding_with_quality_gate(db, person_id, embedding, camera_id)
                    self._update_person_color_histogram(person_id, color_hist)

                    zone_name = CAMERA_ZONES.get(camera_id, "")
                    sighting = PersonSighting(
                        person_id=person_id,
                        camera_id=camera_id,
                        frigate_event_id=frigate_id,
                        zone_name=zone_name,
                        confidence=data.get("score", 1.0)
                    )
                    db.add(sighting)

                    _active_tracks[frigate_id] = person_id
                    # Remove from candidates
                    del _candidate_detections[camera_id][frigate_id]

                    logger.info(f"Candidate {frigate_id} matched to {person.display_id} on update")

                    await self._publish_enriched_event(camera_id, frigate_id, person, similarity, True)
                    await self._publish_journey_update(db, person)

                db.commit()
            else:
                # Still no match - update candidate
                self._store_candidate(camera_id, frigate_id, embedding, color_hist)

        finally:
            db.close()

    async def _process_detection(self, topic: str, payload: str):
        """Process per-camera detection message."""
        # These are lightweight messages for real-time tracking
        # Format: frigate/{camera}/person with count as payload
        pass  # Already handled via frigate/events


async def run_worker():
    """Run the ReID worker."""
    logging.basicConfig(level=logging.INFO)
    worker = ReIDWorker()
    await worker.start()


if __name__ == "__main__":
    asyncio.run(run_worker())
