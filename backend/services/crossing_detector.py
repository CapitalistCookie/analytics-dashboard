"""
Crossing Detector Service - Detects entry/exit events using virtual line crossing.

Tracks person centroid movement and detects when people cross a defined line
in a specific zone. Used for accurate entry/exit counting at doorways.
"""

import logging
from datetime import datetime
from typing import Optional, Dict, List, Tuple
from collections import defaultdict

from influxdb_client import Point
from database import InfluxDBConnection, INFLUXDB_BUCKET, INFLUXDB_ORG

logger = logging.getLogger(__name__)


# Crossing line configurations per camera/zone
# axis: "y" for vertical line crossing (default), "x" for horizontal line crossing
# line_y/line_x: normalized position (0-1) where the virtual line is
# entry_direction: direction of movement that counts as entry
#   - For Y-axis: "down" = Y increasing = entry, "up" = Y decreasing = entry
#   - For X-axis: "right" = X increasing = entry, "left" = X decreasing = entry
# min_crossing_distance: minimum distance to count as a crossing (prevents jitter)
CROSSING_CONFIGS = {
    "entrance": {
        "zone": "doorway_zone",
        "axis": "y",
        "line_y": 0.65,  # Line at 65% from top (mid-lower portion of doorway)
        "entry_direction": "down",  # People enter by walking down (into restaurant)
        "min_crossing_distance": 0.05,  # Must move at least 5% of frame
        "frame_width": 1920,  # For normalizing pixel coords
        "frame_height": 1080,
    },
    "bar_lounge": {
        "zone": None,  # Full frame, no zone filter needed
        "axis": "x",  # Track horizontal movement (X-axis)
        "line_x": 0.70,  # Vertical line at 70% from left (right side where entrance is visible)
        "entry_direction": "left",  # RIGHT→LEFT (X decreasing) = entry (coming from entrance)
        "min_crossing_distance": 0.08,  # Must move at least 8% of frame width
        "frame_width": 640,  # CamHi camera is 640x480
        "frame_height": 480,
    },
}

# Default frame dimensions if not specified in config
DEFAULT_FRAME_WIDTH = 1920
DEFAULT_FRAME_HEIGHT = 1080

# How many position samples to keep for smoothing
MAX_HISTORY_LENGTH = 15

# Minimum positions needed to detect a crossing
MIN_POSITIONS_FOR_CROSSING = 3


class OccupancyTracker:
    """Tracks current occupancy based on entry/exit events, with staff/customer breakdown."""

    def __init__(self):
        # Total counts
        self.today_entries = 0
        self.today_exits = 0
        self.last_reset_date = datetime.utcnow().date()
        self._hourly_entries: Dict[int, int] = defaultdict(int)  # hour -> count
        self._hourly_exits: Dict[int, int] = defaultdict(int)
        self.last_entry_time: Optional[datetime] = None
        self.last_exit_time: Optional[datetime] = None

        # Staff/Customer breakdown
        self.staff_inside = 0
        self.customers_inside = 0
        self.staff_entries_today = 0
        self.staff_exits_today = 0
        self.customer_entries_today = 0
        self.customer_exits_today = 0

    def _maybe_reset_daily(self):
        """Reset daily counters if it's a new day."""
        today = datetime.utcnow().date()
        if today != self.last_reset_date:
            logger.info(f"New day detected, resetting occupancy counters. Previous: entries={self.today_entries}, exits={self.today_exits}")
            self.today_entries = 0
            self.today_exits = 0
            self.staff_entries_today = 0
            self.staff_exits_today = 0
            self.customer_entries_today = 0
            self.customer_exits_today = 0
            self._hourly_entries.clear()
            self._hourly_exits.clear()
            self.last_reset_date = today
            # Keep current counts - people might still be inside from overnight

    @property
    def current_count(self) -> int:
        """Total people inside (staff + customers)."""
        return self.staff_inside + self.customers_inside

    def record_entry(self, is_staff: bool = False):
        """Record an entry event.

        Args:
            is_staff: True if the person is identified as staff, False for customers
        """
        self._maybe_reset_daily()
        self.today_entries += 1
        self.last_entry_time = datetime.utcnow()
        hour = self.last_entry_time.hour
        self._hourly_entries[hour] += 1

        if is_staff:
            self.staff_inside += 1
            self.staff_entries_today += 1
            logger.info(f"[ENTRY-STAFF] Occupancy: {self.current_count} (staff={self.staff_inside}, customers={self.customers_inside})")
        else:
            self.customers_inside += 1
            self.customer_entries_today += 1
            logger.info(f"[ENTRY-CUSTOMER] Occupancy: {self.current_count} (staff={self.staff_inside}, customers={self.customers_inside})")

    def record_exit(self, is_staff: bool = False):
        """Record an exit event.

        Args:
            is_staff: True if the person is identified as staff, False for customers
        """
        self._maybe_reset_daily()
        self.today_exits += 1
        self.last_exit_time = datetime.utcnow()
        hour = self.last_exit_time.hour
        self._hourly_exits[hour] += 1

        if is_staff:
            self.staff_inside = max(0, self.staff_inside - 1)
            self.staff_exits_today += 1
            logger.info(f"[EXIT-STAFF] Occupancy: {self.current_count} (staff={self.staff_inside}, customers={self.customers_inside})")
        else:
            self.customers_inside = max(0, self.customers_inside - 1)
            self.customer_exits_today += 1
            logger.info(f"[EXIT-CUSTOMER] Occupancy: {self.current_count} (staff={self.staff_inside}, customers={self.customers_inside})")

    def get_stats(self) -> dict:
        """Get current occupancy statistics with staff/customer breakdown.

        Returns field names matching the frontend EntryExitCurrent interface:
        - entries_today / exits_today (totals)
        - staff_count / customer_count (current inside)
        - timestamp, last_entry_time, last_exit_time
        """
        self._maybe_reset_daily()
        return {
            "current_occupancy": self.current_count,
            "staff_count": self.staff_inside,
            "customer_count": self.customers_inside,
            "entries_today": self.today_entries,
            "exits_today": self.today_exits,
            "staff_entries_today": self.staff_entries_today,
            "staff_exits_today": self.staff_exits_today,
            "customer_entries_today": self.customer_entries_today,
            "customer_exits_today": self.customer_exits_today,
            "net_change": self.today_entries - self.today_exits,
            "last_entry_time": self.last_entry_time.isoformat() if self.last_entry_time else None,
            "last_exit_time": self.last_exit_time.isoformat() if self.last_exit_time else None,
            "timestamp": datetime.utcnow().isoformat(),
        }

    def get_hourly_breakdown(self) -> dict:
        """Get hourly entry/exit breakdown for today."""
        self._maybe_reset_daily()
        return {
            "entries": dict(self._hourly_entries),
            "exits": dict(self._hourly_exits),
        }


class CrossingDetector:
    """
    Detects when tracked persons cross a virtual line in configured zones.

    Uses centroid tracking to determine movement direction across the line.
    """

    def __init__(self):
        # Track centroid history: {(camera, track_id): [(timestamp, position), ...]}
        # position is either Y or X depending on the axis configured for the camera
        self._centroid_history: Dict[Tuple[str, str], List[Tuple[float, float]]] = {}

        # Track which persons have already crossed (to prevent double-counting)
        # {(camera, track_id): "entry" | "exit"}
        self._crossed: Dict[Tuple[str, str], str] = {}

        # Occupancy tracker
        self.occupancy = OccupancyTracker()

        # Stats
        self._total_crossings = 0
        self._detection_count = 0

    def update(
        self,
        camera_id: str,
        track_id: str,
        bbox: List[float],
        timestamp: float,
        person_id: Optional[int] = None,
        zones: Optional[List[str]] = None,
        is_staff: bool = False
    ) -> Optional[str]:
        """
        Update tracking for a person and detect line crossings.

        Args:
            camera_id: Camera identifier (e.g., "cam_009")
            track_id: Frigate track ID for this detection
            bbox: Bounding box [x1, y1, x2, y2] in normalized coords (0-1)
            timestamp: Unix timestamp of detection
            person_id: Optional ReID person ID if matched
            zones: Optional list of Frigate zones the person is currently in
            is_staff: Whether this person is identified as staff (for occupancy breakdown)

        Returns:
            "entry", "exit", or None if no crossing detected
        """
        self._detection_count += 1

        # Check if this camera has crossing detection configured
        config = CROSSING_CONFIGS.get(camera_id)
        if not config:
            return None

        # Check if person is in the target zone (if zones provided and zone is configured)
        target_zone = config.get("zone")
        if target_zone and zones and target_zone not in zones:
            return None

        # Calculate centroid position
        if len(bbox) < 4:
            return None

        # bbox is [x1, y1, x2, y2] in pixel coordinates - normalize to 0-1
        frame_width = config.get("frame_width", DEFAULT_FRAME_WIDTH)
        frame_height = config.get("frame_height", DEFAULT_FRAME_HEIGHT)
        axis = config.get("axis", "y")

        # Normalize coordinates
        x1_norm = bbox[0] / frame_width
        x2_norm = bbox[2] / frame_width
        y1_norm = bbox[1] / frame_height
        y2_norm = bbox[3] / frame_height

        centroid_x = (x1_norm + x2_norm) / 2
        centroid_y = (y1_norm + y2_norm) / 2

        # Select the position based on configured axis
        if axis == "x":
            current_pos = centroid_x
            line_pos = config.get("line_x", 0.5)
        else:
            current_pos = centroid_y
            line_pos = config.get("line_y", 0.5)

        # Debug log for crossing detection
        if self._detection_count % 50 == 0:
            logger.info(
                f"[CROSSING DEBUG] {camera_id} track={track_id} axis={axis} "
                f"pos={current_pos:.3f} line={line_pos} zones={zones}"
            )

        key = (camera_id, track_id)

        # Initialize history if needed
        if key not in self._centroid_history:
            self._centroid_history[key] = []

        # Add current position (timestamp, position on tracked axis)
        self._centroid_history[key].append((timestamp, current_pos))

        # Keep only recent history
        if len(self._centroid_history[key]) > MAX_HISTORY_LENGTH:
            self._centroid_history[key] = self._centroid_history[key][-MAX_HISTORY_LENGTH:]

        # Need enough positions to detect crossing
        history = self._centroid_history[key]
        if len(history) < MIN_POSITIONS_FOR_CROSSING:
            return None

        # Check if already crossed (prevent double counting per track)
        if key in self._crossed:
            return None

        # Detect crossing
        crossing = self._detect_crossing(history, config)

        if crossing:
            self._crossed[key] = crossing
            self._total_crossings += 1

            # Update occupancy with staff/customer breakdown
            if crossing == "entry":
                self.occupancy.record_entry(is_staff=is_staff)
            else:
                self.occupancy.record_exit(is_staff=is_staff)

            # Write to InfluxDB
            zone = config.get("zone") or "full_frame"  # Default zone name if None
            self._write_crossing_event(camera_id, track_id, crossing, person_id, zone)

            logger.info(
                f"[CROSSING] {crossing.upper()} detected on {camera_id} "
                f"(track={track_id}, person={person_id})"
            )

            return crossing

        return None

    def _detect_crossing(
        self,
        history: List[Tuple[float, float]],
        config: dict
    ) -> Optional[str]:
        """
        Detect if the centroid path crossed the line.

        Uses the first and last positions to determine overall direction,
        checking if they're on opposite sides of the line.

        Supports both Y-axis crossing (vertical line) and X-axis crossing (horizontal line).
        """
        axis = config.get("axis", "y")
        min_distance = config["min_crossing_distance"]
        entry_direction = config["entry_direction"]

        # Get line position based on axis
        if axis == "x":
            line_pos = config.get("line_x", 0.5)
        else:
            line_pos = config.get("line_y", 0.5)

        # Get start and end positions (history stores (timestamp, position))
        start_pos = history[0][1]
        end_pos = history[-1][1]

        # Check if on opposite sides of line
        # "before" means less than line position (left for X, above for Y)
        start_before = start_pos < line_pos
        end_before = end_pos < line_pos

        if start_before == end_before:
            # Same side, no crossing
            return None

        # Check minimum movement distance
        distance = abs(end_pos - start_pos)
        if distance < min_distance:
            return None

        # Determine direction
        # For Y-axis: positive = moved down
        # For X-axis: positive = moved right
        moved_positive = end_pos > start_pos

        # Map entry_direction to whether positive movement = entry
        if axis == "x":
            # X-axis: "right" = positive movement = entry
            if entry_direction == "right":
                return "entry" if moved_positive else "exit"
            else:  # entry_direction == "left"
                return "exit" if moved_positive else "entry"
        else:
            # Y-axis: "down" = positive movement = entry
            if entry_direction == "down":
                return "entry" if moved_positive else "exit"
            else:  # entry_direction == "up"
                return "exit" if moved_positive else "entry"

    def _write_crossing_event(
        self,
        camera_id: str,
        track_id: str,
        direction: str,
        person_id: Optional[int],
        zone: str
    ):
        """Write crossing event to InfluxDB."""
        try:
            write_api = InfluxDBConnection.get_write_api()

            point = (
                Point("entry_exit_event")
                .tag("camera", camera_id)
                .tag("zone", zone)
                .tag("direction", direction)
                .field("track_id", track_id)
                .field("person_id", str(person_id) if person_id else "unknown")
                .field("count", 1)
            )

            write_api.write(bucket=INFLUXDB_BUCKET, org=INFLUXDB_ORG, record=point)
            logger.debug(f"Wrote entry_exit_event to InfluxDB: {direction} on {camera_id}")

        except Exception as e:
            logger.error(f"Failed to write crossing event to InfluxDB: {e}")

    def end_track(self, camera_id: str, track_id: str):
        """
        Clean up when a track ends.

        Call this when Frigate sends an "end" event for a track.
        """
        key = (camera_id, track_id)

        # Clean up history
        if key in self._centroid_history:
            del self._centroid_history[key]

        # Clean up crossed state
        if key in self._crossed:
            del self._crossed[key]

    def cleanup_stale_tracks(self, max_age_seconds: float = 300):
        """Remove tracks that haven't been updated recently."""
        now = datetime.utcnow().timestamp()
        stale_keys = []

        for key, history in self._centroid_history.items():
            if history:
                last_timestamp = history[-1][0]
                if now - last_timestamp > max_age_seconds:
                    stale_keys.append(key)

        for key in stale_keys:
            if key in self._centroid_history:
                del self._centroid_history[key]
            if key in self._crossed:
                del self._crossed[key]

        if stale_keys:
            logger.debug(f"Cleaned up {len(stale_keys)} stale crossing tracks")

    def get_stats(self) -> dict:
        """Get crossing detector statistics."""
        # Count configured detectors
        total_detectors = len(CROSSING_CONFIGS)
        # All configured detectors are considered active (they process any incoming detections)
        active_detectors = total_detectors

        return {
            "total_crossings": self._total_crossings,
            "detections_processed": self._detection_count,
            "active_tracks": len(self._centroid_history),
            "active_detectors": active_detectors,
            "total_detectors": total_detectors,
            "detectors": {
                name: {
                    "zone": config.get("zone"),
                    "axis": config.get("axis", "y"),
                    "entry_direction": config.get("entry_direction"),
                }
                for name, config in CROSSING_CONFIGS.items()
            },
            "occupancy": self.occupancy.get_stats(),
        }


# Global singleton instance
_crossing_detector: Optional[CrossingDetector] = None


def get_crossing_detector() -> CrossingDetector:
    """Get or create the crossing detector singleton."""
    global _crossing_detector
    if _crossing_detector is None:
        _crossing_detector = CrossingDetector()
        logger.info("CrossingDetector initialized")
    return _crossing_detector
