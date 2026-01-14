# Analytics Dashboard - Project Context

## Quick Reference

| Resource | URL/Value |
|----------|-----------|
| **Dashboard** | http://192.168.1.252:3000 or http://dashboard.jangmojib.com |
| **Backend API** | http://192.168.1.252:8000 |
| **Frigate NVR** | http://192.168.1.252:5000 |
| **InfluxDB** | http://192.168.1.252:8086 |
| **Login** | capitalistcookie@gmail.com / admin |
| **Sudo password** | Easyas123!@# |

## Development Principles

**These principles guide all development on this project:**

1. **Prefer optimal, long-term solutions** over quick fixes, even if they take longer to implement
2. **Avoid tech debt** - do it right the first time
3. **Use simple, proven techniques** - avoid over-engineering
4. **Understand root causes before fixing** - diagnose thoroughly, don't guess
5. **Test under real conditions** - fixes aren't verified until tested under actual load
6. **Document everything** - update CLAUDE.md and DASHBOARD_PROGRESS.md after each session

**Anti-patterns to avoid:**
- Band-aid fixes that mask symptoms
- Adding complexity when simplicity works
- Assuming fixes work without load testing (e.g., memory leak appeared fixed when MQTT was disconnected)
- Skipping diagnosis to "just restart it"

## Project Overview

Restaurant analytics system with computer vision for people tracking across 14 cameras. Uses OSNet-based person re-identification (ReID) to maintain consistent person IDs as people move between camera views.

**Key Features:**
- Real-time occupancy tracking
- Person journey visualization across cameras
- Staff recognition via face training
- Zone-based analytics (entrance, seating, kitchen, etc.)
- Incident management and shift notes

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           Docker Compose                                  │
├─────────────┬─────────────┬─────────────┬─────────────┬─────────────────┤
│  Frontend   │   Backend   │   Frigate   │  InfluxDB   │   Mosquitto     │
│  (React)    │  (FastAPI)  │   (NVR)     │  (metrics)  │   (MQTT)        │
│  :3000      │  :8000      │   :5000     │  :8086      │   :1883         │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │  ReID Worker (in-process)  │
        │  - MQTT subscriber         │
        │  - OSNet embeddings        │
        │  - Cross-camera tracking   │
        └────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Recharts |
| Backend | FastAPI, SQLAlchemy, SQLite, InfluxDB, PyTorch |
| ML Model | OSNet (torchreid) for person re-identification |
| Infrastructure | Docker, Docker Compose, Nginx, NVIDIA GPU |

## Key Files

### Backend Core
| File | Purpose |
|------|---------|
| `backend/main.py` | FastAPI app, routes, lifespan events, WebSocket endpoint |
| `backend/reid_worker.py` | MQTT worker, detection processing, person matching, WebSocket broadcasts |
| `backend/reid_service.py` | OSNet model, embedding extraction |
| `backend/models.py` | SQLAlchemy models (TrackedPerson, Staff, etc.) |
| `backend/database.py` | DB connections (SQLite + InfluxDB) |
| `backend/cache.py` | TTL cache with size limits |
| `backend/websocket_manager.py` | WebSocket connection manager for real-time updates |

### Backend Routers
| Router | API Prefix | Purpose |
|--------|------------|---------|
| `reid.py` | `/api/reid` | Person tracking, embeddings, merge/unmerge |
| `staff.py` | `/api/staff` | Staff CRUD, face training |
| `analytics.py` | `/api/analytics` | Occupancy, trends, floor plan positions/flows |
| `cameras.py` | `/api/cameras` | Camera info, snapshots |
| `alerts.py` | `/api/alerts` | Alert configuration |
| `incidents.py` | `/api/incidents` | Incident reports |

### Frontend Components
| Component | Purpose |
|-----------|---------|
| `FloorPlanView.tsx` | SVG floor plan with camera positions and journey paths |
| `JourneyPath.tsx` | Animated SVG path for person journeys |
| `useDashboardWebSocket.ts` | Hook for real-time WebSocket updates |
| `useJourneys.ts` | Hook for MQTT-based journey tracking |

### Frontend Pages
| Page | Route | Purpose |
|------|-------|---------|
| `Dashboard.tsx` | `/` | Main overview with stats |
| `Cameras.tsx` | `/cameras` | Camera grid with live feeds |
| `Analytics.tsx` | `/analytics` | Charts and trends |
| `Staff.tsx` | `/staff` | Staff management |
| `Incidents.tsx` | `/incidents` | Incident reports |
| `Kiosk.tsx` | `/kiosk` | Full-screen display mode |

## Camera Configuration

### Cameras by Zone (Frigate Camera Names)
| Camera ID | Zone | Special Config |
|-----------|------|----------------|
| entrance | entrance | **Entry camera** - creates new person IDs |
| bar_lounge | bar_lounge | **Entry camera** - creates new person IDs |
| seating | seating | Main seating area |
| cashier | cashier | **Rotated 90°** (mounted sideways) |
| vip_room | vip_room | VIP room area |
| karaoke | karaoke | Karaoke room |
| bar | bar | Bar area |
| food_pickup | food_pickup | Food pickup counter |
| kitchen | kitchen | Kitchen view |
| patio | patio | Outdoor patio |
| hallway | hallway | Main hallway |
| back_hallway | back_hallway | Back hallway |
| storage | storage | Storage area |
| office | office | Office |

### Camera Trust Levels
- **ENTRY_CAMERAS**: `entrance`, `bar_lounge` - Can create new person IDs
- **HIGH_TRUST**: `entrance`, `bar_lounge`, `seating`, `cashier`, `food_pickup` - Good angle for embeddings
- **MEDIUM_TRUST**: `vip_room`, `karaoke`, `kitchen`, `patio` - Can match existing persons
- **LOW_TRUST**: `bar` - Top-down view, lower quality ReID
- **STAFF_ONLY**: `bar`, `food_pickup`, `kitchen` - Detections classified as staff if unmatched

## ReID System Configuration

### Environment Variables
```bash
REID_SIMILARITY_THRESHOLD=0.90     # Same camera match threshold
REID_CROSS_CAMERA_THRESHOLD=0.85   # Cross camera match threshold
REID_MIN_MATCH_EMBEDDINGS=2        # Required embeddings to confirm
REID_EMBEDDINGS_PER_PERSON=5       # Max stored per person
REID_MIN_DETECTION_AREA=5000       # Min pixels for detection
REID_MIN_DETECTION_CONFIDENCE=0.60 # Min Frigate confidence (lowered from 0.75)
REID_MIN_DETECTIONS_CONFIRM=3      # Frames before confirming new person
REID_TEMPORAL_EXCLUSION=5          # Seconds - can't be in two places
REID_EMBEDDING_QUALITY_GATE=0.85   # New embedding must match person's average
```

### Memory Limits (Leak Prevention)
```python
MAX_ACTIVE_TRACKS = 50
MAX_CANDIDATES_PER_CAMERA = 10
MAX_COLOR_HISTOGRAMS = 100
MAX_RECENT_EXITS = 25
CACHE_CLEANUP_INTERVAL = 30  # seconds
```

## WebSocket Real-Time Updates

The dashboard uses WebSocket for real-time occupancy updates instead of polling.

### WebSocket Endpoint
- **URL**: `ws://host:8000/ws/dashboard`
- **Protocol**: JSON messages with `type` and `data` fields

### Message Types
| Type | Description |
|------|-------------|
| `occupancy:update` | Current occupancy (total, by_camera, by_zone) |
| `camera:status` | Camera status changes |
| `queue:update` | Queue count updates |

### How It Works
```
Browser ─── WebSocket ───> Backend (/ws/dashboard)
                              │
                              │ Broadcasts from:
                              │ - ReID worker (on person match/create)
                              │ - Periodic task (every 10 seconds)
                              ▼
                         ws_manager.broadcast()
```

### Frontend Integration
- `useDashboardWebSocket` hook manages connection and reconnection
- Falls back to HTTP polling if WebSocket disconnects
- Status indicator shows "Live" (green) or "Polling" (yellow)

### Testing WebSocket
```bash
# Check WebSocket status
curl http://localhost:8000/api/ws/status

# Browser DevTools: Network → WS tab → look for /ws/dashboard
```

## Floor Plan Visualization

Interactive floor plan showing camera positions and person journeys.

### Features
- Draggable camera position editor
- Bidirectional flow connection editor
- Real-time journey path visualization
- MQTT-based live updates

### Data Files
| File | Purpose |
|------|---------|
| `/app/data/camera_positions.json` | Camera X,Y positions on floor plan |
| `/app/data/flow_connections.json` | Camera adjacency connections (used by ReID) |
| `/app/data/flow_connections_backup.json` | Auto-backup before changes |

### API Endpoints
| Endpoint | Purpose |
|----------|---------|
| `GET/PUT /api/analytics/floorplan/positions` | Camera positions |
| `GET/PUT /api/analytics/floorplan/flows` | Flow connections |
| `POST /api/analytics/floorplan/flows/reset` | Reset to defaults |
| `POST /api/analytics/floorplan/flows/restore` | Restore from backup |

### ReID Integration
Flow connections from the UI are used by the ReID ML model for:
- **Exit boost**: Higher match confidence for adjacent cameras
- **Temporal exclusion**: Can't be in non-adjacent places simultaneously
- **Cross-camera tracking**: Predicts where person might appear next

The ReID worker reads from `flow_connections.json` with 60-second cache TTL.

## Debug Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/debug/memory` | Memory usage, object counts, top types |
| `GET /api/health` | Service health check |

### Memory Debug Response
```json
{
  "rss_mb": 1050.3,
  "total_objects": 433358,
  "cache_size": 2,
  "top_object_types": [["function", 80218], ["dict", 64584], ...]
}
```

## Common Commands

### Docker Operations
```bash
# View logs
docker logs analytics-backend -f
docker logs analytics-frontend -f

# Restart services
docker restart analytics-backend
docker-compose up -d --build backend

# Shell into container
docker exec -it analytics-backend bash
```

### Testing
```bash
cd backend
pytest tests/ -v
pytest tests/test_reid.py -v
```

### Memory Monitoring
```bash
# Get memory snapshot
curl -s http://localhost:8000/api/debug/memory | python3 -m json.tool

# Watch memory over time (every 10s)
watch -n 10 'curl -s http://localhost:8000/api/debug/memory | python3 -c "import json,sys; d=json.load(sys.stdin); print(f\"RSS: {d[chr(34)+chr(114)+chr(115)+chr(115)+chr(95)+chr(109)+chr(98)+chr(34)]:.1f}MB\")"'

# Quick health check
curl -s http://localhost:8000/api/health | python3 -m json.tool
```

**Healthy Memory Values:**
- Before model load: ~760 MB
- After OSNet loads: ~1000-1100 MB
- Should NOT grow continuously under load
- If >1500MB, investigate memory leak

# Check cache state
docker exec analytics-backend python3 -c "
from reid_worker import _active_tracks, _candidate_detections
print('Active tracks:', len(_active_tracks))
print('Candidates:', sum(len(v) for v in _candidate_detections.values()))
"
```

## Known Issues & Solutions

### Memory Leak (Fixed - Session 40e)
**Symptoms:** Backend memory grows from 1GB to 4GB+ in minutes, API timeouts
**Root Cause:** PIL Image objects not closed after thumbnail processing
**Fix:** Added `image.close()` in finally blocks in:
- `backend/reid_service.py`
- `backend/reid_worker.py`
- Added bounded cache in `backend/cache.py` (MAX_SIZE=500)
**Verification:** Memory stable at ~1034MB under load

### MQTT Disconnection (Fixed - Session 41)
**Symptoms:** Memory appears stable but zero detections processed, ReID not working
**Root Cause:** Frigate config had `mqtt.host: 127.0.0.1` which points to itself inside container
**Fix:** Changed to `mqtt.host: 172.20.0.2` (mosquitto container IP)
**Config Location:** `/home/claude-user/frigate/config/config.yml`

### Slow Analytics Endpoints (Fixed - Session 40f)
**Symptoms:** /api/analytics/* endpoints timeout after 10s, 2-3 minute response times
**Root Cause:** InfluxDB queries missing `|> group()` before `aggregateWindow()`
**Fix:** Added `|> group()` to consolidate series before windowing
**File:** `backend/services/influxdb_service.py` (3 queries fixed: get_occupancy_history, get_peak_hours, get_day_hour_heatmap)
**Result:** Response time reduced from 3+ minutes to <0.5 seconds

### Frontend subLabel Bug (Fixed - Session 40e)
**Symptoms:** Console error "subLabel.split is not a function"
**Root Cause:** subLabel could be null/undefined
**Fix:** Added type guards in DetectionOverlay.tsx and LabelingModal.tsx

### Camera ID Mismatch - No TrackedPerson Records (Fixed - Session 42)
**Symptoms:** ReID worker running, MQTT connected, but 0 TrackedPerson/PersonSighting records
**Root Cause:** reid_worker.py used internal camera IDs (`cam_009`) but Frigate sends actual names (`entrance`)
**Fix:** Updated camera configuration in `backend/reid_worker.py`:
- `ENTRY_CAMERAS = {"entrance", "bar_lounge"}` (was `{"cam_009"}`)
- `HIGH_TRUST_CAMERAS` updated to use Frigate camera names
- `CAMERA_ZONES` mapping updated
- `MIN_DETECTION_CONFIDENCE` lowered from 0.75 to 0.60
**Note:** Only ENTRY_CAMERAS can create new TrackedPerson records. Other cameras match against existing persons.

### Dwell Time Tracking (Added - Session 42)
**New Feature:** SQLite-based dwell time calculation from PersonSighting data
**Endpoints:**
- `/api/analytics/dwell/summary` - Summary stats
- `/api/analytics/dwell/visit-stats` - Visit duration statistics
- `/api/analytics/dwell/hourly-trend` - 24-hour trend data
**Data Source:** PersonSighting.enter_time and exit_time
**Note:** Data will populate as TrackedPerson records are created (requires entrance camera activity)

### CamHi Cameras (237/238/239) Green Screen
**Symptoms:** Green screen, frame drops, "Error parsing AU headers" in Frigate logs
**Root Cause:** Camera RTSP/H.265 encoder locks up periodically
**Fix:** Power cycle the physical cameras (no web API reboot available)
**Note:** These cameras are prone to this issue; may need periodic power cycles

### Frontend Timeout Errors
**Symptoms:** Dashboard shows 0 cameras, console shows ECONNABORTED
**Possible Causes:**
1. Backend crashed (check `docker logs analytics-backend`)
2. Backend busy loading OSNet model (~10s delay on first detection)
3. Stale nginx connection (restart frontend)
4. Browser cache (hard refresh with Ctrl+Shift+R)
**Quick Check:** `curl http://localhost:8000/api/health`

### Memory Management (Preventive)
The ReID worker has aggressive memory management:
- PIL Images explicitly closed in finally blocks
- Periodic cleanup every 30 seconds
- Hard limits on all caches
- Garbage collection every 50 detections

### MQTT Connection
The ReID worker connects to MQTT at `host.docker.internal:1883` (from backend container).
Frigate connects to mosquitto at `172.20.0.2:1883` (on frigate_default network).

**MQTT Topology:**
```
Frigate (frigate_default network) ---> Mosquitto (172.20.0.2:1883)
                                              |
                                              v (port 1883 exposed on host)
Analytics-Backend (analytics-dashboard_default) --> host.docker.internal:1883
```

**Verify MQTT is working:**
```bash
# Check Frigate is publishing
docker exec mosquitto mosquitto_sub -t "frigate/events" -v -C 1

# Check backend can connect
docker exec analytics-backend python3 -c "
import socket; s=socket.socket(); s.connect(('host.docker.internal', 1883)); print('OK')"
```

If MQTT isn't connected:
- Zero detections will be processed
- Model won't be loaded (lazy loading)
- Memory will appear stable (false positive)

## File Locations

| Resource | Path |
|----------|------|
| SQLite Database | `/app/data/analytics.db` (in container) |
| OSNet Weights | `/app/data/models/osnet_x1_0.pth` |
| Frigate Config | `/home/claude-user/frigate/config/config.yml` |
| Face Training Data | `/mnt/hdd/frigate/clips/faces/` |

## Database Models

### Key Tables
| Model | Purpose |
|-------|---------|
| `TrackedPerson` | Person tracking with display_id, embeddings |
| `PersonEmbedding` | OSNet embeddings per person |
| `PersonSighting` | Zone enter/exit events |
| `Staff` | Staff members with face training |
| `StaffAppearanceEmbedding` | Staff appearance embeddings |
| `Event` | Detection events from Frigate |
| `Incident` | Incident reports |
| `Alert` | Alert notifications |

## Development Notes

### Adding a New Camera
1. Add to `CAMERA_ZONES` dict in `reid_worker.py`
2. Add to `CAMERA_ADJACENCY` graph
3. Set trust level (HIGH/MEDIUM)
4. Configure in Frigate

### Adjusting ReID Thresholds
- Higher threshold = fewer false matches, more ID fragmentation
- Lower threshold = more matches, risk of merging different people
- Test with `/api/reid/persons` to see active tracking

### Frontend Polling
The dashboard polls frequently:
- `/api/reid/persons` - every few seconds
- `/api/analytics/occupancy` - every few seconds
- `/api/health` - every 5 seconds

Consider WebSocket for real-time updates if needed.
