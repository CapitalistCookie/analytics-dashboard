"""
WebSocket Manager for real-time dashboard updates.

Replaces polling with push-based updates for:
- Occupancy changes
- Camera status
- Queue status
"""

from fastapi import WebSocket
from typing import Set, Dict, Any, Optional
import asyncio
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class WebSocketManager:
    """Manages WebSocket connections and broadcasts."""

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()
        self._last_occupancy: Optional[Dict[str, Any]] = None

    async def connect(self, websocket: WebSocket):
        """Accept and track a new WebSocket connection."""
        await websocket.accept()
        async with self._lock:
            self.active_connections.add(websocket)
        logger.info(f"WebSocket connected. Total connections: {len(self.active_connections)}")

        # Send current state immediately on connect
        if self._last_occupancy:
            try:
                await websocket.send_text(json.dumps({
                    "type": "occupancy:update",
                    "data": self._last_occupancy
                }))
            except Exception:
                pass

    async def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection."""
        async with self._lock:
            self.active_connections.discard(websocket)
        logger.info(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")

    async def broadcast(self, event_type: str, data: Dict[str, Any]):
        """Broadcast a message to all connected clients."""
        if not self.active_connections:
            return

        # Cache occupancy for new connections
        if event_type == "occupancy:update":
            self._last_occupancy = data

        message = json.dumps({
            "type": event_type,
            "data": data,
            "timestamp": datetime.utcnow().isoformat()
        })

        dead_connections: Set[WebSocket] = set()

        async with self._lock:
            for connection in self.active_connections:
                try:
                    await connection.send_text(message)
                except Exception as e:
                    logger.debug(f"Failed to send to WebSocket: {e}")
                    dead_connections.add(connection)

            # Clean up dead connections
            self.active_connections -= dead_connections

        if dead_connections:
            logger.info(f"Removed {len(dead_connections)} dead WebSocket connections")

    @property
    def connection_count(self) -> int:
        """Return number of active connections."""
        return len(self.active_connections)


# Global instance
ws_manager = WebSocketManager()


async def broadcast_occupancy(total: int, by_camera: Dict[str, int], by_zone: Optional[Dict[str, int]] = None):
    """
    Broadcast occupancy update to all connected clients.

    Args:
        total: Total number of active tracks
        by_camera: Count per camera
        by_zone: Optional count per zone
    """
    await ws_manager.broadcast("occupancy:update", {
        "total": total,
        "by_camera": by_camera,
        "by_zone": by_zone or by_camera,
        "timestamp": datetime.utcnow().isoformat()
    })


async def broadcast_camera_status(camera_id: str, status: str, details: Optional[Dict] = None):
    """Broadcast camera status change."""
    await ws_manager.broadcast("camera:status", {
        "camera_id": camera_id,
        "status": status,
        "details": details or {},
        "timestamp": datetime.utcnow().isoformat()
    })


async def broadcast_queue_update(zone: str, count: int, wait_time: Optional[float] = None):
    """Broadcast queue status update."""
    await ws_manager.broadcast("queue:update", {
        "zone": zone,
        "count": count,
        "wait_time": wait_time,
        "timestamp": datetime.utcnow().isoformat()
    })
