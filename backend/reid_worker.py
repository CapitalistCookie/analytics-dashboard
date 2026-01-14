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
from typing import Optional, Dict, List, Tuple, Set
from contextlib import asynccontextmanager

import httpx
import numpy as np

from sqlalchemy.orm import joinedload

from database import SessionLocal, InfluxDBConnection, INFLUXDB_BUCKET, INFLUXDB_ORG
from models import TrackedPerson, PersonEmbedding, PersonSighting, Staff, NegativePair
from reid_service import get_reid_service
from services.anomaly_service import AnomalyService
from influxdb_client import Point
from services.pose_service import get_pose_service, PoseState
from services.action_service import ActionService, ActionType
from services.customer_insights_service import CustomerInsightsService

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

# Average embedding cache - prevents recomputing average for every detection
MAX_CACHED_AVG_EMBEDDINGS = 100  # Maximum cached average embeddings
AVG_EMBEDDING_CACHE_TTL = 300  # Cache TTL in seconds (5 minutes)

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

# Adaptive threshold configuration - adjusts based on camera trust, time, and density
ADAPTIVE_THRESHOLDS = {
    "camera": {
        # HIGH_TRUST - good angles, stricter thresholds
        "entrance": {"same": 0.92, "cross": 0.87},
        "bar_lounge": {"same": 0.92, "cross": 0.87},
        "seating": {"same": 0.91, "cross": 0.86},
        "cashier": {"same": 0.91, "cross": 0.86},
        "food_pickup": {"same": 0.91, "cross": 0.86},
        # MEDIUM_TRUST - decent views
        "vip_room": {"same": 0.88, "cross": 0.83},
        "karaoke": {"same": 0.88, "cross": 0.83},
        "kitchen": {"same": 0.88, "cross": 0.83},
        "patio": {"same": 0.88, "cross": 0.83},
        # LOW_TRUST - top-down, more lenient
        "bar": {"same": 0.85, "cross": 0.80},
    },
    "time_of_day": {
        # Peak hours: 12-13 (lunch), 18-20 (dinner) - more crowded, lower threshold
        "peak_hours": [12, 13, 18, 19, 20],
        "peak_adjustment": -0.02,
        # Off-peak hours: easier to distinguish, higher threshold
        "off_peak_hours": [9, 10, 11, 14, 15, 16, 17, 21, 22, 23],
        "off_peak_adjustment": +0.02,
    },
    "density": {
        "high_threshold": 40,   # >40 active tracks = high density
        "high_adjustment": -0.03,
        "low_threshold": 15,    # <15 active tracks = low density
        "low_adjustment": +0.02,
    },
    # Absolute bounds to prevent unreasonable thresholds
    "min_threshold": 0.75,
    "max_threshold": 0.95,
}

# Negative pairs cache refresh interval (seconds)
NEGATIVE_PAIRS_CACHE_TTL = 300  # 5 minutes

# Pose estimation settings
POSE_DETECTION_ENABLED = os.getenv("POSE_DETECTION_ENABLED", "true").lower() == "true"
POSE_SAMPLE_RATE = int(os.getenv("POSE_SAMPLE_RATE", "5"))  # Run pose detection every N detections

# Camera exclusions - top-down views (can still track but lower quality ReID)
# Note: Even top-down cameras can do ReID on head/hair patterns, so we don't fully exclude
EXCLUDED_CAMERAS: set = set()  # No cameras fully excluded

# Cameras that need rotation before embedding extraction
# Key: camera_id, Value: rotation degrees clockwise
ROTATED_CAMERAS = {
    "cashier": 90  # Mounted sideways, rotate 90 degrees clockwise
}

# Camera trust levels for ReID embedding quality
# HIGH_TRUST: Good angle for embeddings, can create new person IDs
# MEDIUM_TRUST: Can match to existing persons
# LOW_TRUST: Top-down views - lower quality ReID but still functional

# Entry cameras - can create new person IDs (customers enter through these)
ENTRY_CAMERAS = {"entrance", "bar_lounge"}

# High trust cameras - good angle for embedding extraction
HIGH_TRUST_CAMERAS = {"entrance", "bar_lounge", "seating", "cashier", "food_pickup"}

# Medium trust cameras - can match but lower priority for embedding storage
MEDIUM_TRUST_CAMERAS = {"vip_room", "karaoke", "kitchen", "patio"}

# Low trust cameras - top-down views, ReID on head/hair patterns only
LOW_TRUST_CAMERAS = {"bar"}

# Staff-only areas - detections here classified as staff if unmatched
STAFF_ONLY_CAMERAS = {"bar", "food_pickup", "kitchen"}

# Camera-to-zone mapping (Frigate camera names map to logical zones)
# Note: Since Frigate already uses zone names as camera IDs, these map 1:1
CAMERA_ZONES: Dict[str, str] = {
    "entrance": "entrance",
    "bar_lounge": "bar_lounge",
    "seating": "seating",
    "cashier": "cashier",
    "vip_room": "vip_room",
    "karaoke": "karaoke",
    "bar": "bar",
    "food_pickup": "food_pickup",
    "kitchen": "kitchen",
    "patio": "patio",
}

# Camera adjacency graph - defines physical proximity for cross-camera matching
# Complete graph including all cameras based on actual floor plan layout:
#   entrance → bar_lounge/hallway → [cashier, seating, bar]
#   hallway is main corridor connecting many areas
#   back_hallway connects kitchen/storage/office area

# DEFAULT adjacency - used as fallback and for rollback
DEFAULT_CAMERA_ADJACENCY: Dict[str, List[str]] = {
    "entrance": ["bar_lounge", "hallway"],
    "hallway": ["entrance", "seating", "back_hallway", "cashier"],
    "bar_lounge": ["entrance", "cashier", "seating", "bar"],
    "bar": ["bar_lounge", "food_pickup"],
    "seating": ["bar_lounge", "hallway", "cashier", "patio"],
    "cashier": ["bar_lounge", "hallway", "seating", "vip_room"],
    "food_pickup": ["bar", "kitchen"],
    "kitchen": ["food_pickup", "back_hallway", "storage"],
    "back_hallway": ["hallway", "kitchen", "storage", "office"],
    "storage": ["kitchen", "back_hallway"],
    "office": ["back_hallway"],
    "vip_room": ["cashier", "karaoke"],
    "karaoke": ["vip_room"],
    "patio": ["seating"],
}

# File path for flow connections (edited via UI)
FLOW_CONNECTIONS_FILE = "/app/data/flow_connections.json"

# Cache for loaded adjacency to avoid repeated file reads
_cached_camera_adjacency: Optional[Dict[str, List[str]]] = None
_adjacency_cache_time: Optional[datetime] = None
ADJACENCY_CACHE_TTL = 60  # Refresh from file every 60 seconds


def _load_flow_connections_from_file() -> Optional[List[List[str]]]:
    """Load flow connections from JSON file."""
    import json
    try:
        if os.path.exists(FLOW_CONNECTIONS_FILE):
            with open(FLOW_CONNECTIONS_FILE, "r") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
    except Exception as e:
        logger.warning(f"Failed to load flow connections from file: {e}")
    return None


def _convert_connections_to_adjacency(connections: List[List[str]]) -> Dict[str, List[str]]:
    """
    Convert flow connections pairs to adjacency dictionary.

    Flow connections are bidirectional pairs like [["entrance", "bar_lounge"], ...]
    This converts them to adjacency format {"entrance": ["bar_lounge", ...], ...}
    """
    adjacency: Dict[str, List[str]] = {}

    for conn in connections:
        if len(conn) >= 2:
            cam1, cam2 = conn[0], conn[1]

            # Add bidirectional connections
            if cam1 not in adjacency:
                adjacency[cam1] = []
            if cam2 not in adjacency[cam1]:
                adjacency[cam1].append(cam2)

            if cam2 not in adjacency:
                adjacency[cam2] = []
            if cam1 not in adjacency[cam2]:
                adjacency[cam2].append(cam1)

    return adjacency


def get_camera_adjacency() -> Dict[str, List[str]]:
    """
    Get current camera adjacency graph.

    Loads from flow_connections.json if available, otherwise uses defaults.
    Results are cached for performance with TTL refresh.
    """
    global _cached_camera_adjacency, _adjacency_cache_time

    now = datetime.utcnow()

    # Check if cache is still valid
    if (_cached_camera_adjacency is not None and
        _adjacency_cache_time is not None and
        (now - _adjacency_cache_time).total_seconds() < ADJACENCY_CACHE_TTL):
        return _cached_camera_adjacency

    # Try to load from file
    connections = _load_flow_connections_from_file()

    if connections:
        _cached_camera_adjacency = _convert_connections_to_adjacency(connections)
        logger.info(f"Loaded camera adjacency from file: {len(_cached_camera_adjacency)} cameras")
    else:
        _cached_camera_adjacency = DEFAULT_CAMERA_ADJACENCY.copy()
        logger.info("Using default camera adjacency (no file found)")

    _adjacency_cache_time = now
    return _cached_camera_adjacency


def invalidate_adjacency_cache():
    """Force reload of adjacency from file on next access."""
    global _cached_camera_adjacency, _adjacency_cache_time
    _cached_camera_adjacency = None
    _adjacency_cache_time = None
    logger.info("Camera adjacency cache invalidated")


# For backward compatibility - static reference uses defaults initially
CAMERA_ADJACENCY = DEFAULT_CAMERA_ADJACENCY

# Camera transition times (in seconds) - minimum time to walk between cameras
# Keys are (from_camera, to_camera) tuples, value is min seconds
CAMERA_TRANSITION_TIMES: Dict[tuple, int] = {
    # Direct adjacent transitions (fast)
    ("entrance", "bar_lounge"): 3,
    ("entrance", "hallway"): 3,
    ("bar_lounge", "entrance"): 3,
    ("bar_lounge", "cashier"): 4,
    ("bar_lounge", "seating"): 5,
    ("bar_lounge", "bar"): 4,
    ("hallway", "seating"): 4,
    ("hallway", "cashier"): 4,
    ("hallway", "back_hallway"): 5,
    ("seating", "cashier"): 4,
    ("seating", "patio"): 3,
    ("cashier", "vip_room"): 4,
    ("vip_room", "karaoke"): 3,
    ("bar", "food_pickup"): 4,
    ("food_pickup", "kitchen"): 3,
    ("kitchen", "back_hallway"): 4,
    ("kitchen", "storage"): 3,
    ("back_hallway", "storage"): 3,
    ("back_hallway", "office"): 4,
    # Non-adjacent transitions (longer paths)
    ("entrance", "seating"): 8,      # Through bar_lounge
    ("entrance", "cashier"): 7,      # Through bar_lounge
    ("bar_lounge", "vip_room"): 8,   # Through cashier
    ("bar_lounge", "kitchen"): 12,   # Through bar/food_pickup
    ("seating", "vip_room"): 8,      # Through cashier
    ("seating", "kitchen"): 15,      # Long path
}
DEFAULT_TRANSITION_TIME = 5  # Default for unspecified pairs

# Exit boost configuration - reward matching persons who recently exited adjacent cameras
EXIT_BOOST_THRESHOLDS = {
    "immediate": {"seconds": 10, "boost": 0.10},  # Just left, high confidence
    "recent": {"seconds": 30, "boost": 0.06},     # Recently left
    "lingering": {"seconds": 60, "boost": 0.03}, # Left within a minute
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

# Average embedding cache - stores precomputed L2-normalized average embeddings
# Structure: {person_id: (avg_embedding: np.ndarray, cached_at: datetime)}
_person_avg_embeddings: Dict[int, Tuple[np.ndarray, datetime]] = {}

# Negative pairs cache - prevents matching persons explicitly marked as different
# Structure: {person_id: set of person_ids that are NOT the same person}
_negative_pairs_cache: Dict[int, Set[int]] = {}
_negative_pairs_cache_time: Optional[datetime] = None

# Transition statistics - tracks observed camera transitions for analysis
# Structure: {(from_camera, to_camera): count}
_transition_counts: Dict[Tuple[str, str], int] = {}
_transition_times: Dict[Tuple[str, str], List[float]] = {}  # Average transition times observed

# TODO(api): Expose transition statistics via API endpoint
# - Create GET /api/analytics/transitions endpoint in routers/analytics.py
# - Return _transition_counts as {from_camera: {to_camera: count, ...}, ...}
# - Return _transition_times averages for path timing analysis
# - This data helps optimize CAMERA_TRANSITION_TIMES configuration
# - Consider periodic InfluxDB persistence for historical analysis

# Memory management state
_detection_count = 0
_last_cleanup_time = datetime.utcnow()
_pose_sample_count = 0  # Counter for pose sampling


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
        f"last_cam:{len(_person_last_camera)} exits:{len(_recent_exits)} "
        f"avg_emb:{len(_person_avg_embeddings)} neg_pairs:{len(_negative_pairs_cache)} "
        f"transitions:{len(_transition_counts)}"
    )


def get_transition_time(from_camera: str, to_camera: str) -> int:
    """
    Get the minimum transition time between two cameras.

    Checks both directions and returns the configured time or default.
    """
    # Check direct mapping
    if (from_camera, to_camera) in CAMERA_TRANSITION_TIMES:
        return CAMERA_TRANSITION_TIMES[(from_camera, to_camera)]

    # Check reverse mapping (symmetric)
    if (to_camera, from_camera) in CAMERA_TRANSITION_TIMES:
        return CAMERA_TRANSITION_TIMES[(to_camera, from_camera)]

    return DEFAULT_TRANSITION_TIME


def get_exit_boost(person_id: int, current_camera: str) -> float:
    """
    Calculate matching boost for a person who recently exited an adjacent camera.

    Returns a boost value (0.0 - 0.10) based on how recently the person
    was seen on an adjacent camera.
    """
    if person_id not in _recent_exits:
        return 0.0

    exit_camera, exit_time = _recent_exits[person_id]

    # Check if the exit camera is adjacent to current camera
    adjacent_cameras = get_camera_adjacency().get(current_camera, [])
    if exit_camera not in adjacent_cameras:
        return 0.0

    # Calculate time since exit
    seconds_since_exit = (datetime.utcnow() - exit_time).total_seconds()

    # Apply tiered boost based on recency
    for tier_name, tier_config in EXIT_BOOST_THRESHOLDS.items():
        if seconds_since_exit <= tier_config["seconds"]:
            boost = tier_config["boost"]
            logger.debug(
                f"Exit boost for person {person_id}: {boost} "
                f"({tier_name}, {seconds_since_exit:.1f}s ago from {exit_camera})"
            )
            return boost

    return 0.0


def check_temporal_exclusion(
    last_camera: str,
    current_camera: str,
    last_seen: datetime,
    now: datetime = None
) -> Tuple[bool, float]:
    """
    Check if a person could have physically transitioned between cameras.

    Uses dynamic transition times based on camera pair configuration.

    Returns:
        (is_excluded, seconds_elapsed): Tuple of exclusion status and elapsed time
    """
    if now is None:
        now = datetime.utcnow()

    seconds_elapsed = (now - last_seen).total_seconds()

    # Same camera - no exclusion needed
    if last_camera == current_camera:
        return (False, seconds_elapsed)

    # Get minimum transition time
    min_transition = get_transition_time(last_camera, current_camera)

    # Check if cameras are adjacent
    adjacent_cameras = get_camera_adjacency().get(last_camera, [])
    are_adjacent = current_camera in adjacent_cameras

    if are_adjacent:
        # Adjacent cameras - use configured transition time
        is_excluded = seconds_elapsed < min_transition
    else:
        # Non-adjacent cameras - require more time (1.5x minimum)
        is_excluded = seconds_elapsed < (min_transition * 1.5)

    return (is_excluded, seconds_elapsed)


def record_transition(from_camera: str, to_camera: str, transition_seconds: float):
    """
    Record an observed camera transition for statistics.

    This data can be used to refine transition time estimates.
    """
    key = (from_camera, to_camera)

    # Increment count
    _transition_counts[key] = _transition_counts.get(key, 0) + 1

    # Record transition time (keep last 100 for averaging)
    if key not in _transition_times:
        _transition_times[key] = []
    _transition_times[key].append(transition_seconds)
    if len(_transition_times[key]) > 100:
        _transition_times[key] = _transition_times[key][-100:]

    logger.debug(
        f"Recorded transition: {from_camera} -> {to_camera} "
        f"in {transition_seconds:.1f}s (total: {_transition_counts[key]})"
    )


def get_transition_stats() -> dict:
    """
    Get statistics on observed camera transitions.

    Returns dict with transition counts and average times.
    """
    stats = {
        "transitions": [],
        "total_transitions": sum(_transition_counts.values()),
        "unique_paths": len(_transition_counts),
    }

    for (from_cam, to_cam), count in sorted(
        _transition_counts.items(),
        key=lambda x: x[1],
        reverse=True
    ):
        times = _transition_times.get((from_cam, to_cam), [])
        avg_time = sum(times) / len(times) if times else None

        stats["transitions"].append({
            "from": from_cam,
            "to": to_cam,
            "count": count,
            "avg_seconds": round(avg_time, 1) if avg_time else None,
            "min_configured": get_transition_time(from_cam, to_cam),
            "is_adjacent": to_cam in get_camera_adjacency().get(from_cam, []),
        })

    return stats


def get_adaptive_threshold(
    camera_id: str,
    is_cross_camera: bool,
    current_hour: int = None,
    occupancy: int = None
) -> float:
    """
    Calculate adaptive threshold based on camera trust level, time of day, and crowd density.

    Args:
        camera_id: Current camera identifier
        is_cross_camera: Whether this is a cross-camera match
        current_hour: Hour of day (0-23), defaults to current time
        occupancy: Number of active tracks, defaults to current count

    Returns:
        Adjusted threshold value (clamped between min/max)
    """
    if current_hour is None:
        current_hour = datetime.now().hour
    if occupancy is None:
        occupancy = len(_active_tracks)

    # Base threshold from camera config
    camera_config = ADAPTIVE_THRESHOLDS["camera"].get(camera_id)
    if camera_config:
        base_threshold = camera_config["cross"] if is_cross_camera else camera_config["same"]
    else:
        # Fallback to global defaults if camera not configured
        base_threshold = CROSS_CAMERA_THRESHOLD if is_cross_camera else SIMILARITY_THRESHOLD

    adjustment = 0.0

    # Time-of-day adjustment
    time_config = ADAPTIVE_THRESHOLDS["time_of_day"]
    if current_hour in time_config["peak_hours"]:
        adjustment += time_config["peak_adjustment"]
    elif current_hour in time_config["off_peak_hours"]:
        adjustment += time_config["off_peak_adjustment"]

    # Density adjustment
    density_config = ADAPTIVE_THRESHOLDS["density"]
    if occupancy > density_config["high_threshold"]:
        adjustment += density_config["high_adjustment"]
    elif occupancy < density_config["low_threshold"]:
        adjustment += density_config["low_adjustment"]

    # Apply adjustment and clamp
    final_threshold = base_threshold + adjustment
    final_threshold = max(ADAPTIVE_THRESHOLDS["min_threshold"], final_threshold)
    final_threshold = min(ADAPTIVE_THRESHOLDS["max_threshold"], final_threshold)

    return final_threshold


def get_all_adaptive_thresholds(current_hour: int = None, occupancy: int = None) -> dict:
    """
    Get adaptive thresholds for all cameras given current conditions.

    Returns dict of camera_id -> {"same": threshold, "cross": threshold}
    """
    if current_hour is None:
        current_hour = datetime.now().hour
    if occupancy is None:
        occupancy = len(_active_tracks)

    result = {}
    for camera_id in ADAPTIVE_THRESHOLDS["camera"].keys():
        result[camera_id] = {
            "same": get_adaptive_threshold(camera_id, False, current_hour, occupancy),
            "cross": get_adaptive_threshold(camera_id, True, current_hour, occupancy),
        }

    return result


def load_negative_pairs_cache():
    """
    Load negative pairs from database into memory cache.
    Called periodically to keep cache in sync with DB.
    """
    global _negative_pairs_cache, _negative_pairs_cache_time

    db = SessionLocal()
    try:
        pairs = db.query(NegativePair).all()

        # Build bidirectional cache
        new_cache: Dict[int, Set[int]] = {}
        for pair in pairs:
            # Add both directions
            if pair.person_id_a not in new_cache:
                new_cache[pair.person_id_a] = set()
            new_cache[pair.person_id_a].add(pair.person_id_b)

            if pair.person_id_b not in new_cache:
                new_cache[pair.person_id_b] = set()
            new_cache[pair.person_id_b].add(pair.person_id_a)

        _negative_pairs_cache = new_cache
        _negative_pairs_cache_time = datetime.utcnow()

        logger.info(f"Loaded {len(pairs)} negative pairs into cache ({len(new_cache)} entries)")

    except Exception as e:
        logger.error(f"Failed to load negative pairs cache: {e}")
    finally:
        db.close()


def is_negative_pair(person_id_a: int, person_id_b: int) -> bool:
    """
    Check if two persons are marked as a negative pair (not the same person).
    Refreshes cache if expired.
    """
    global _negative_pairs_cache_time

    # Refresh cache if expired or not loaded
    now = datetime.utcnow()
    if (_negative_pairs_cache_time is None or
        (now - _negative_pairs_cache_time).total_seconds() > NEGATIVE_PAIRS_CACHE_TTL):
        load_negative_pairs_cache()

    # Check cache
    if person_id_a in _negative_pairs_cache:
        return person_id_b in _negative_pairs_cache[person_id_a]

    return False


def detect_pose_from_thumbnail(thumbnail_bytes: bytes) -> Tuple[Optional[str], Optional[List[Dict]]]:
    """
    Detect pose from thumbnail bytes using MediaPipe.

    Returns tuple of (pose_state, pose_landmarks) where:
    - pose_state: "seated", "standing", or None if detection failed/disabled
    - pose_landmarks: List of landmark dicts for action classification, or None
    """
    global _pose_sample_count

    if not POSE_DETECTION_ENABLED:
        return None, None

    # Sample-based pose detection to reduce overhead
    _pose_sample_count += 1
    if _pose_sample_count % POSE_SAMPLE_RATE != 0:
        return None, None

    try:
        pose_service = get_pose_service()

        # Initialize MediaPipe if needed
        if not pose_service._model_loaded:
            if not pose_service.initialize():
                return None, None

        # Detect pose and get landmarks
        from PIL import Image
        from io import BytesIO
        import cv2

        input_buffer = BytesIO(thumbnail_bytes)
        img = Image.open(input_buffer).convert('RGB')
        img_array = np.array(img)
        img_bgr = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)

        results = pose_service.pose.process(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB))

        # Clean up
        img.close()
        input_buffer.close()

        if not results.pose_landmarks:
            return None, None

        # Get pose state
        pose_state, confidence = pose_service._classify_pose(results.pose_landmarks)

        # Convert landmarks to list of dicts for action service
        pose_landmarks = []
        for lm in results.pose_landmarks.landmark:
            pose_landmarks.append({
                'x': lm.x,
                'y': lm.y,
                'z': lm.z,
                'visibility': lm.visibility
            })

        if confidence > 0.5:
            return pose_state.value, pose_landmarks
        return None, pose_landmarks

    except Exception as e:
        logger.debug(f"Pose detection error: {e}")
        return None, None


def classify_action_from_landmarks(
    pose_landmarks: Optional[List[Dict]],
    person_id: Optional[int],
    db,
    camera_id: str,
    zone: str
) -> Optional[str]:
    """
    Classify action from pose landmarks and update tracking.

    Returns the action type string or None.
    """
    if not pose_landmarks:
        return None

    try:
        action, confidence = ActionService.classify_action(pose_landmarks, person_id)

        if action == ActionType.UNKNOWN or confidence < 0.5:
            return None

        # Update action tracking if we have a person
        if person_id is not None:
            ActionService.update_person_action(
                db=db,
                person_id=person_id,
                action=action,
                confidence=confidence,
                camera_id=camera_id,
                zone=zone
            )

        return action.value

    except Exception as e:
        logger.debug(f"Action classification error: {e}")
        return None


def cleanup_stale_caches():
    """Clean up stale entries from all in-memory caches."""
    global _active_tracks, _last_embedding_time, _person_last_camera
    global _recent_exits, _candidate_detections, _person_color_histograms
    global _last_cleanup_time, _person_avg_embeddings

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

    # Clean _person_avg_embeddings - remove expired entries
    avg_emb_cutoff = now - timedelta(seconds=AVG_EMBEDDING_CACHE_TTL)
    expired_avg_emb = [pid for pid, (_, cached_at) in _person_avg_embeddings.items()
                       if cached_at < avg_emb_cutoff]
    for pid in expired_avg_emb:
        del _person_avg_embeddings[pid]
        cleaned += 1

    # Hard limit on _person_avg_embeddings
    if len(_person_avg_embeddings) > MAX_CACHED_AVG_EMBEDDINGS:
        sorted_avg = sorted(_person_avg_embeddings.items(), key=lambda x: x[1][1], reverse=True)
        _person_avg_embeddings.clear()
        for pid, val in sorted_avg[:MAX_CACHED_AVG_EMBEDDINGS]:
            _person_avg_embeddings[pid] = val
        cleaned += len(sorted_avg) - MAX_CACHED_AVG_EMBEDDINGS

    # Hard limit on _active_tracks
    if len(_active_tracks) > MAX_ACTIVE_TRACKS:
        excess = len(_active_tracks) - MAX_ACTIVE_TRACKS
        for key in list(_active_tracks.keys())[:excess]:
            del _active_tracks[key]
            cleaned += 1

    # Clean up old anomaly alert cooldowns
    AnomalyService.cleanup_old_alerts()

    # Clean up stale action tracking data
    ActionService.cleanup_stale_tracking()

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
        self._broadcast_task = None
        self._recent_event_ids: set = set()  # Track recent events to skip duplicates
        self._last_occupancy_broadcast: int = 0  # Track last broadcast count

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

                # Start periodic WebSocket broadcast task
                self._broadcast_task = asyncio.create_task(self._periodic_broadcast())
                logger.info("Started WebSocket broadcast task")

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
            # Cancel broadcast task
            if self._broadcast_task:
                self._broadcast_task.cancel()
                try:
                    await self._broadcast_task
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

    async def _periodic_broadcast(self):
        """Background task that broadcasts occupancy updates via WebSocket."""
        logger.info("[BROADCAST] Periodic broadcast task started")
        while self._running:
            try:
                await asyncio.sleep(10)  # Broadcast every 10 seconds
                if self._running:
                    await self._broadcast_occupancy()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.debug(f"[BROADCAST] Error in periodic broadcast: {e}")

        logger.info("[BROADCAST] Periodic broadcast task stopped")

    async def _broadcast_occupancy(self, force: bool = False):
        """
        Broadcast current occupancy to WebSocket clients.

        Args:
            force: If True, broadcast even if count hasn't changed
        """
        try:
            from websocket_manager import ws_manager, broadcast_occupancy

            # Skip if no connections
            if ws_manager.connection_count == 0:
                return

            total = len(_active_tracks)

            # Skip if count hasn't changed (unless forced)
            if not force and total == self._last_occupancy_broadcast:
                return

            # Build per-camera counts from _person_last_camera
            by_camera: Dict[str, int] = {}
            for person_id, (camera_id, _) in _person_last_camera.items():
                if person_id in _active_tracks.values():
                    by_camera[camera_id] = by_camera.get(camera_id, 0) + 1

            await broadcast_occupancy(total, by_camera)
            self._last_occupancy_broadcast = total

            # Check crowd density per zone
            by_zone: Dict[str, int] = {}
            for camera_id, count in by_camera.items():
                zone = CAMERA_ZONES.get(camera_id, camera_id)
                by_zone[zone] = by_zone.get(zone, 0) + count

            for zone, count in by_zone.items():
                anomaly = AnomalyService.check_crowd_density(zone, count)
                if anomaly:
                    await self._broadcast_anomaly(anomaly)

            logger.debug(f"[BROADCAST] Occupancy update: total={total}, by_camera={by_camera}")
        except ImportError:
            pass  # WebSocket manager not available
        except Exception as e:
            logger.debug(f"[BROADCAST] Error broadcasting occupancy: {e}")

    async def _broadcast_anomaly(self, anomaly: Dict):
        """Broadcast anomaly alert to WebSocket clients."""
        try:
            from websocket_manager import ws_manager
            await ws_manager.broadcast("anomaly:alert", anomaly)
            logger.warning(f"ANOMALY: {anomaly.get('message', 'Unknown anomaly')}")
        except ImportError:
            pass
        except Exception as e:
            logger.debug(f"[BROADCAST] Error broadcasting anomaly: {e}")

    async def _broadcast_action_update(
        self, person_id: int, display_id: str, action: str, zone: str, camera_id: str
    ):
        """Broadcast action update to WebSocket clients."""
        try:
            from websocket_manager import ws_manager
            await ws_manager.broadcast("action:update", {
                "person_id": person_id,
                "display_id": display_id,
                "action": action,
                "zone": zone,
                "camera_id": camera_id,
                "timestamp": datetime.utcnow().isoformat()
            })
        except ImportError:
            pass
        except Exception as e:
            logger.debug(f"[BROADCAST] Error broadcasting action update: {e}")

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

        # Store raw bytes for pose detection before rotation
        thumbnail_bytes_for_pose = thumbnail

        # Rotate thumbnail if camera is mounted sideways (e.g., cam_040)
        thumbnail = self._rotate_thumbnail_if_needed(thumbnail, camera_id)

        # Detect pose and get landmarks (sampled, non-blocking)
        pose_state, pose_landmarks = detect_pose_from_thumbnail(thumbnail_bytes_for_pose)

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

                    # Record sighting with zone info and pose state
                    sighting = PersonSighting(
                        person_id=person_id,
                        camera_id=camera_id,
                        frigate_event_id=frigate_id,
                        zone_name=zone_name,
                        confidence=data.get("score", 1.0),
                        pose_state=pose_state
                    )
                    db.add(sighting)

                    # Classify action from pose landmarks
                    action_type = classify_action_from_landmarks(
                        pose_landmarks, person_id, db, camera_id, zone_name
                    )

                    # Broadcast action update via WebSocket if action detected
                    if action_type:
                        await self._broadcast_action_update(
                            person_id, person.display_id, action_type, zone_name, camera_id
                        )

                    # Check for restricted area access
                    is_staff = person.staff_id is not None
                    anomaly = AnomalyService.check_restricted_area(
                        person_id=person_id,
                        display_id=person.display_id,
                        zone=zone_name,
                        camera_id=camera_id,
                        is_staff=is_staff
                    )
                    if anomaly:
                        await self._broadcast_anomaly(anomaly)

                    # Write detection to InfluxDB for traffic analytics
                    try:
                        write_api = InfluxDBConnection.get_write_api()
                        classification = "staff" if person.staff_id else "customer"
                        point = Point("person_detection") \
                            .tag("camera", camera_id) \
                            .tag("zone", zone_name or "unknown") \
                            .tag("classification", classification) \
                            .tag("track_id", person.display_id) \
                            .tag("pose", pose_state or "unknown") \
                            .tag("action", action_type or "unknown") \
                            .field("confidence", float(data.get("score", 1.0)))
                        write_api.write(bucket=INFLUXDB_BUCKET, org=INFLUXDB_ORG, record=point)
                    except Exception as e:
                        logger.warning(f"Failed to write detection to InfluxDB: {e}")

                    _active_tracks[frigate_id] = person_id
                    logger.info(f"Matched {frigate_id} to person {person.display_id} (similarity: {similarity:.2f})")

                    # Publish enriched event
                    await self._publish_enriched_event(
                        camera_id, frigate_id, person, similarity, is_cross_camera
                    )

                    # Publish journey update
                    await self._publish_journey_update(db, person)

                    # Broadcast occupancy update via WebSocket
                    await self._broadcast_occupancy()
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
                            db, embedding, camera_id, frigate_id, data, color_hist, pose_state
                        )
                        _active_tracks[frigate_id] = person.id
                        _person_last_camera[person.id] = (camera_id, datetime.utcnow())
                        logger.info(f"Created new person {person.display_id} from {frigate_id} (entry camera)")

                        # Classify action for new person
                        new_zone_name = CAMERA_ZONES.get(camera_id, camera_id)
                        action_type = classify_action_from_landmarks(
                            pose_landmarks, person.id, db, camera_id, new_zone_name
                        )

                        # Broadcast action update via WebSocket if action detected
                        if action_type:
                            await self._broadcast_action_update(
                                person.id, person.display_id, action_type, new_zone_name, camera_id
                            )

                        # Publish enriched event
                        await self._publish_enriched_event(
                            camera_id, frigate_id, person, 1.0, False
                        )

                        # Publish initial journey update
                        await self._publish_journey_update(db, person)

                        # Broadcast occupancy update via WebSocket
                        await self._broadcast_occupancy(force=True)
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
            dwell_seconds = 0
            zone_name = None
            if sighting:
                exit_time = datetime.utcnow()
                sighting.exit_time = exit_time
                zone_name = sighting.zone_name
                # Calculate dwell time
                dwell_seconds = int((exit_time - sighting.enter_time).total_seconds())

                # Write dwell time to InfluxDB
                try:
                    write_api = InfluxDBConnection.get_write_api()
                    point = Point("zone_activity") \
                        .tag("camera", camera_id) \
                        .tag("zone", zone_name or "unknown") \
                        .tag("person_id", str(person_id)) \
                        .field("dwell_time", float(dwell_seconds)) \
                        .field("person_count", 1)
                    write_api.write(bucket=INFLUXDB_BUCKET, org=INFLUXDB_ORG, record=point)
                    logger.debug(f"Wrote dwell time {dwell_seconds}s to InfluxDB for zone {zone_name}")
                except Exception as e:
                    logger.warning(f"Failed to write dwell time to InfluxDB: {e}")

                # Check for loitering anomaly
                person = db.query(TrackedPerson).filter(TrackedPerson.id == person_id).first()
                if person and zone_name:
                    is_staff = person.staff_id is not None
                    anomaly = AnomalyService.check_loitering(
                        person_id=person_id,
                        display_id=person.display_id,
                        zone=zone_name,
                        dwell_seconds=dwell_seconds,
                        is_staff=is_staff
                    )
                    if anomaly:
                        await self._broadcast_anomaly(anomaly)

            # Check if person is still visible on any camera
            if person_id not in _active_tracks.values():
                person = db.query(TrackedPerson).filter(TrackedPerson.id == person_id).first()
                if person:
                    person.is_active = False

                    # Check for rapid exit anomaly
                    if person.first_seen:
                        total_duration = (datetime.utcnow() - person.first_seen).total_seconds()
                        anomaly = AnomalyService.check_rapid_exit(
                            person_id=person_id,
                            display_id=person.display_id,
                            total_duration_seconds=total_duration
                        )
                        if anomaly:
                            await self._broadcast_anomaly(anomaly)

            db.commit()
            logger.info(f"Person {person_id} left camera {camera_id} (dwell: {dwell_seconds}s)")

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
        adjacent_to_1 = get_camera_adjacency().get(cam1, [])
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
                                  color_hist: np.ndarray = None,
                                  pose_state: str = None) -> TrackedPerson:
        """Create a new tracked person with color histogram and pose state."""
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

        # Add sighting with pose state
        sighting = PersonSighting(
            person_id=person.id,
            camera_id=camera_id,
            frigate_event_id=frigate_id,
            zone_name=zone_name,
            confidence=data.get("score", 1.0),
            pose_state=pose_state
        )
        db.add(sighting)

        # Write detection to InfluxDB for traffic analytics
        try:
            write_api = InfluxDBConnection.get_write_api()
            point = Point("person_detection") \
                .tag("camera", camera_id) \
                .tag("zone", zone_name or "unknown") \
                .tag("classification", "customer") \
                .tag("track_id", person.display_id) \
                .tag("pose", pose_state or "unknown") \
                .field("confidence", float(data.get("score", 1.0)))
            write_api.write(bucket=INFLUXDB_BUCKET, org=INFLUXDB_ORG, record=point)
        except Exception as e:
            logger.warning(f"Failed to write new person detection to InfluxDB: {e}")

        _last_embedding_time[person.id] = datetime.utcnow()

        # Store color histogram for this person
        if color_hist is not None:
            _person_color_histograms[person.id] = color_hist

        # Check for returning customer on entry cameras
        if camera_id in ENTRY_CAMERAS and person.person_type != "staff":
            try:
                profile, is_returning = CustomerInsightsService.find_or_create_profile(
                    db, person, embedding
                )
                if is_returning:
                    # Broadcast via WebSocket
                    from websocket_manager import ws_manager
                    asyncio.create_task(
                        ws_manager.broadcast("customer:returning", {
                            "profile_id": profile.profile_id,
                            "visit_number": profile.total_visits,
                            "loyalty_tier": profile.loyalty_tier,
                            "person_display_id": person.display_id,
                            "timestamp": datetime.utcnow().isoformat()
                        })
                    )
                    logger.info(f"Welcome back! Customer {profile.profile_id} - Visit #{profile.total_visits}")
            except Exception as e:
                logger.warning(f"Failed to check returning customer: {e}")

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

        Uses eager loading to avoid N+1 queries and caches average embeddings for performance.

        Returns list of (person_id, avg_embedding, embeddings, metadata) where:
        - avg_embedding: mean of all embeddings for this person (cached)
        - embeddings: individual embeddings for confirmation check
        - metadata: includes camera/temporal info
        """
        cutoff = datetime.utcnow() - timedelta(hours=6)
        now = datetime.utcnow()

        # Use eager loading to fetch persons with their embeddings in ONE query
        persons = db.query(TrackedPerson).options(
            joinedload(TrackedPerson.embeddings)
        ).filter(
            TrackedPerson.last_seen >= cutoff
        ).all()

        result = []
        cache_hits = 0
        cache_misses = 0

        for person in persons:
            # Get embeddings from eager-loaded relationship (no extra query!)
            # Sort by created_at desc and limit to EMBEDDINGS_PER_PERSON
            all_embeddings = sorted(
                person.embeddings,
                key=lambda e: e.created_at,
                reverse=True
            )[:EMBEDDINGS_PER_PERSON]

            if not all_embeddings:
                continue

            emb_arrays = [
                np.frombuffer(e.embedding, dtype=np.float32)
                for e in all_embeddings
            ]

            # Check cache for average embedding
            cached = _person_avg_embeddings.get(person.id)
            if cached is not None:
                cached_avg, cached_at = cached
                # Check if cache is still valid (not expired)
                if (now - cached_at).total_seconds() < AVG_EMBEDDING_CACHE_TTL:
                    avg_embedding = cached_avg
                    cache_hits += 1
                else:
                    # Cache expired, recompute
                    avg_embedding = self._compute_and_cache_avg_embedding(person.id, emb_arrays, now)
                    cache_misses += 1
            else:
                # Not in cache, compute and cache
                avg_embedding = self._compute_and_cache_avg_embedding(person.id, emb_arrays, now)
                cache_misses += 1

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

        logger.debug(f"Embedding cache: {cache_hits} hits, {cache_misses} misses, {len(result)} persons")
        return result

    def _compute_and_cache_avg_embedding(
        self, person_id: int, emb_arrays: list, now: datetime
    ) -> np.ndarray:
        """Compute L2-normalized average embedding and cache it."""
        avg_embedding = np.mean(emb_arrays, axis=0)
        avg_embedding = avg_embedding / (np.linalg.norm(avg_embedding) + 1e-8)

        # Cache with timestamp
        _person_avg_embeddings[person_id] = (avg_embedding, now)

        return avg_embedding

    def _invalidate_avg_embedding_cache(self, person_id: int):
        """Invalidate cached average embedding when a new embedding is added."""
        if person_id in _person_avg_embeddings:
            del _person_avg_embeddings[person_id]
            logger.debug(f"Invalidated avg embedding cache for person {person_id}")

    def _find_best_match_enhanced(
        self,
        embedding: np.ndarray,
        color_hist: Optional[np.ndarray],
        known_embeddings: list,
        current_camera: str,
        exclude_person_id: int = None
    ) -> Optional[Tuple[int, float]]:
        """
        Enhanced matching with:
        - Adaptive thresholds based on camera trust, time, and density
        - Average embedding comparison (not individual)
        - Dynamic temporal exclusion based on camera transition times
        - Exit boost for recently exited adjacent cameras
        - Color histogram sanity check
        - Negative pairs enforcement
        - Transition statistics tracking
        """
        if not known_embeddings:
            return None

        best_match = None
        best_score = 0.0
        best_match_last_camera = None
        best_match_seconds = 0.0
        debug_scores = []

        embedding_norm = embedding / (np.linalg.norm(embedding) + 1e-8)
        now = datetime.utcnow()
        current_hour = now.hour
        occupancy = len(_active_tracks)

        for person_id, avg_embedding, emb_arrays, metadata in known_embeddings:
            # NEGATIVE PAIR CHECK: Skip if explicitly marked as different person
            if exclude_person_id is not None and is_negative_pair(exclude_person_id, person_id):
                logger.debug(
                    f"Skipping {metadata.get('display_id')}: negative pair with person {exclude_person_id}"
                )
                continue

            # DYNAMIC TEMPORAL EXCLUSION: Check using camera-specific transition times
            last_camera = metadata.get("last_camera")
            last_seen = metadata.get("last_seen")

            if last_camera and last_camera != current_camera and last_seen:
                is_excluded, seconds_elapsed = check_temporal_exclusion(
                    last_camera, current_camera, last_seen, now
                )
                if is_excluded:
                    min_time = get_transition_time(last_camera, current_camera)
                    logger.debug(
                        f"Temporal exclusion: {metadata.get('display_id')} seen on {last_camera} "
                        f"{seconds_elapsed:.1f}s ago (min: {min_time}s) - can't be on {current_camera}"
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

            # Apply adjacency boost
            adjacency_boost = ADJACENCY_BOOST if metadata.get("is_adjacent") else 0.0

            # EXIT BOOST: Bonus for matching persons who recently exited adjacent cameras
            exit_boost = get_exit_boost(person_id, current_camera)

            # Compute final score with all boosts
            adjusted_score = similarity * temporal_weight + adjacency_boost + exit_boost

            # ADAPTIVE THRESHOLD: Calculate based on camera trust, time, and density
            is_cross_camera = not metadata.get("is_same_camera", False)
            threshold = get_adaptive_threshold(
                camera_id=current_camera,
                is_cross_camera=is_cross_camera,
                current_hour=current_hour,
                occupancy=occupancy
            )

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
                "threshold": round(threshold, 3),
                "above_threshold": embeddings_above,
                "meets_confirm": meets_confirmation,
                "is_same_cam": metadata.get("is_same_camera", False),
                "exit_boost": round(exit_boost, 3) if exit_boost > 0 else None,
            })

            # Must exceed threshold AND meet confirmation
            if adjusted_score >= threshold and meets_confirmation and adjusted_score > best_score:
                best_score = adjusted_score
                best_match = (person_id, similarity)
                best_match_last_camera = last_camera
                if last_seen:
                    best_match_seconds = (now - last_seen).total_seconds()

        # Logging
        if debug_scores:
            logger.debug(f"Enhanced ReID scores for {current_camera}: {debug_scores}")
            if best_match:
                logger.info(
                    f"ReID match: person_id={best_match[0]}, similarity={best_match[1]:.3f}, "
                    f"adjusted={best_score:.3f}, adaptive_threshold used"
                )
                # Record transition statistics for cross-camera matches
                if best_match_last_camera and best_match_last_camera != current_camera:
                    record_transition(best_match_last_camera, current_camera, best_match_seconds)
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

        # Try to use cached average first for quality gate check
        cached = _person_avg_embeddings.get(person_id)
        avg_embedding = None

        if cached is not None:
            cached_avg, cached_at = cached
            if (now - cached_at).total_seconds() < AVG_EMBEDDING_CACHE_TTL:
                avg_embedding = cached_avg

        # If no valid cache, query and compute
        existing = None
        if avg_embedding is None:
            existing = db.query(PersonEmbedding).filter(
                PersonEmbedding.person_id == person_id
            ).all()

            if existing:
                # Calculate current average
                emb_arrays = [np.frombuffer(e.embedding, dtype=np.float32) for e in existing]
                avg_embedding = np.mean(emb_arrays, axis=0)
                avg_embedding = avg_embedding / (np.linalg.norm(avg_embedding) + 1e-8)

        if avg_embedding is not None:
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

        # Check current embedding count (query if not done yet)
        if existing is None:
            existing = db.query(PersonEmbedding).filter(
                PersonEmbedding.person_id == person_id
            ).all()

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

        # Invalidate the average embedding cache since we just added a new embedding
        self._invalidate_avg_embedding_cache(person_id)

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
