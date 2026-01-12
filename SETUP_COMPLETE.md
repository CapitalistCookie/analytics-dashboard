# Restaurant Analytics Dashboard - Complete Setup Guide

## Overview

A full-stack analytics dashboard for restaurant operations, integrating with Frigate NVR for people tracking, face recognition for staff management, and real-time analytics visualization.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (React + Vite)                      │
│  ┌──────────┬───────────┬────────┬───────┬────────┬───────┬───────┐│
│  │Dashboard │ Analytics │ Search │Cameras│ Staff  │Alerts │ Zones ││
│  └──────────┴───────────┴────────┴───────┴────────┴───────┴───────┘│
│                              │                                       │
│                         Nginx Proxy                                  │
└──────────────────────────────┼───────────────────────────────────────┘
                               │ /api/*
┌──────────────────────────────▼───────────────────────────────────────┐
│                      Backend (FastAPI + Python)                       │
│  ┌──────────────────────────────────────────────────────────────────┐│
│  │ Routers: staff, analytics, search, alerts, auth                  ││
│  └──────────────────────────────────────────────────────────────────┘│
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │   SQLite     │  │   InfluxDB   │  │   Frigate    │               │
│  │   (Config)   │  │ (Time-series)│  │    (NVR)     │               │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Frigate NVR running on port 5000
- InfluxDB (optional) on port 8086

### Start the Dashboard

```bash
cd /home/claude-user/analytics-dashboard

# Build and start containers
docker compose up -d --build

# View logs
docker compose logs -f
```

### Access Points
| Service | URL | Description |
|---------|-----|-------------|
| Dashboard | http://localhost:3000 | Main web interface |
| API Docs | http://localhost:8000/docs | Swagger API documentation |
| API Health | http://localhost:8000/api/health | Health check endpoint |

### First Login
1. Navigate to http://localhost:3000
2. Click "Create one" to register
3. First registered user becomes admin
4. Subsequent users are viewers by default

## Project Structure

```
/home/claude-user/analytics-dashboard/
├── docker-compose.yml              # Container orchestration
├── SETUP_COMPLETE.md               # This documentation
├── DASHBOARD_PROGRESS.md           # Development progress log
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py                     # FastAPI application entry
│   ├── database.py                 # SQLite + InfluxDB connections
│   ├── models.py                   # SQLAlchemy models
│   ├── frigate_service.py          # Frigate API client
│   └── routers/
│       ├── __init__.py
│       ├── staff.py                # Staff CRUD + face training
│       ├── analytics.py            # Analytics data endpoints
│       ├── search.py               # Semantic search endpoints
│       ├── alerts.py               # Alert config + history
│       └── auth.py                 # JWT authentication
│
└── frontend/
    ├── Dockerfile                  # Multi-stage build
    ├── nginx.conf                  # Reverse proxy config
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── postcss.config.js
    └── src/
        ├── main.tsx
        ├── App.tsx                 # Routes + auth wrapper
        ├── index.css
        ├── api/
        │   └── client.ts           # API client + types
        ├── context/
        │   └── AuthContext.tsx     # Authentication state
        ├── components/
        │   ├── Layout/
        │   │   ├── Layout.tsx
        │   │   ├── Sidebar.tsx     # Navigation + logout
        │   │   └── Header.tsx
        │   ├── PhotoUpload.tsx
        │   └── StaffModal.tsx
        └── pages/
            ├── Dashboard.tsx       # Main overview
            ├── Analytics.tsx       # Charts + metrics
            ├── Search.tsx          # Event search
            ├── Cameras.tsx         # Camera grid
            ├── Staff.tsx           # Staff management
            ├── Alerts.tsx          # Alert system
            ├── Zones.tsx           # Zone config
            └── Login.tsx           # Authentication
```

## Features

### UI Theme
The dashboard uses a **dark theme** throughout with:
- Dark gray backgrounds (`bg-gray-800`, `bg-gray-900`)
- Light text (`text-white`, `text-gray-300`)
- Blue accent colors for interactive elements
- Translucent colored badges for severity indicators

### 1. Dashboard (/)
- **Occupancy Card**: Real-time people count
- **System Stats**: Camera status, detections, FPS
- **Recent Detections**: Live event feed with thumbnails
- **Occupancy Chart**: 24-hour trend visualization
- **Camera Grid**: All camera thumbnails

### 2. Analytics (/analytics)
- **Date Range Selector**: Today, This Week, This Month
- **Summary Cards**: Customers, wait time, turnover, efficiency
- **Charts**:
  - Hourly Customer Count (bar chart)
  - Wait Time Trends (line chart)
  - Zone Activity Heat Map
  - Customer vs Staff (pie chart)
  - Staff Performance (progress bars)
  - Table Turnover (bar chart)

### 3. Search (/search)
- **Semantic Search**: Natural language event search via Frigate API
- **Filters Panel**:
  - Camera selection dropdown
  - Object type/label filter (person, car, dog, etc.)
  - Date range picker (start/end dates)
  - Confidence score slider (0-100%)
- **Results Grid**: Thumbnails with camera name, label, time, score
- **Detail Modal**: Full snapshot view, video clips, complete event details
- **Quick Suggestions**: Pre-built search suggestions for common queries

### 4. Cameras (/cameras)
- **Grid View**: All camera thumbnails
- **Status**: Online/offline indicators
- **FPS Display**: Current frame rate
- **Click to Expand**: Individual camera detail view

### 5. Staff (/staff)
- **Staff List**: Table with photos, roles, status
- **Add/Edit Modal**: Form with photo upload
- **Face Training**: Frigate face recognition integration
- **Training Status**: Visual indicators
- **Activity Log**: Staff activity tracking

### 6. Alerts (/alerts)
**Three tabs**: History, Configuration, After-Hours Schedule

- **Alert History Tab**:
  - List with severity badges (Critical, High, Medium, Low)
  - Filter by type and severity
  - Acknowledge individual or all alerts
  - Stats cards: Total, Unacknowledged, Critical, High

- **Configuration Tab**:
  - Alert types: Occupancy, Wait Time, After Hours, Zone Breach
  - Configurable thresholds and conditions
  - Cooldown periods (prevent duplicate alerts)
  - Enable/disable toggle per rule
  - Create, edit, delete configurations

- **After-Hours Schedule Tab**:
  - Day-of-week selection
  - Start/end time configuration
  - Used to trigger after-hours presence alerts

### 7. Zones (/zones)
- **Zone Cards**: View configured zones
- **Zone Types**: Dining, Bar, Kitchen, Entrance
- **Capacity**: Maximum occupancy settings
- **Camera Assignments**: Linked cameras

### 8. Authentication
- **Login Page**: Username or email with password
- **Registration**: Self-registration available
- **JWT Tokens**: 8-hour default expiry (configurable)
- **Protected Routes**: All dashboard routes require authentication
- **Role-Based Access**:
  - **Admin**: Full access, user management, all configurations
  - **Manager**: Alert configuration, staff management
  - **Viewer**: Read-only dashboard access (default for new users)
- **First User**: First registered user automatically becomes admin

## API Endpoints

### Authentication
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | Login (form data) |
| `/api/auth/register` | POST | Register new user |
| `/api/auth/me` | GET | Get current user |
| `/api/auth/refresh` | POST | Refresh token |
| `/api/auth/check` | GET | Check auth status |
| `/api/auth/users` | GET | List users (admin) |

### Core
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/cameras` | GET | List cameras |
| `/api/cameras/{id}` | GET | Camera details |
| `/api/events` | GET | Recent events |

### Staff
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/staff` | GET | List staff |
| `/api/staff` | POST | Create staff |
| `/api/staff/{id}` | PUT | Update staff |
| `/api/staff/{id}` | DELETE | Delete staff |
| `/api/staff/{id}/photo` | POST | Upload photo |
| `/api/staff/{id}/train` | POST | Train face |

### Analytics
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/analytics/summary` | GET | Summary metrics |
| `/api/analytics/hourly-counts` | GET | Hourly data |
| `/api/analytics/zone-activity` | GET | Zone heat map |
| `/api/analytics/staff-performance` | GET | Staff efficiency |
| `/api/analytics/wait-times` | GET | Wait trends |
| `/api/analytics/table-turnover` | GET | Table turnover |

### Search
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/search` | GET | Search events |
| `/api/search/suggestions` | GET | Search suggestions |
| `/api/search/cameras` | GET | Searchable cameras |
| `/api/search/labels` | GET | Object labels |

### Alerts
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/alerts` | GET | Alert history |
| `/api/alerts` | POST | Create alert |
| `/api/alerts/{id}/acknowledge` | POST | Acknowledge |
| `/api/alerts/acknowledge-all` | POST | Acknowledge all |
| `/api/alerts/configs` | GET | List configs |
| `/api/alerts/configs` | POST | Create config |
| `/api/alerts/configs/{id}` | PUT | Update config |
| `/api/alerts/configs/{id}/toggle` | POST | Toggle enable |
| `/api/alerts/schedules` | GET | List schedules |
| `/api/alerts/schedules` | POST | Create schedule |
| `/api/alerts/stats/summary` | GET | Alert stats |

## Configuration

### Environment Variables

#### Backend
| Variable | Default | Description |
|----------|---------|-------------|
| `FRIGATE_URL` | http://localhost:5000 | Frigate NVR URL |
| `INFLUXDB_URL` | http://influxdb:8086 | InfluxDB URL |
| `INFLUXDB_TOKEN` | analytics-token | InfluxDB auth token |
| `INFLUXDB_ORG` | restaurant | InfluxDB organization |
| `INFLUXDB_BUCKET` | analytics | InfluxDB bucket |
| `SQLITE_DATABASE_URL` | sqlite:///./analytics.db | SQLite path |
| `JWT_SECRET_KEY` | (change me) | JWT signing key |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 480 | Token expiry (8h) |

### Production Checklist
- [ ] Change `JWT_SECRET_KEY` to a secure random value
- [ ] Configure CORS origins (currently allows all)
- [ ] Set up HTTPS/TLS
- [ ] Configure InfluxDB with proper token
- [ ] Set up backup for SQLite database
- [ ] Configure webhook URLs for alerts

## Database Schema

### SQLite Tables
- **users**: Authentication accounts
- **staff**: Staff members and face training status
- **zones**: Restaurant zone definitions
- **cameras**: Camera configuration
- **events**: Detection event log
- **alert_configs**: Alert rule configurations
- **alerts**: Alert history/log
- **after_hours_schedules**: After-hours detection schedules

## Troubleshooting

### Container Issues
```bash
# View logs
docker compose logs backend
docker compose logs frontend

# Rebuild containers
docker compose down
docker compose build --no-cache
docker compose up -d

# Reset database
docker compose down
docker volume rm analytics-dashboard_backend-data
docker compose up -d
```

### API Connection Issues
```bash
# Test backend health
curl http://localhost:8000/api/health

# Test Frigate connection
curl http://localhost:5000/api/version
```

### Frontend Issues
- Check browser console (F12) for errors
- Verify API proxy in nginx.conf
- Clear browser cache and reload

### Authentication Issues
- Clear localStorage in browser
- Verify JWT_SECRET_KEY matches
- Check token expiry time

## Development

### Local Backend Development
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Local Frontend Development
```bash
cd frontend
npm install
npm run dev
```

## Testing

### Running Tests

```bash
# Backend unit tests (275 tests)
cd backend && python -m pytest

# Frontend unit tests (78 tests)
cd frontend && npm run test:run

# E2E tests (49 tests)
cd frontend && npm run test:e2e
```

### E2E Test Coverage
- **User Flows**: Login, dashboard, staff, analytics, alerts, incidents, notes, settings, admin
- **Role-Based Access**: Admin, manager, viewer permission verification
- **Kiosk Mode**: Navigation, auto-rotation, keyboard controls
- **Mobile Responsive**: Hamburger menu, sidebar navigation, touch targets
- **Error Handling**: API failures, form validation, network issues

### Test User Accounts
| Username | Password | Role |
|----------|----------|------|
| capitalistcookie@gmail.com | Easyas123!@# | admin |
| e2e_manager | TestManager123 | manager |
| e2e_viewer | TestViewer123 | viewer |

## Version History

| Session | Description | Key Features |
|---------|-------------|--------------|
| 1 | Backend core | FastAPI setup, SQLite + InfluxDB, Frigate integration |
| 2 | Staff management API | CRUD endpoints, face training, photo upload |
| 3 | Frontend core | React + Vite, Tailwind CSS, Recharts, routing |
| 4 | Staff management UI | Staff list, modals, photo upload component |
| 5 | Analytics page | Charts, metrics, date filtering, zone heatmap |
| 6 | Search, Alerts, Auth | JWT auth, semantic search, alert system, dark theme |
| 7-14 | Extended features | Admin, settings, reports, kiosk, shifts, scorecards, incidents, notes |
| 15 | E2E Testing | Playwright setup, 49 E2E tests covering all critical flows |

## Test Summary

**Total Test Coverage: 402 tests**
- Backend: 275 tests (176 unit + 99 integration)
- Frontend Unit: 78 tests
- E2E: 49 tests

## Status: **COMPLETE**

All core features have been implemented and tested. The dashboard is ready for production deployment after configuring environment variables and security settings.
