# Restaurant Analytics Dashboard

Computer vision-powered analytics system for restaurants. Tracks customer flow, staff activity, and occupancy using person re-identification (ReID) across multiple cameras.

## Features

- **Real-time Occupancy Tracking** - Count customers and staff across zones
- **Cross-camera ReID** - Track individuals across 14+ cameras using OSNet embeddings
- **Staff Detection** - Identify staff vs customers via face recognition
- **Zone Analytics** - Track traffic through entrance, seating, kitchen, etc.
- **Historical Reports** - Peak hours, heatmaps, occupancy trends
- **Live Dashboard** - WebRTC streams with detection overlays
- **Incident Management** - Log and track incidents

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, TailwindCSS, Recharts |
| Backend | FastAPI, Python 3.11, SQLAlchemy, PyTorch |
| Database | SQLite (primary), InfluxDB (time-series metrics) |
| ML/CV | OSNet (ReID), Frigate (object detection), TensorRT |
| Messaging | MQTT via Mosquitto |
| Infrastructure | Docker, NVIDIA GPU, WebRTC |

## Quick Start

```bash
# Clone and configure
git clone https://github.com/YOUR_USERNAME/analytics-dashboard.git
cd analytics-dashboard
cp .env.example .env
nano .env  # Edit credentials

# Configure cameras
cp frigate/config/config.example.yml frigate/config/config.yml
nano frigate/config/config.yml  # Add your camera IPs

# Start everything
./scripts/setup.sh

# Open dashboard
open http://localhost:3000
```

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Cameras   │────▶│   Frigate   │────▶│    MQTT     │
│  (14 RTSP)  │     │  (detect)   │     │ (mosquitto) │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                    ┌─────────────┐            │
                    │  InfluxDB   │◀───────────┤
                    │  (metrics)  │            │
                    └─────────────┘            ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Frontend   │◀───▶│   Backend   │◀────│ ReID Worker │
│   (React)   │     │  (FastAPI)  │     │   (OSNet)   │
└─────────────┘     └─────────────┘     └─────────────┘
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Dashboard | 3000 | React frontend |
| API | 8000 | FastAPI backend |
| Frigate | 5000 | NVR with detection |
| InfluxDB | 8086 | Time-series DB |
| MQTT | 1883 | Event messaging |

## Documentation

- [Deployment Guide](docs/DEPLOYMENT.md) - Full setup instructions
- [CLAUDE.md](CLAUDE.md) - Project context and known issues
- [DASHBOARD_PROGRESS.md](DASHBOARD_PROGRESS.md) - Development history

## Scripts

```bash
./scripts/setup.sh      # Initial setup
./scripts/restart.sh    # Restart all services
./scripts/backup-db.sh  # Backup databases
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Service health check |
| `GET /api/cameras` | Camera list and stats |
| `GET /api/reid/persons` | Active tracked persons |
| `GET /api/analytics/occupancy/current` | Current occupancy |
| `GET /api/analytics/peak-hours` | Peak hour analysis |
| `GET /api/debug/memory` | Memory diagnostics |

## License

Private - All rights reserved
