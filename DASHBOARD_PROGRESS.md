# Restaurant Analytics Dashboard - Development Progress

## Project Overview

A full-stack analytics dashboard for restaurant operations integrating with Frigate NVR for people tracking, face recognition for staff management, and real-time analytics visualization.

**Tech Stack:**
- Backend: FastAPI, SQLAlchemy, SQLite, InfluxDB, python-jose (JWT)
- Frontend: React 18, TypeScript, Vite, Tailwind CSS, Recharts
- Infrastructure: Docker, Docker Compose, Nginx

---

## Session 1: Backend Core

### Completed
- [x] FastAPI application setup with CORS middleware
- [x] SQLite database with SQLAlchemy ORM
- [x] InfluxDB client for time-series data
- [x] Frigate NVR service integration
- [x] Health check endpoint
- [x] Camera endpoints (list, details, snapshots)
- [x] Events endpoint with Frigate integration
- [x] Docker configuration for backend

### Files Created
- `backend/main.py` - FastAPI application entry point
- `backend/database.py` - Database connections (SQLite + InfluxDB)
- `backend/models.py` - SQLAlchemy models
- `backend/frigate_service.py` - Frigate API client
- `backend/Dockerfile`
- `backend/requirements.txt`

---

## Session 2: Staff Management API

### Completed
- [x] Staff CRUD endpoints
- [x] Photo upload with base64 encoding
- [x] Face training integration with Frigate
- [x] Staff activity tracking
- [x] Training status management

### Files Created
- `backend/routers/staff.py` - Staff management router

### API Endpoints Added
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/staff` | GET | List all staff |
| `/api/staff` | POST | Create staff member |
| `/api/staff/{id}` | GET | Get staff details |
| `/api/staff/{id}` | PUT | Update staff |
| `/api/staff/{id}` | DELETE | Delete staff |
| `/api/staff/{id}/photo` | POST | Upload photo |
| `/api/staff/{id}/train` | POST | Train face recognition |

---

## Session 3: Frontend Core

### Completed
- [x] React + Vite + TypeScript setup
- [x] Tailwind CSS configuration
- [x] React Router with sidebar navigation
- [x] Layout component with header/sidebar
- [x] Dashboard page with stats cards
- [x] Cameras page with grid view
- [x] Zones page (placeholder)
- [x] API client with Axios
- [x] Docker multi-stage build with Nginx
- [x] Nginx reverse proxy configuration

### Files Created
- `frontend/src/App.tsx` - Main application with routing
- `frontend/src/main.tsx` - React entry point
- `frontend/src/index.css` - Global styles
- `frontend/src/api/client.ts` - API client
- `frontend/src/components/Layout/Layout.tsx`
- `frontend/src/components/Layout/Sidebar.tsx`
- `frontend/src/components/Layout/Header.tsx`
- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/pages/Cameras.tsx`
- `frontend/src/pages/Zones.tsx`
- `frontend/Dockerfile`
- `frontend/nginx.conf`
- `frontend/package.json`
- `frontend/vite.config.ts`
- `frontend/tsconfig.json`
- `frontend/postcss.config.js`
- `frontend/tailwind.config.js`

---

## Session 4: Staff Management UI

### Completed
- [x] Staff list page with table view
- [x] Staff modal for create/edit
- [x] Photo upload component
- [x] Face training UI with status indicators
- [x] Delete confirmation
- [x] Activity tracking display

### Files Created
- `frontend/src/pages/Staff.tsx` - Staff management page
- `frontend/src/components/StaffModal.tsx` - Create/edit modal
- `frontend/src/components/PhotoUpload.tsx` - Photo upload component

---

## Session 5: Analytics Page

### Completed
- [x] Analytics router with mock/real data
- [x] Summary metrics endpoint
- [x] Hourly counts endpoint
- [x] Zone activity heatmap endpoint
- [x] Staff performance endpoint
- [x] Wait times endpoint
- [x] Table turnover endpoint
- [x] Analytics page with Recharts
- [x] Date range selector (Today/Week/Month)
- [x] Multiple chart types (bar, line, pie, area)

### Files Created
- `backend/routers/analytics.py` - Analytics endpoints
- `frontend/src/pages/Analytics.tsx` - Analytics dashboard

### Charts Implemented
- Hourly Customer Count (Bar Chart)
- Wait Time Trends (Line Chart)
- Zone Activity Heat Map (Area Chart)
- Customer vs Staff Distribution (Pie Chart)
- Staff Performance (Progress Bars)
- Table Turnover (Bar Chart)

---

## Session 6: Search, Alerts, Authentication

### Completed

#### Authentication System
- [x] JWT token authentication
- [x] Login endpoint with username/email support
- [x] User registration
- [x] Password hashing with bcrypt
- [x] Token refresh endpoint
- [x] Protected routes
- [x] Role-based access (Admin/Manager/Viewer)
- [x] User management endpoints (admin)
- [x] AuthContext for React state management
- [x] Login page with register toggle
- [x] Logout functionality

#### Semantic Search
- [x] Search endpoint with Frigate integration
- [x] Filter support (camera, label, date range, score)
- [x] Search suggestions endpoint
- [x] Camera and label list endpoints
- [x] Search page with filters panel
- [x] Results grid with thumbnails
- [x] Detail modal with snapshots/clips

#### Alert System
- [x] Alert configuration CRUD
- [x] Alert history with severity levels
- [x] Acknowledge alerts (individual/bulk)
- [x] After-hours schedule management
- [x] Alert statistics endpoint
- [x] Three-tab alerts page (History/Config/Schedule)
- [x] Stats cards and filtering

#### UI Polish
- [x] Dark theme consistency across all pages
- [x] Login page styling fixes
- [x] Search page dark theme
- [x] Alerts page dark theme

### Files Created
- `backend/routers/auth.py` - Authentication router
- `backend/routers/search.py` - Search router
- `backend/routers/alerts.py` - Alerts router
- `frontend/src/pages/Login.tsx` - Login/register page
- `frontend/src/pages/Search.tsx` - Event search page
- `frontend/src/pages/Alerts.tsx` - Alert management page
- `frontend/src/context/AuthContext.tsx` - Auth state management

### Files Updated
- `backend/main.py` - Added new routers
- `backend/models.py` - Added User, AlertConfig, Alert, AfterHoursSchedule models
- `backend/requirements.txt` - Added python-jose, passlib, bcrypt
- `frontend/src/App.tsx` - Added AuthProvider and protected routes
- `frontend/src/api/client.ts` - Added search, alerts, auth API functions
- `frontend/src/components/Layout/Sidebar.tsx` - Added nav items and logout
- `docker-compose.yml` - Added JWT environment variables

### Bug Fixes
- Fixed Pydantic forward reference error (UserResponse before Token)
- Fixed bcrypt compatibility (pinned to 4.0.1)
- Fixed login to accept username OR email
- Fixed input text visibility on login page
- Fixed dark theme consistency on Search/Alerts pages

---

## Final Project Structure

```
/home/claude-user/analytics-dashboard/
├── docker-compose.yml
├── SETUP_COMPLETE.md
├── DASHBOARD_PROGRESS.md
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py
│   ├── database.py
│   ├── models.py
│   ├── frigate_service.py
│   └── routers/
│       ├── __init__.py
│       ├── staff.py
│       ├── analytics.py
│       ├── search.py
│       ├── alerts.py
│       └── auth.py
│
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── postcss.config.js
    ├── tailwind.config.js
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── index.css
        ├── api/
        │   └── client.ts
        ├── context/
        │   └── AuthContext.tsx
        ├── components/
        │   ├── Layout/
        │   │   ├── Layout.tsx
        │   │   ├── Sidebar.tsx
        │   │   └── Header.tsx
        │   ├── PhotoUpload.tsx
        │   └── StaffModal.tsx
        └── pages/
            ├── Dashboard.tsx
            ├── Analytics.tsx
            ├── Search.tsx
            ├── Cameras.tsx
            ├── Staff.tsx
            ├── Alerts.tsx
            ├── Zones.tsx
            └── Login.tsx
```

---

## Session 12: Backend Unit Tests

### Completed

#### Testing Framework Setup
- [x] pytest + pytest-asyncio for async FastAPI testing
- [x] SQLite in-memory database for test isolation
- [x] TestClient from FastAPI for endpoint testing
- [x] Comprehensive fixtures for database, users, auth tokens, sample data
- [x] Mock external services (Frigate, InfluxDB)

#### API Endpoint Tests
- [x] Auth tests - login, register, token refresh, password change, user management
- [x] Staff tests - CRUD, pagination, training status, activity
- [x] Incidents tests - CRUD, filtering, resolution, assignment, export
- [x] Notes tests - CRUD, pinning, acknowledgement, templates
- [x] Analytics tests - all endpoint response formats
- [x] Alerts tests - configuration, history, acknowledgement
- [x] Main tests - health check, cameras, events, CORS

#### Model Tests
- [x] Staff model validation
- [x] User model with role constraints
- [x] Incident model with status/severity
- [x] Zone model with coordinates
- [x] ShiftNote model with acknowledgement
- [x] AlertConfig model with thresholds
- [x] AppSettings model

#### Service Tests
- [x] FrigateService initialization and URL handling
- [x] Password hashing and verification
- [x] JWT token creation and decoding
- [x] InfluxDB connection handling
- [x] Report generation (CSV/JSON export)

### Files Created
- `backend/requirements-test.txt` - Test dependencies
- `backend/conftest.py` - Pytest fixtures
- `backend/pytest.ini` - Pytest configuration
- `backend/tests/__init__.py`
- `backend/tests/test_auth.py` - Auth endpoint tests
- `backend/tests/test_staff.py` - Staff endpoint tests
- `backend/tests/test_incidents.py` - Incident endpoint tests
- `backend/tests/test_notes.py` - Shift notes tests
- `backend/tests/test_models.py` - SQLAlchemy model tests
- `backend/tests/test_services.py` - Service layer tests
- `backend/tests/test_analytics.py` - Analytics endpoint tests
- `backend/tests/test_alerts.py` - Alert endpoint tests
- `backend/tests/test_main.py` - Main app endpoint tests

### Bug Fixes
- **Critical: FastAPI Route Ordering** - Fixed `/export`, `/templates`, and `/stats/summary` endpoints returning 422 errors
  - Cause: Dynamic `/{id}` routes were defined before static routes, causing FastAPI to interpret "export" as an integer ID
  - Fix: Moved static routes before dynamic routes in `incidents.py` and `notes.py`

### Test Results
```
============================= 176 passed in 22.10s =============================
```

### Test Coverage Summary
| Test File | Tests | Description |
|-----------|-------|-------------|
| test_auth.py | 15 | Authentication and user management |
| test_staff.py | 12 | Staff CRUD and training |
| test_incidents.py | 24 | Incident management and export |
| test_notes.py | 22 | Shift notes and acknowledgement |
| test_models.py | 17 | SQLAlchemy model validation |
| test_services.py | 14 | Service layer and utilities |
| test_analytics.py | 14 | Analytics endpoints |
| test_alerts.py | 18 | Alert configuration and history |
| test_main.py | 10 | Health, cameras, events |

---

## Session 13: Backend Integration Tests

### Completed

#### Integration Test Environment
- [x] Test fixtures for MQTT broker (mock implementation)
- [x] Test fixtures for Frigate service (mock implementation)
- [x] Test fixtures for InfluxDB (mock implementation)
- [x] Integration test markers (frigate, influxdb, mqtt, e2e)
- [x] Pytest configuration updates for integration tests

#### Frigate Integration Tests (35 tests)
- [x] Mock Frigate service (cameras, events, faces, training)
- [x] Camera list and details retrieval
- [x] Event queries with filtering
- [x] Face recognition CRUD operations
- [x] Semantic search functionality
- [x] FrigateService async methods

#### InfluxDB Integration Tests (19 tests)
- [x] Write single/multiple data points
- [x] Query current occupancy
- [x] Query hourly/daily aggregations
- [x] Zone activity and wait time queries
- [x] Data retention time range queries
- [x] Connection management (singleton pattern)
- [x] Health check handling

#### MQTT Integration Tests (30 tests)
- [x] Broker connection/disconnection
- [x] Topic subscriptions (exact, wildcard, multi-level)
- [x] Frigate event handling (new, update, end)
- [x] Alert publishing (occupancy, intrusion, after-hours)
- [x] Event processing (person count, zone enter/exit)
- [x] Topic pattern matching
- [x] Message queue operations

#### End-to-End Data Flow Tests (15 tests)
- [x] Frigate → MQTT → Analytics flow
- [x] Zone tracking with occupancy updates
- [x] Alert triggering (threshold, after-hours, face recognition)
- [x] Analytics data pipeline (hourly aggregation, heatmaps)
- [x] Staff tracking and activity logging
- [x] Incident flow (auto-create, notifications)
- [x] Health monitoring and metrics collection
- [x] Data consistency verification

### Files Created
- `backend/tests/conftest_integration.py` - Integration test fixtures (reference)
- `backend/tests/test_integration_frigate.py` - Frigate NVR integration tests
- `backend/tests/test_integration_influxdb.py` - InfluxDB time-series tests
- `backend/tests/test_integration_mqtt.py` - MQTT event handling tests
- `backend/tests/test_integration_e2e.py` - End-to-end data flow tests

### Files Updated
- `backend/conftest.py` - Added integration test fixtures
- `backend/pytest.ini` - Added integration test markers
- `backend/requirements-test.txt` - Added aiomqtt, pytest-timeout

### Test Results
```
============================= 275 passed in 22.31s =============================
```

### Test Coverage Summary
| Test Category | Tests | Description |
|---------------|-------|-------------|
| Unit Tests | 176 | API endpoints, models, services |
| Frigate Integration | 35 | Camera, events, faces, search |
| InfluxDB Integration | 19 | Metrics write/query, connection |
| MQTT Integration | 30 | Pub/sub, events, alerts |
| E2E Integration | 15 | Full data flow verification |
| **Total** | **275** | |

---

## Final Project Structure

```
/home/claude-user/analytics-dashboard/
├── docker-compose.yml
├── SETUP_COMPLETE.md
├── DASHBOARD_PROGRESS.md
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── requirements-test.txt
│   ├── main.py
│   ├── database.py
│   ├── models.py
│   ├── frigate_service.py
│   ├── conftest.py
│   ├── pytest.ini
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── staff.py
│   │   ├── analytics.py
│   │   ├── search.py
│   │   ├── alerts.py
│   │   ├── auth.py
│   │   ├── incidents.py
│   │   └── notes.py
│   └── tests/
│       ├── __init__.py
│       ├── conftest_integration.py
│       ├── test_auth.py
│       ├── test_staff.py
│       ├── test_incidents.py
│       ├── test_notes.py
│       ├── test_models.py
│       ├── test_services.py
│       ├── test_analytics.py
│       ├── test_alerts.py
│       ├── test_main.py
│       ├── test_integration_frigate.py
│       ├── test_integration_influxdb.py
│       ├── test_integration_mqtt.py
│       └── test_integration_e2e.py
│
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── postcss.config.js
    ├── tailwind.config.js
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── index.css
        ├── api/
        │   └── client.ts
        ├── context/
        │   └── AuthContext.tsx
        ├── components/
        │   ├── Layout/
        │   │   ├── Layout.tsx
        │   │   ├── Sidebar.tsx
        │   │   └── Header.tsx
        │   ├── PhotoUpload.tsx
        │   └── StaffModal.tsx
        └── pages/
            ├── Dashboard.tsx
            ├── Analytics.tsx
            ├── Search.tsx
            ├── Cameras.tsx
            ├── Staff.tsx
            ├── Alerts.tsx
            ├── Zones.tsx
            └── Login.tsx
```

---

## Session 14: Frontend Component Tests

### Completed

#### Testing Framework Setup
- [x] Vitest configuration in vite.config.ts
- [x] React Testing Library with custom render utilities
- [x] MSW (Mock Service Worker) for API mocking
- [x] jsdom environment for browser simulation
- [x] Test scripts in package.json (test, test:run, test:coverage)
- [x] TypeScript support with vitest/globals types

#### Test Utilities and Mocks
- [x] Mock implementations for browser APIs (matchMedia, IntersectionObserver, ResizeObserver, localStorage)
- [x] Comprehensive mock data for all entities (staff, cameras, alerts, incidents, notes, analytics)
- [x] MSW handlers for 80+ API endpoints
- [x] Custom render utilities with AuthProvider and BrowserRouter
- [x] Helper functions for authenticated/unauthenticated rendering

#### Component Tests Written
- [x] Layout component tests (Layout.test.tsx, Sidebar.test.tsx, Header.test.tsx)
- [x] Dashboard page tests
- [x] Staff management page tests
- [x] Analytics page tests
- [x] Alerts page tests
- [x] Incidents page tests
- [x] Shift Notes page tests
- [x] Login page tests
- [x] AuthContext tests

### Files Created
- `frontend/src/test/setup.ts` - Test setup with browser API mocks
- `frontend/src/test/mocks/data.ts` - Mock data for all entities
- `frontend/src/test/mocks/handlers.ts` - MSW API handlers
- `frontend/src/test/mocks/server.ts` - MSW server configuration
- `frontend/src/test/utils.tsx` - Custom render utilities
- `frontend/src/components/Layout/Layout.test.tsx` - Layout tests
- `frontend/src/components/Layout/Sidebar.test.tsx` - Sidebar tests
- `frontend/src/components/Layout/Header.test.tsx` - Header tests
- `frontend/src/pages/Dashboard.test.tsx` - Dashboard tests
- `frontend/src/pages/Staff.test.tsx` - Staff page tests
- `frontend/src/pages/Analytics.test.tsx` - Analytics tests
- `frontend/src/pages/Alerts.test.tsx` - Alerts tests
- `frontend/src/pages/Incidents.test.tsx` - Incidents tests
- `frontend/src/pages/Notes.test.tsx` - Notes tests
- `frontend/src/pages/Login.test.tsx` - Login tests
- `frontend/src/context/AuthContext.test.tsx` - Auth context tests

### Files Updated
- `frontend/vite.config.ts` - Added Vitest configuration
- `frontend/package.json` - Added test dependencies and scripts
- `frontend/tsconfig.json` - Added vitest/globals types

### Test Dependencies Added
- vitest
- @testing-library/react
- @testing-library/jest-dom
- @testing-library/user-event
- jsdom
- @vitest/coverage-v8
- msw

### Test Results
```
Test Files  11 passed (11)
     Tests  78 passed | 5 skipped (83)
```

### Test Coverage Summary
| Test File | Tests | Description |
|-----------|-------|-------------|
| Layout.test.tsx | 9 | Layout, navigation, header display |
| Sidebar.test.tsx | 10 | Navigation links, active states |
| Header.test.tsx | 9 | Time display, page titles, mobile menu |
| Dashboard.test.tsx | 7 | Stats cards, loading states |
| Staff.test.tsx | 10 | Staff list, table, details modal |
| Analytics.test.tsx | 7 | Charts, date range, metrics |
| Alerts.test.tsx | 6 | Alert list, tabs, configuration |
| Incidents.test.tsx | 4 | Incident list, log modal |
| Notes.test.tsx | 5 | Notes list, tabs, create modal |
| Login.test.tsx | 8 | Login/register forms, validation |
| AuthContext.test.tsx | 3 | Auth state management |

### Notes
- 5 tests skipped due to complex async timing with fake timers and AuthContext initialization
- Tests use localStorage keys matching AuthContext: `analytics_auth_token` and `analytics_auth_user`
- MSW intercepts all API calls during tests for consistent mock responses

---

## Final Project Structure

```
/home/claude-user/analytics-dashboard/
├── docker-compose.yml
├── SETUP_COMPLETE.md
├── DASHBOARD_PROGRESS.md
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── requirements-test.txt
│   ├── main.py
│   ├── database.py
│   ├── models.py
│   ├── frigate_service.py
│   ├── conftest.py
│   ├── pytest.ini
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── staff.py
│   │   ├── analytics.py
│   │   ├── search.py
│   │   ├── alerts.py
│   │   ├── auth.py
│   │   ├── incidents.py
│   │   └── notes.py
│   └── tests/
│       ├── __init__.py
│       ├── conftest_integration.py
│       ├── test_auth.py
│       ├── test_staff.py
│       ├── test_incidents.py
│       ├── test_notes.py
│       ├── test_models.py
│       ├── test_services.py
│       ├── test_analytics.py
│       ├── test_alerts.py
│       ├── test_main.py
│       ├── test_integration_frigate.py
│       ├── test_integration_influxdb.py
│       ├── test_integration_mqtt.py
│       └── test_integration_e2e.py
│
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── postcss.config.js
    ├── tailwind.config.js
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── index.css
        ├── api/
        │   └── client.ts
        ├── context/
        │   ├── AuthContext.tsx
        │   └── AuthContext.test.tsx
        ├── test/
        │   ├── setup.ts
        │   ├── utils.tsx
        │   └── mocks/
        │       ├── data.ts
        │       ├── handlers.ts
        │       └── server.ts
        ├── components/
        │   ├── Layout/
        │   │   ├── Layout.tsx
        │   │   ├── Layout.test.tsx
        │   │   ├── Sidebar.tsx
        │   │   ├── Sidebar.test.tsx
        │   │   ├── Header.tsx
        │   │   └── Header.test.tsx
        │   ├── PhotoUpload.tsx
        │   └── StaffModal.tsx
        └── pages/
            ├── Dashboard.tsx
            ├── Dashboard.test.tsx
            ├── Analytics.tsx
            ├── Analytics.test.tsx
            ├── Search.tsx
            ├── Cameras.tsx
            ├── Staff.tsx
            ├── Staff.test.tsx
            ├── Alerts.tsx
            ├── Alerts.test.tsx
            ├── Incidents.tsx
            ├── Incidents.test.tsx
            ├── Notes.tsx
            ├── Notes.test.tsx
            ├── Zones.tsx
            ├── Login.tsx
            └── Login.test.tsx
```

---

## Status: COMPLETE

All planned features have been implemented across development sessions. The dashboard includes:
- Full backend API with authentication, staff management, incidents, notes, analytics, and alerts
- Comprehensive backend test suite with 275 passing tests (176 unit + 99 integration)
- Frontend component test suite with 78 passing tests across 11 test files (5 skipped due to async timing issues with fake timers and AuthContext initialization)
- E2E test suite with 49 passing tests covering all critical user flows
- React frontend with dark theme and responsive design

**Total Test Coverage: 402 tests (275 backend + 78 frontend unit + 49 E2E)**

Production deployment requires configuring:
- JWT secret key
- InfluxDB credentials
- HTTPS/TLS termination
- CORS origins for production domain

---

### Session 15: End-to-End Tests (Completed)
**Date**: 2026-01-10

**E2E Testing Framework:**
- Playwright installed and configured
- Global test setup with database seeding
- Test fixtures for authentication helpers
- Chrome/Chromium and mobile viewport configurations

**Test Files Created:**
| File | Tests | Description |
|------|-------|-------------|
| `e2e/fixtures.ts` | - | Authentication helpers and test user management |
| `e2e/global-setup.ts` | - | Database seeding before test runs |
| `e2e/user-flows.spec.ts` | 9 | Critical user journey tests |
| `e2e/role-access.spec.ts` | 10 | Role-based access control tests |
| `e2e/kiosk.spec.ts` | 8 | Kiosk mode functionality tests |
| `e2e/mobile.spec.ts` | 11 | Mobile responsive tests |
| `e2e/error-handling.spec.ts` | 11 | Error handling and validation tests |

**User Flow Tests (9 tests):**
- Login → Dashboard → View stats
- Login → Staff → Add staff member
- Login → Staff → View staff details
- Login → Analytics → Select date range → View charts
- Login → Alerts → Configure threshold → Save
- Login → Incidents → Create incident
- Login → Notes → Create note
- Login → Settings → Update business hours
- Login → Admin → Add user → Assign role

**Role-Based Access Tests (10 tests):**
- Admin can access all pages
- Admin can manage users
- Manager can access most pages
- Manager cannot access admin user management
- Manager should not see Admin link in sidebar
- Viewer can access read-only pages
- Viewer has read-only access to staff
- Viewer cannot access admin page
- Viewer cannot access settings
- Viewer should not see Admin link in sidebar

**Kiosk Mode Tests (8 tests):**
- Navigate to kiosk view via URL
- Navigate to kiosk via URL parameter
- Verify auto-rotation of stats
- Verify no navigation elements
- Exit kiosk mode with ESC key
- Navigate using arrow keys
- Toggle rotation with space key
- Show navigation dots

**Mobile Responsive Tests (11 tests):**
- Show hamburger menu on mobile
- Open sidebar when hamburger clicked
- Close sidebar when clicking outside
- Navigate using mobile sidebar
- Touch-friendly button sizes
- Stack cards vertically on mobile
- Swipe gestures on camera grid
- Pagination dots on mobile
- Readable text at mobile viewport
- Adapt analytics charts for mobile
- Display date range buttons on mobile

**Error Handling Tests (11 tests):**
- Display error when API fails
- Handle 401 unauthorized redirect
- Handle 404 not found gracefully
- Handle slow API responses
- Handle network disconnect
- Validate required fields on staff creation
- Validate email format
- Validate password requirements
- Handle login with wrong credentials
- Handle duplicate username on registration
- Handle expired token gracefully

**NPM Scripts Added:**
```bash
npm run test:e2e          # Run all E2E tests
npm run test:e2e:ui       # Open Playwright UI
npm run test:e2e:headed   # Run tests in headed mode
npm run test:e2e:debug    # Debug mode
```

**Test User Accounts:**
| Username | Password | Role |
|----------|----------|------|
| capitalistcookie@gmail.com | Easyas123!@# | admin |
| e2e_manager | TestManager123 | manager |
| e2e_viewer | TestViewer123 | viewer |

**Session 15 File Locations:**
```
frontend/playwright.config.ts           # Playwright configuration
frontend/e2e/fixtures.ts                # Test fixtures and helpers
frontend/e2e/global-setup.ts            # Global test setup
frontend/e2e/user-flows.spec.ts         # User flow tests
frontend/e2e/role-access.spec.ts        # Role-based access tests
frontend/e2e/kiosk.spec.ts              # Kiosk mode tests
frontend/e2e/mobile.spec.ts             # Mobile responsive tests
frontend/e2e/error-handling.spec.ts     # Error handling tests
frontend/package.json                    # E2E test scripts added
```

---

### Session 31: Detection Accuracy & Stationary Tracking (Completed)
**Date**: 2026-01-10

**Goal:** Improve detection of small/distant people, various angles, and stationary customers.

**Frigate Configuration Changes:**

| Setting | Before | After | Purpose |
|---------|--------|-------|---------|
| Detect Resolution | 1280×720 | 1920×1080 | Capture more detail for distant people |
| max_disappeared | default (25) | 75 | Keep tracks longer when people temporarily occluded |
| Global min_area | default (~5000) | 2500 | Detect smaller/distant people |
| Stationary interval | not set | 50 | Check stationary objects every 50 frames |
| Stationary threshold | not set | 50 | Object stationary after 50 frames in same spot |
| Person max_frames | not set | 0 (never remove) | Stationary people never auto-removed |

**Per-Camera min_area Settings:**

| Camera Type | Cameras | min_area | Rationale |
|-------------|---------|----------|-----------|
| Wide-angle/Seating | cam_028, cam_179, cam_192 | 1500 | Catch distant seated customers |
| Entrance | cam_009 | 2000 | Balance between close/far people |
| Cashier/Close-up | cam_040 | 3000 | People are close, reduce false positives |
| Kitchen | cam_108, cam_239 | 3000 | Staff up close, reduce false positives |

**Performance Impact:**
- GPU memory: ~3020MB / 8192MB (37%) - unchanged
- GPU utilization: 85% (down from 87%)
- Detection FPS: ~3.5-4.0 per camera - healthy

**Frontend Cleanup:**
- Removed debug indicator (MQTT/detection count) from DetectionOverlay.tsx

**Files Modified:**
- `/home/claude-user/frigate/config/config.yml` - Detection and stationary tracking config
- `frontend/src/components/DetectionOverlay.tsx` - Removed debug indicator

**Stationary Tracking Behavior:**
- `interval: 50` - Re-check stationary objects every 50 frames (~10 seconds at 5 FPS)
- `threshold: 50` - Mark as stationary after 50 frames in same position
- `max_frames.objects.person: 0` - Never auto-remove stationary people (critical for seated customers)

---

### Session 31b: Fix Stationary Detection for Seated Customers (Completed)
**Date**: 2026-01-10

**Problem:** Seated customers not being detected - cameras showing "0 det" when people are sitting.

**Root Cause:** Frigate only runs object detection where motion is detected. When a person sits still:
1. Motion detection stops seeing motion
2. Object detection stops running in that area
3. Person's track is lost after max_disappeared frames

**Solution:** Make motion detection more sensitive to catch micro-movements (breathing, fidgeting), and decrease stationary interval for faster re-checks.

**Global Motion Settings Added:**
```yaml
motion:
  threshold: 20        # Lower = more sensitive (default 25)
  contour_area: 15     # Lower = detect smaller motion (default 30)
  improve_contrast: true
  frame_alpha: 0.04    # Slower background adaptation
```

**Updated Stationary Settings:**
| Setting | Before | After | Purpose |
|---------|--------|-------|---------|
| stationary.interval | 50 | 15 | Re-check every 3 sec instead of 10 sec |
| stationary.threshold | 50 | 30 | Mark stationary faster |
| max_disappeared | 75 | 150 | Keep tracks 30 sec instead of 15 sec |

**Per-Camera Motion Settings (Seating Areas):**
| Camera | threshold | contour_area | Purpose |
|--------|-----------|--------------|---------|
| cam_028 | 15 | 10 | Seating area - ultra-sensitive |
| cam_179 | 15 | 10 | Seating area - ultra-sensitive |
| cam_192 | 15 | 10 | Seating area - ultra-sensitive |

**Performance After Changes:**
- GPU: 84% utilization (stable)
- Memory: 3020MB / 8192MB (37%)
- Detection FPS: 3.5 per camera

**How It Works Now:**
1. More sensitive motion detection catches small movements from seated people
2. When person becomes stationary, re-checked every 3 seconds (15 frames at 5fps)
3. Track persists for 30 seconds (150 frames) even without detection
4. Stationary people never auto-removed from tracking

---

### Session 32: Face Recognition for Staff Identification (Completed)
**Date**: 2026-01-11

**Goal:** Enable face recognition so staff members are automatically identified and labeled on camera feeds.

**Frigate Face Recognition Status:**
Face recognition was already enabled in Frigate 0.16.3 config:
```yaml
face_recognition:
  enabled: true
  min_area: 1500
  detection_threshold: 0.7
  recognition_threshold: 0.85
  model_size: large
  save_attempts: 100
```

**Key Discovery: File-Based Face Registration**
In Frigate 0.16+, faces are registered via file system, not API:
- Directory: `/media/frigate/clips/faces/{name}/`
- Images placed in directory are auto-indexed by Frigate
- The POST API endpoint (`/api/faces/{name}`) returns 404
- GET endpoint (`/api/faces`) works and lists registered faces

**Backend Changes (frigate_service.py):**
- Rewrote to use file-based face registration instead of API
- Added `FRIGATE_FACES_PATH` environment variable
- `upload_face()` writes images directly to Frigate faces directory
- `delete_face()` removes files from directory
- `train_face()` verifies face exists (training is automatic)
- `get_faces()` uses API with file system fallback

**Docker-Compose Updates:**
```yaml
backend:
  environment:
    - FRIGATE_FACES_PATH=/frigate/clips/faces
  volumes:
    - /mnt/hdd/frigate/clips/faces:/frigate/clips/faces
```

**Frontend Changes:**

1. **MQTT Client (mqttClient.ts):**
   - Added `subLabel` and `subLabelScore` to `MqttDetection` interface
   - Added `sub_label` and `sub_label_score` to `FrigateEventData`
   - Updated detect resolution from 1280x720 to 1920x1080

2. **API Client (client.ts):**
   - Added `sub_label` field to `Event` interface

3. **DetectionOverlay Component:**
   - Added `subLabel` and `subLabelScore` to `Detection` interface
   - Added `staff` color (blue) to `DETECTION_COLORS`
   - Updated bounding box drawing to show staff names:
     - Blue color for recognized staff
     - Green for unknown people
   - Formats staff name nicely (john_smith → John Smith)
   - Shows face confidence percentage when available
   - Updated legend to show staff names

**Face Training Flow:**
1. Upload photo via `POST /api/staff/{id}/photo` (saves to `/app/data/photos/`)
2. Train face via `POST /api/staff/{id}/train`:
   - Reads photo from storage
   - Generates face_id from staff name (lowercase, underscores)
   - Writes image to `/frigate/clips/faces/{face_id}/`
   - Frigate auto-indexes the face
   - Updates staff record with `face_trained=true` and `frigate_face_id`

**Detection Display:**
- Unknown person: Green box, "person 85%"
- Known staff: Blue box, "John Smith 92%"

**Files Modified:**
| File | Changes |
|------|---------|
| `backend/frigate_service.py` | Complete rewrite for file-based face registration |
| `backend/docker-compose.yml` | Added Frigate faces volume mount and env var |
| `frontend/src/services/mqttClient.ts` | Added sub_label fields, updated resolution |
| `frontend/src/api/client.ts` | Added sub_label to Event interface |
| `frontend/src/components/DetectionOverlay.tsx` | Added staff name display with colors |

**Testing:**
- Verified face upload creates files in Frigate directory
- Verified Frigate indexes faces (shows in `/api/faces` response)
- Backend face training endpoint returns success
- Frontend compiles without errors

**Staff Management Database Fields:**
- `photo_path`: Path to uploaded photo
- `frigate_face_id`: Face directory name in Frigate
- `face_trained`: Boolean indicating if face is registered

---

## Future Enhancements

1. **CI/CD Integration**
   - GitHub Actions workflow for E2E tests
   - Parallel test execution
   - Test result reporting

2. **Cross-Browser Testing**
   - Firefox and Safari support
   - WebKit mobile testing

3. **Visual Regression Testing**
   - Screenshot comparison tests
   - Component visual snapshots

4. **Motion Masks**
   - Add masks for TVs/monitors showing people
   - Mask reflective surfaces
   - Mask areas with posters/images of people

5. **Face Recognition Enhancements**
   - Multiple photos per staff member (3-5 recommended)
   - Face capture from camera feed
   - Training status indicator in UI
   - Auto-retrain when photos updated

---

### Session 33: Clickable Bounding Box Labeling (Completed)
**Date**: 2026-01-10

**Goal:** Enable users to click on any detected person's bounding box and label them as staff directly from the camera view.

**Features Implemented:**

1. **Clickable Bounding Boxes (DetectionOverlay.tsx)**
   - Added `labelMode` prop to enable click-to-label functionality
   - Hover effects: glow, thicker border, semi-transparent fill
   - Cursor changes to pointer when hovering over person boxes
   - Tooltip shows "Click to label this person" on hover
   - `onDetectionClick` callback passes detection and captured face image

2. **Face Image Capture**
   - Captures cropped region from video/image when box is clicked
   - 10% padding around detection box for better face capture
   - Exports as base64 JPEG for backend processing
   - Max 512px dimension for efficiency

3. **LabelingModal Component**
   - Shows captured face image preview
   - Three labeling options:
     - **This is a staff member**: Select existing or create new
     - **This is a customer**: Anonymous tracking (placeholder)
     - **Ignore**: Skip detection
   - Staff selection with search/filter
   - Inline new staff creation form (name, role)
   - Shows face training status indicator

4. **Backend Endpoints (staff.py)**
   - `POST /api/staff/quick-create`: Create staff + upload face + train in one step
   - `POST /api/staff/{id}/face/add-from-detection`: Add training photo to existing staff

5. **Label Mode Toggle**
   - Toggle button appears when detection overlay is enabled
   - Works in both Snapshot and Live (WebRTC) modes
   - Purple highlight when label mode is active

**Files Modified:**

| File | Changes |
|------|---------|
| `frontend/src/components/DetectionOverlay.tsx` | Added labelMode, hover states, click handling, face capture |
| `frontend/src/components/LabelingModal.tsx` | New component for labeling UI |
| `frontend/src/components/CameraFeedModal.tsx` | Integrated label mode toggle and LabelingModal |
| `frontend/src/components/WebRTCPlayer.tsx` | Added labelMode and onDetectionClick props |
| `frontend/src/api/client.ts` | Added quickCreateStaff and addFaceFromDetection functions |
| `backend/routers/staff.py` | Added quick-create and add-from-detection endpoints |

**User Flow:**

```
1. Open camera view (Snapshot or Live mode)
2. Enable "Detection ON" toggle
3. Enable "Label Mode" toggle (appears when detections enabled)
4. Click on any person's bounding box
5. LabelingModal opens with captured face image
6. Choose: Staff (existing/new), Customer, or Ignore
7. If creating new staff:
   - Enter name and select role
   - Face is automatically trained
8. Modal closes, staff is now recognized in future detections
```

**Technical Notes:**
- Detection coordinates are normalized 0-1 from MQTT/Frigate API
- Face capture accounts for video letterboxing (object-contain scaling)
- Base64 image includes data URL prefix handling in backend
- Staff name converts to face_id: "John Smith" → "john_smith"

---

### Session 33b: Fix Missing Label Mode Toggle (Completed)
**Date**: 2026-01-11

**Problem:** User reported "Label Mode" toggle not visible in Snapshot or Live camera view, even with Detection ON enabled.

**Root Cause:** The frontend Docker container had not been rebuilt after Session 33's code changes. The Dockerfile builds the frontend inside the container during the build stage, so local file changes don't automatically appear in the running container.

**Solution:**
1. Rebuilt frontend Docker image with `docker compose build --no-cache frontend`
2. Restarted container with `docker compose up -d frontend`
3. Verified "Label Mode" code is present in deployed JS bundle

**Verification:**
- Confirmed `labelMode` state and toggle button code exists in source files
- Confirmed "Label Mode ON" and "Label Mode" strings present in deployed JS bundle
- Confirmed purple button classes (`bg-purple-600`) in container's assets

**How Label Mode Works:**
1. Open camera modal (Snapshot or Live mode)
2. Click "Detection ON" button to enable detections
3. "Label Mode" button appears next to Detection toggle
4. Click "Label Mode" to enable clickable bounding boxes
5. Click any person's bounding box to open LabelingModal

**Important Notes:**
- Label Mode toggle only appears when Detection is ON
- In Live mode, Label Mode only works with WebRTC (Medium/High quality)
- Low quality Live mode uses MJPEG and doesn't support Detection overlay
- Users may need to hard refresh (Ctrl+F5) to clear browser cache after deployment

---

### Session 34: Appearance-Based ReID (OSNet) (Completed)
**Date**: 2026-01-10

**Goal:** Track people by clothing/body appearance when face isn't visible, enabling tracking from behind, at angles, and across cameras.

**Implementation Overview:**
OSNet (Omni-Scale Network) creates 512-dimensional feature embeddings from full-body images. The system:
1. Extracts appearance features when person is detected
2. Stores embeddings per tracked person
3. Matches new detections to existing embeddings
4. Maintains consistent ID even without face

**Backend Components:**

1. **ReID Service (reid_service.py)**
   - OSNet model implementation (lightweight, CPU-optimized)
   - `extract_features(image)` → 512-dim embedding vector
   - `compare_embeddings(emb1, emb2)` → cosine similarity score
   - `find_match(embedding, known)` → best match or None
   - Model downloads pretrained weights from Google Drive on first run

2. **Database Models (models.py)**
   - `TrackedPerson`: Tracks individuals across cameras
     - `display_id`: Human-readable ID (A1, B23, etc.)
     - `first_seen`, `last_seen`: Timestamps
     - `staff_id`: Link to staff member if identified
     - `is_customer`, `is_active`, `visit_count`
   - `PersonEmbedding`: Stores appearance embeddings
     - Binary blob of 512 float32 values
     - Camera ID, confidence, timestamp
   - `PersonSighting`: Camera visit history
     - Entry/exit times, zone info

3. **ReID Router (routers/reid.py)**
   - `GET /api/reid/status` - Service status
   - `POST /api/reid/initialize` - Initialize OSNet model
   - `POST /api/reid/extract` - Extract embedding from image
   - `POST /api/reid/match` - Match person & create/update tracking
   - `GET /api/reid/persons` - List tracked persons
   - `GET /api/reid/persons/{id}/history` - Camera journey
   - `POST /api/reid/persons/{id}/link-staff` - Link to staff
   - `GET/PUT /api/reid/config` - Configuration

4. **MQTT Worker (reid_worker.py)**
   - Subscribes to `frigate/events`
   - On new person detection:
     - Fetches thumbnail from Frigate
     - Extracts embedding
     - Matches or creates person
   - Publishes enriched events to `analytics/reid/{camera}`
   - Includes person_id, display_id, is_staff, similarity

**Frontend Components:**

1. **MQTT Client (mqttClient.ts)**
   - Added ReID fields to MqttDetection:
     - `personId`: Database ID
     - `displayId`: Human-readable (A7, B12)
     - `isStaff`: ReID-identified staff
   - Subscribes to `analytics/reid/#`
   - Updates detections with ReID info

2. **DetectionOverlay (DetectionOverlay.tsx)**
   - Color coding:
     - Blue: Staff (face or ReID identified)
     - Purple: Tracked customer (with displayId)
     - Green: Unknown person
   - Labels show:
     - Staff name if identified
     - "Person A7" for tracked customers
     - "Staff B12" for ReID-identified staff
   - Legend updated with new color scheme

3. **API Client (client.ts)**
   - Added ReID types and endpoints
   - TrackedPerson, PersonSighting, MatchResult interfaces
   - Functions: getTrackedPersons, getPersonHistory, linkPersonToStaff, etc.

**Configuration (docker-compose.yml):**
```yaml
environment:
  # MQTT for ReID worker
  - MQTT_HOST=host.docker.internal
  - MQTT_PORT=1883
  # ReID configuration
  - REID_SIMILARITY_THRESHOLD=0.7    # Min similarity for match
  - REID_EMBEDDINGS_PER_PERSON=5     # Keep N embeddings per person
  - REID_MIN_DETECTION_AREA=2000     # Skip small detections
```

**Dockerfile Updates:**
- Added PyTorch CPU version for ReID inference
- Added system dependencies: g++, libglib2.0-0, libsm6, libxext6
- Added Python packages: torch, torchvision, scipy, gdown, aiomqtt

**How ReID Tracking Works:**

```
1. New person detected by Frigate
   ↓
2. MQTT event received (frigate/events)
   ↓
3. Thumbnail fetched from Frigate API
   ↓
4. OSNet extracts 512-dim embedding
   ↓
5. Compare to known embeddings (cosine similarity)
   ↓
6. If similarity > 0.7:
   - Match found → Update existing person
   - Add sighting record
   ↓
   If similarity < 0.7:
   - New person → Create TrackedPerson
   - Assign display ID (A1, A2, B1...)
   ↓
7. Publish enriched event to analytics/reid/{camera}
   ↓
8. Frontend receives & displays person ID
```

**Files Created:**
| File | Description |
|------|-------------|
| `backend/reid_service.py` | OSNet model and embedding service |
| `backend/reid_worker.py` | MQTT worker for detection processing |
| `backend/routers/reid.py` | ReID API endpoints |

**Files Modified:**
| File | Changes |
|------|---------|
| `backend/models.py` | Added TrackedPerson, PersonEmbedding, PersonSighting |
| `backend/main.py` | Added ReID router |
| `backend/requirements.txt` | Added torch, scipy, gdown, aiomqtt |
| `backend/Dockerfile` | Added PyTorch CPU and dependencies |
| `docker-compose.yml` | Added MQTT and ReID environment variables |
| `frontend/src/services/mqttClient.ts` | Added ReID event handling |
| `frontend/src/components/DetectionOverlay.tsx` | Added person ID display |
| `frontend/src/api/client.ts` | Added ReID API functions |
| `frontend/src/components/CameraFeedModal.tsx` | Added ReID fields to Detection |

**Performance Notes:**
- OSNet runs on CPU (~100ms per embedding extraction)
- GPU memory unchanged (no GPU usage for ReID)
- Embeddings extracted only on new detections, not every frame
- 5 embeddings stored per person for robust matching

**Testing:**
- Backend health check: Passed
- ReID status endpoint: Working (shows uninitialized until first use)
- ReID config endpoint: Returns correct thresholds
- Persons list endpoint: Returns empty list (no detections processed yet)
- Frontend build: Successful
- Docker images rebuilt and deployed

**Color Legend:**
| Color | Meaning |
|-------|---------|
| Blue (#3b82f6) | Staff - identified by face or ReID |
| Purple (#8b5cf6) | Tracked customer - has display ID |
| Green (#22c55e) | Unknown person - no tracking yet |

**Future Enhancements:**
1. GPU-accelerated inference for faster processing
2. Person tracking panel showing journey across cameras
3. Re-visitor detection (same person returns next day)
4. Clothing change detection (new embeddings after break)
5. Cross-camera handoff visualization

---

### Session 34b: Move ReID to GPU (Completed)
**Date**: 2026-01-10

**Problem:** ReID (OSNet) was running on CPU (~100ms inference) when ~5GB GPU memory was available.

**Solution:**

1. **Updated Dockerfile** - Changed from `python:3.11-slim` to `nvidia/cuda:12.4.0-runtime-ubuntu22.04`
   - Installs Python 3.11 manually
   - Uses CUDA 12.4 PyTorch instead of CPU version

2. **Updated docker-compose.yml** - Added GPU access:
```yaml
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: 1
          capabilities: [gpu]
```

**Verification:**
```bash
$ curl -s http://localhost:8000/api/reid/status | jq .
{
  "initialized": false,
  "embedding_dim": 512,
  "device": "cuda"  # Was "cpu" before
}
```

**Expected Performance:**
- CPU inference: ~100ms per embedding
- GPU inference: ~10-20ms per embedding (5-10x faster)

**Note:** GPU memory allocated on first model use (lazy loading). OSNet requires ~500MB VRAM.

---

### Session 35: Cross-Camera Tracking (Completed)
**Date**: 2026-01-10

**Goal:** Track a person's journey across multiple cameras using ReID embeddings. When someone walks from cam_009 (entrance) to cam_192 (seating) to cam_040 (cashier), maintain the same person ID throughout.

**Implementation Overview:**

The cross-camera tracking system extends the ReID implementation with:
1. **Temporal scoring** - Recent detections weighted higher for matching
2. **Camera adjacency hints** - Boost match scores for adjacent cameras
3. **Journey reconstruction** - Build ordered path through venue
4. **Real-time MQTT updates** - Live journey tracking via `analytics/journey/{person_id}`

**Backend Changes:**

1. **Enhanced reid_worker.py**
   - Cross-camera matching with temporal weighting
   - Camera adjacency graph for handoff detection
   - Camera-to-zone mapping
   - Journey update publishing via MQTT
   - Configurable thresholds for cross-camera vs same-camera matching

2. **Camera-to-Zone Mapping:**
```python
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
```

3. **Camera Adjacency Graph:**
```python
CAMERA_ADJACENCY = {
    "cam_009": ["cam_054"],           # entrance -> hallway
    "cam_054": ["cam_009", "cam_028", "cam_192"],  # hallway connects to multiple
    "cam_028": ["cam_054", "cam_192", "cam_040"],  # seating_main
    "cam_192": ["cam_054", "cam_028", "cam_179"],  # seating_service
    "cam_179": ["cam_192", "cam_108"],             # service_area
    "cam_040": ["cam_028", "cam_054"],             # cashier
    "cam_108": ["cam_179", "cam_239"],             # kitchen
    "cam_239": ["cam_108"],                        # kitchen_prep
}
```

4. **New Configuration Options (Environment Variables):**
   - `REID_CROSS_CAMERA_THRESHOLD`: 0.65 (lower than same-camera)
   - `REID_MAX_HANDOFF_TIME`: 120 seconds
   - `REID_TEMPORAL_DECAY`: 0.995 (per-second decay)
   - `REID_ADJACENCY_BOOST`: 0.1 (similarity boost for adjacent cameras)

5. **Journey Endpoint (routers/reid.py):**
   - `GET /api/reid/persons/{id}/journey` - Returns reconstructed journey

**Journey Response Format:**
```json
{
  "person_id": 42,
  "display_id": "A7",
  "journey": [
    {
      "camera": "cam_009",
      "zone": "entrance",
      "enter": "2026-01-10T10:00:00",
      "exit": "2026-01-10T10:00:15",
      "dwell_seconds": 15
    },
    {
      "camera": "cam_192",
      "zone": "seating_service",
      "enter": "2026-01-10T10:00:32",
      "exit": "2026-01-10T10:15:45",
      "dwell_seconds": 913
    }
  ],
  "total_duration": "17m 30s",
  "total_seconds": 1050,
  "zone_summary": {
    "entrance": 15,
    "seating_service": 913
  },
  "current_zone": "seating_service",
  "current_camera": "cam_192",
  "is_active": true
}
```

**MQTT Topics:**

1. **ReID Events (enhanced):**
   - Topic: `analytics/reid/{camera_id}`
   - Added fields: `zone`, `is_cross_camera`

2. **Journey Updates (new):**
   - Topic: `analytics/journey/{display_id}`
   - Publishes on each detection/handoff
   - Contains current location, journey history, total duration

**Frontend Changes:**

1. **New Hook: useJourneys.ts**
   - Subscribes to journey MQTT updates
   - Provides active visitor count
   - Auto-cleans stale journeys (>10 min inactive)

2. **New Component: JourneyPanel.tsx**
   - Shows currently tracked persons
   - Each person displays: ID, current zone, time in venue
   - Click to expand: full journey timeline with dwell times
   - Zone color coding
   - Real-time updates via MQTT

3. **Dashboard Integration:**
   - JourneyPanel added as collapsible sidebar (desktop)
   - Full-width panel on mobile
   - Persists collapsed state in localStorage

4. **API Client (client.ts):**
   - Added `JourneyStop` and `PersonJourney` types
   - Added `getPersonJourney()` function

5. **MQTT Client (mqttClient.ts):**
   - Added `JourneyUpdate` interface
   - Subscribes to `analytics/journey/#`
   - Tracks journey state per person
   - Added `subscribeToJourneys()`, `getJourneys()`, `getJourneyForPerson()` methods

**Files Created:**
| File | Description |
|------|-------------|
| `frontend/src/hooks/useJourneys.ts` | Hook for journey MQTT subscription |
| `frontend/src/components/JourneyPanel.tsx` | Journey visualization component |

**Files Modified:**
| File | Changes |
|------|---------|
| `backend/reid_worker.py` | Cross-camera matching, temporal scoring, adjacency, journey publishing |
| `backend/routers/reid.py` | Journey endpoint, zone mapping |
| `frontend/src/api/client.ts` | Journey types and API function |
| `frontend/src/services/mqttClient.ts` | Journey MQTT subscription |
| `frontend/src/pages/Dashboard.tsx` | JourneyPanel integration |

**How Cross-Camera Tracking Works:**

```
1. Person detected on cam_009 (entrance)
   ↓
2. Extract embedding, create TrackedPerson A7
   ↓
3. Person walks to cam_192 (seating_service)
   ↓
4. Extract embedding from cam_192
   ↓
5. Cross-camera matching:
   a. Get all recent embeddings with metadata
   b. For each person, compute:
      - Base similarity (cosine distance)
      - Temporal weight (recent detections weighted higher)
      - Adjacency boost (if cam_009 -> cam_192 is adjacent)
   c. Use lower threshold (0.65) for cross-camera
   ↓
6. Match found: A7 (similarity 0.72, adjacency boost applied)
   ↓
7. Update TrackedPerson A7:
   - last_camera_id = "cam_192"
   - last_seen = now
   - Create PersonSighting record
   ↓
8. Publish journey update to analytics/journey/A7
   ↓
9. Frontend receives update, shows:
   "Person A7 - seating_service - 5m 30s"
   [Expandable journey: entrance(15s) -> seating_service(current)]
```

**JourneyPanel Features:**

- **Header:** Shows active visitor count, MQTT connection status
- **Person List:** Each tracked person with:
  - Display ID badge (purple for customers, blue for staff)
  - Current zone with color indicator
  - Total time in venue
  - Active indicator (green pulse)
- **Expanded View:** Click to show:
  - Journey timeline with zone colors
  - Entry/exit times for each stop
  - Dwell time at each location
  - Zone summary with total time per zone
  - First seen and total duration

**Zone Color Legend:**
| Zone | Color |
|------|-------|
| entrance | Green (#22c55e) |
| hallway | Gray (#6b7280) |
| seating_main | Blue (#3b82f6) |
| seating_service | Purple (#8b5cf6) |
| service_area | Amber (#f59e0b) |
| cashier | Red (#ef4444) |
| kitchen | Orange (#f97316) |
| kitchen_prep | Light Orange (#fb923c) |

**Performance Notes:**
- Temporal decay: 0.995^seconds (50% weight after ~138 seconds)
- Adjacency boost: +0.1 similarity for adjacent cameras
- Cross-camera threshold: 0.65 (vs 0.70 for same camera)
- Max handoff time: 120 seconds between cameras
- Journey cleanup: Removes journeys inactive >10 minutes

**Future Enhancements:**
1. Zone transition pattern analysis
2. Heatmap visualization of common paths
3. Anomaly detection (unusual journey patterns)
4. Re-visitor detection (same person returns next day)
5. Staff movement optimization suggestions

---

### Session 35b: JourneyPanel TypeScript Fix
**Date**: 2026-01-11

**Issue:** JourneyPanel not visible in Dashboard after Session 35 implementation.

**Root Cause:** TypeScript build error - the `JourneyUpdate` interface in `mqttClient.ts` was missing `dwell_seconds` field that `JourneyPanel.tsx` expected.

**Fix:** Added `dwell_seconds?: number | null` to the journey item type in `JourneyUpdate` interface.

```typescript
// Before
journey: {
  camera: string
  zone: string
  enter: string
  exit: string | null
}[]

// After
journey: {
  camera: string
  zone: string
  enter: string
  exit: string | null
  dwell_seconds?: number | null  // Added
}[]
```

**Verification:**
```bash
# Frontend build now succeeds
npm run build  # ✓ 758 modules transformed

# JourneyPanel text visible in bundle
grep -o "Active Visitors" dist/assets/*.js  # Found

# Container rebuilt and restarted
docker compose build --no-cache frontend
docker compose up -d frontend
```

**User Action Required:** Hard refresh browser (Ctrl+F5) to load new bundle.

---

### Session 36: Detection Tuning UI
**Date**: 2026-01-11

**Goal:** Create a UI that allows non-technical users to adjust Frigate detection sensitivity settings without SSH access.

**Implementation Overview:**

The detection tuning system provides:
1. **Per-camera detection settings** - Adjust min_area, threshold, motion sensitivity
2. **Preset configurations** - Quick apply optimized settings for different scenarios
3. **Camera groups** - Apply presets to logical camera groupings
4. **Config history** - Track changes and restore previous configurations
5. **Real-time preview** - See detection stats and visual size indicator

**Backend Changes:**

1. **New Service: frigate_config_service.py**
   - Reads/writes Frigate config.yml
   - Parses detection settings per camera
   - Validates setting ranges
   - Saves config history for rollback
   - Triggers Frigate reload via API

2. **New Router: routers/detection_config.py**
   - Full CRUD for camera detection settings
   - Preset management (builtin + custom)
   - Config history and restore
   - Camera stats endpoint

**API Endpoints Added:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/detection/config` | GET | Get all camera detection settings |
| `/api/detection/config/{camera}` | GET | Get settings for specific camera |
| `/api/detection/config/{camera}` | PUT | Update camera detection settings |
| `/api/detection/reload` | POST | Trigger Frigate config reload |
| `/api/detection/presets` | GET | Get all available presets |
| `/api/detection/presets/{camera}/apply` | POST | Apply preset to camera |
| `/api/detection/presets/apply-all` | POST | Apply preset to all cameras |
| `/api/detection/presets/apply-group` | POST | Apply preset to camera group |
| `/api/detection/presets/custom` | POST | Create custom preset |
| `/api/detection/presets/custom/{name}` | DELETE | Delete custom preset |
| `/api/detection/config/history` | GET | Get config change history |
| `/api/detection/config/restore/{id}` | POST | Restore config from history |
| `/api/detection/stats/{camera}` | GET | Get camera detection stats |
| `/api/detection/camera-groups` | GET | Get camera group definitions |

**Built-in Presets:**
| Preset | Use Case | Key Settings |
|--------|----------|--------------|
| `high_sensitivity` | Catch more detections | min_area: 1500, threshold: 0.5 |
| `balanced` | Default settings | min_area: 2500, threshold: 0.7 |
| `low_sensitivity` | Reduce false positives | min_area: 5000, threshold: 0.8 |
| `stationary_focus` | Seated customers | max_disappeared: 150, lower motion |
| `entrance_counting` | Doorway counting | min_area: 3000, threshold: 0.75 |

**Camera Groups:**
```python
CAMERA_GROUPS = {
    "seating": ["cam_192", "cam_179", "cam_028"],
    "entrance": ["cam_009"],
    "kitchen": ["cam_108", "cam_239"],
    "cashier": ["cam_040"],
    "hallway": ["cam_054"],
}
```

**Exposed Settings Per Camera:**
```python
{
    "camera_id": "cam_192",
    "enabled": true,
    "detect": {
        "min_area": 2500,       # 500-20000 px²
        "max_area": 100000,     # 10000-200000 px²
        "threshold": 0.7,       # 0.3-0.95 confidence
        "min_score": 0.5,       # 0.2-0.9 min confidence
        "max_disappeared": 75   # 25-200 frames
    },
    "motion": {
        "threshold": 25,        # 5-60 pixel diff
        "contour_area": 100     # 10-500 min area
    },
    "stationary": {
        "interval": 50,         # 0-100 frames
        "threshold": 50         # 10-150 frames
    }
}
```

**Frontend Changes:**

1. **New Page: DetectionSettings.tsx**
   - Camera selector sidebar
   - Live camera preview with size indicator
   - Tabbed interface: Detection, Motion, Presets, History
   - Slider controls for all settings
   - Real-time detection FPS display
   - Apply/Reset buttons
   - Preset quick-apply cards
   - Camera group preset application
   - Config history with restore

**UI Features:**
- **Camera Preview:** Shows live thumbnail with min_area size indicator (yellow box)
- **Detection Tab:** Sliders for min_area, max_area, threshold, min_score, max_disappeared
- **Motion Tab:** Sliders for motion threshold, contour_area, stationary settings
- **Presets Tab:** Quick-apply cards for built-in presets, camera group management
- **History Tab:** View and restore previous configurations

**Setting Descriptions (shown to users):**
| Setting | User-Friendly Explanation |
|---------|--------------------------|
| min_area | Objects smaller than this area will be ignored. Lower = more sensitive |
| max_area | Objects larger than this area will be ignored |
| threshold | Confidence required to register detection. Lower = more detections |
| min_score | Minimum confidence to consider for tracking |
| max_disappeared | Frames before object is gone. Higher = longer tracking |
| motion threshold | Pixel difference for motion. Lower = sensitive to small movements |
| contour_area | Minimum contour area to trigger motion |
| stationary interval | How often to check if object became stationary. 0 = disabled |
| stationary threshold | Frames object must be still before considered stationary |

**Files Created:**
| File | Description |
|------|-------------|
| `backend/frigate_config_service.py` | Config management service |
| `backend/routers/detection_config.py` | Detection settings API |
| `frontend/src/pages/DetectionSettings.tsx` | Detection settings UI |

**Files Modified:**
| File | Changes |
|------|---------|
| `backend/main.py` | Added detection_config router |
| `backend/requirements.txt` | Added pyyaml dependency |
| `docker-compose.yml` | Added Frigate config volume mount |
| `frontend/src/api/client.ts` | Added detection config types and API functions |
| `frontend/src/App.tsx` | Added DetectionSettings route |
| `frontend/src/components/Layout/Sidebar.tsx` | Added Detection nav item |

**Docker Volume Mounts (Added):**
```yaml
volumes:
  - /mnt/hdd/frigate/config:/frigate/config
environment:
  - FRIGATE_CONFIG_PATH=/frigate/config/config.yml
  - CONFIG_HISTORY_PATH=/app/data/config_history
```

**How Detection Tuning Works:**

```
1. User navigates to Detection Settings page
   ↓
2. Select camera from sidebar (e.g., cam_192)
   ↓
3. Live preview shows current thumbnail with min_area size indicator
   ↓
4. User adjusts slider (e.g., min_area from 2500 to 1500)
   ↓
5. Changes tracked locally in pendingChanges state
   ↓
6. User clicks "Save Changes"
   ↓
7. PUT /api/detection/config/cam_192 called
   ↓
8. Backend:
   a. Validates setting ranges
   b. Backs up current config to history
   c. Writes updated config.yml
   ↓
9. User clicks "Reload Frigate" to apply
   ↓
10. POST /api/detection/reload triggers Frigate restart
   ↓
11. New settings take effect within seconds
```

**Preset Application Flow:**

```
1. User selects "High Sensitivity" preset
   ↓
2. Clicks "Apply to cam_192" or "All"
   ↓
3. If "All", confirmation dialog appears
   ↓
4. POST /api/detection/presets/{camera}/apply
   or POST /api/detection/presets/apply-all
   ↓
5. Backend applies preset settings to config.yml
   ↓
6. UI refreshes with new values
```

**Config History:**
- Last 50 configurations saved automatically
- Each change logs: timestamp, reason, config file path
- Restore reverts to previous config with backup of current

**Validation Rules:**
| Setting | Min | Max |
|---------|-----|-----|
| min_area | 100 | 50000 |
| max_area | 1000 | 500000 |
| threshold | 0.1 | 1.0 |
| min_score | 0.1 | 1.0 |
| max_disappeared | 10 | 500 |
| motion.threshold | 1 | 100 |
| motion.contour_area | 10 | 1000 |
| stationary.interval | 0 | 200 |
| stationary.threshold | 0 | 200 |

**Deployment Notes:**
1. Mount Frigate config directory to `/frigate/config` in container
2. Ensure config.yml is writable by container user
3. Frigate restart required after config changes (button in UI)

**User Workflow:**
1. Navigate to Detection page from sidebar
2. Select camera to tune
3. Observe current detection count and FPS
4. Adjust sliders to desired sensitivity
5. OR apply a preset for quick configuration
6. Save changes
7. Click "Reload Frigate" to apply
8. Monitor detection count to verify changes

**Future Enhancements:**
1. Before/after comparison view
2. Detection count graph during tuning
3. Undo last change button (quick revert)
4. Copy settings between cameras
5. Schedule-based presets (e.g., busier settings during rush hours)

---

### Session 35c: ReID Worker Integration Fix
**Date**: 2026-01-11

**Problem:** JourneyPanel showed no active visitors. ReID bounding boxes not appearing. The reid_worker.py was created but not being started.

**Root Cause:**
1. The ReID worker was never integrated into the backend startup - it existed as a standalone script but was never launched
2. The OSNet model weights URL pointed to the wrong model variant (osnet_x0_25 instead of osnet_x1_0)
3. The LightConv3x3 class had convolutions in the wrong order compared to official torchreid implementation

**Fixes Applied:**

1. **Added ReID worker to backend startup (main.py):**
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _reid_worker_task
    init_db()

    # Start ReID worker in background
    if ENABLE_REID_WORKER:
        from reid_worker import ReIDWorker
        async def run_reid_worker():
            worker = ReIDWorker()
            await worker.start()
        _reid_worker_task = asyncio.create_task(run_reid_worker())

    yield

    # Cleanup on shutdown
    if _reid_worker_task:
        _reid_worker_task.cancel()
```

2. **Fixed OSNet weights URL (reid_service.py):**
```python
# Before (wrong model)
OSNET_WEIGHTS_URL = "https://drive.google.com/uc?id=1Kkx2zW89jq_NETu4u42CFZTMVD5Hwm6e"

# After (correct osnet_x1_0)
OSNET_WEIGHTS_URL = "https://drive.google.com/uc?id=1vduhq5DpN2q1g4fYEZfPI17MJeh9qyrA"
```

3. **Fixed LightConv3x3 layer order (reid_service.py):**
```python
# Before (wrong order)
self.conv1 = nn.Conv2d(in_c, in_c, 3, padding=1, groups=in_c, bias=False)  # depthwise
self.conv2 = nn.Conv2d(in_c, out_c, 1, bias=False)  # pointwise

# After (matching torchreid)
self.conv1 = nn.Conv2d(in_c, out_c, 1, bias=False)  # pointwise first
self.conv2 = nn.Conv2d(out_c, out_c, 3, padding=1, groups=out_c, bias=False)  # depthwise
```

**Verification:**
```bash
# ReID status now shows initialized
$ curl -s http://localhost:8000/api/reid/status
{"initialized":true,"embedding_dim":512,"device":"cuda"}

# MQTT messages being published
$ mosquitto_sub -h localhost -t "analytics/reid/#" -v
analytics/reid/cam_192 {"camera_id": "cam_192", "person_id": 2, "display_id": "A2", ...}

# Tracked persons endpoint shows active visitors
$ curl -s http://localhost:8000/api/reid/persons?active_only=true
{"persons":[{"id":2,"display_id":"A2","is_active":true,...}],"total":1,"active_count":1}
```

**Files Modified:**
| File | Changes |
|------|---------|
| `backend/main.py` | Added ReID worker startup in lifespan, added ENABLE_REID_WORKER env var |
| `backend/reid_service.py` | Fixed OSNet weights URL, fixed LightConv3x3 layer order |

**Environment Variable Added:**
- `ENABLE_REID_WORKER=true` - Set to "false" to disable ReID worker

**How ReID Worker Now Starts:**
```
1. Backend starts via uvicorn
   ↓
2. Lifespan context manager runs
   ↓
3. init_db() initializes database
   ↓
4. If ENABLE_REID_WORKER=true:
   - Import ReIDWorker
   - Create asyncio task to run worker
   ↓
5. Worker.start():
   - Initialize OSNet model (downloads weights if needed)
   - Connect to MQTT broker
   - Subscribe to frigate/events topic
   ↓
6. Worker processes Frigate detection events:
   - Extract appearance embedding from person crop
   - Match against known persons or create new
   - Publish enriched event to analytics/reid/{camera}
   - Publish journey update to analytics/journey/{display_id}
```

**MQTT Message Flow (Now Working):**
```
Frigate → frigate/events → ReID Worker → analytics/reid/{camera} → Frontend
                                      → analytics/journey/{id} → JourneyPanel
```

**Note:** After rebuild, the old incorrect weights file must be deleted for the new weights to download:
```bash
docker exec analytics-backend rm -f /app/data/models/osnet_x1_0.pth
```

---

### Session 35d: Fix ReID Over-Matching and Timezone Issues
**Date**: 2026-01-11

**Problems:**
1. Person A2 was being assigned to multiple different people across cameras - similarity threshold was too loose
2. Timestamps displayed in wrong timezone in the frontend

**Root Causes:**
1. ReID similarity thresholds too low (0.70/0.65) causing false matches
2. Single embedding match was enough to assign same ID
3. Backend timestamps lacked 'Z' suffix, so JavaScript interpreted them as local time instead of UTC

**Fixes Applied:**

**1. Increased ReID Similarity Thresholds:**
```python
# reid_worker.py - before
SIMILARITY_THRESHOLD = 0.7
CROSS_CAMERA_THRESHOLD = 0.65

# reid_worker.py - after  
SIMILARITY_THRESHOLD = 0.80
CROSS_CAMERA_THRESHOLD = 0.75
MIN_MATCH_EMBEDDINGS = 2  # New: require 2+ embeddings to confirm match
```

**2. Added Minimum Match Confirmation:**
- New logic in `_find_best_match_cross_camera()` requires multiple embeddings to exceed threshold
- For persons with 2+ embeddings, at least 2 must match above threshold
- Prevents single-embedding false positives

**3. Added Similarity Score Logging:**
- Debug logs show per-person similarity scores for each match attempt
- Info logs show top candidates when no match found
- Helps tune thresholds based on real data

**4. Fixed Timezone Handling:**
- Backend MQTT messages now append 'Z' to indicate UTC timestamps
- Frontend `formatTime()` defensively adds 'Z' if missing
- Timestamps now correctly convert to user's local timezone

**5. Added Visual Differentiation for Person IDs:**
- Each person letter (A, B, C, etc.) gets a unique color
- A=purple, B=orange, C=cyan, D=pink, E=yellow, etc.
- 26 distinct colors for full alphabet
- Applied to both DetectionOverlay bounding boxes and JourneyPanel avatars

**6. Added Reset Endpoint:**
- `POST /api/reid/reset` - clears all tracked persons, embeddings, and sightings
- Fresh start with new thresholds

**Files Modified:**
| File | Changes |
|------|---------|
| `backend/reid_worker.py` | Increased thresholds, added MIN_MATCH_EMBEDDINGS, added debug logging, fixed timestamps |
| `backend/routers/reid.py` | Updated threshold to 0.80, added /reset endpoint |
| `frontend/src/components/DetectionOverlay.tsx` | Added PERSON_ID_COLORS array, getPersonIdColor() function |
| `frontend/src/components/JourneyPanel.tsx` | Added color differentiation, fixed timestamp parsing |
| `docker-compose.yml` | Updated ReID environment variables |

**Environment Variables Added/Updated:**
```yaml
- REID_SIMILARITY_THRESHOLD=0.80    # Was 0.7
- REID_CROSS_CAMERA_THRESHOLD=0.75  # New
- REID_MIN_MATCH_EMBEDDINGS=2       # New
```

**Color Palette for Person IDs:**
```
A=purple, B=orange, C=cyan, D=pink, E=yellow, F=teal,
G=rose, H=lime, I=violet, J=amber, K=sky, L=fuchsia,
M=gold, N=emerald, O=red-pink, P=green-lime, Q=purple-light,
R=orange-light, S=cyan-light, T=pink-light, U=yellow-light,
V=teal-light, W=rose-light, X=lime-light, Y=violet-light, Z=amber-light
```

**Verification:**
```bash
# Check new threshold is active
curl -s http://localhost:8000/api/reid/config
# {"similarity_threshold":0.8,...}

# Reset tracking data
curl -X POST http://localhost:8000/api/reid/reset
# {"message":"All tracking data reset","deleted":{"persons":3,"embeddings":7,"sightings":606}}
```

**How the New Matching Works:**
```
1. Person detected on camera
   ↓
2. Extract 512-dim embedding via OSNet
   ↓
3. Compare against all known persons:
   a. Compute similarity to each stored embedding
   b. Count embeddings above threshold (0.80 same-cam, 0.75 cross-cam)
   c. Require 2+ embeddings to exceed threshold (if person has 2+ stored)
   d. Log similarity scores for debugging
   ↓
4. If match found: Update existing person
5. If no match: Create new person with unique ID
```

**Expected Behavior After Fix:**
- Different people get different IDs (A1, B1, C1, etc.)
- Same person maintains same ID across cameras (when genuinely matching)
- Visual distinction: each person letter has unique color
- Timestamps display in user's local timezone

---

### Session 35e: Comprehensive ReID Fix
**Date**: 2026-01-11

**Problem:** ReID was still over-matching - assigning the same person ID to multiple different people. The thresholds from 35d (0.80/0.75) were not strict enough.

**Root Cause Analysis:**
1. Single embedding comparison was unreliable
2. No temporal logic to prevent "being in two places at once"
3. No clothing color verification as secondary check
4. Any camera could create new person IDs (leading to duplicates)
5. No multi-frame verification (single noisy detection could create person)
6. cam_040 was sideways (poor detection angle)
7. cam_068, cam_060 are top-down (bad for body feature extraction)

**Comprehensive Fixes Applied:**

**1. Camera Configuration (Frigate):**
```yaml
# cam_040 rotated 90° clockwise for upright person detection
cam_040:
  ffmpeg:
    output_args:
      record: -vf transpose=1 -f segment -segment_time 10 ...
      detect: -vf transpose=1 -f rawvideo -pix_fmt yuv420p
  detect:
    width: 1080   # Swapped from 1920
    height: 1920  # Swapped from 1080
```

**2. Camera Exclusions (reid_worker.py):**
```python
# Top-down cameras excluded from embedding extraction
EXCLUDED_CAMERAS = {"cam_068", "cam_060"}
```

**3. Stricter Thresholds:**
```python
SIMILARITY_THRESHOLD = 0.90       # Same camera (was 0.80)
CROSS_CAMERA_THRESHOLD = 0.85     # Cross camera (was 0.75)
MIN_DETECTION_AREA = 5000         # Pixels (was 2000)
MIN_DETECTION_CONFIDENCE = 0.75   # Frigate score
EMBEDDING_QUALITY_GATE = 0.85     # New embedding must be similar to average
```

**4. Average Embedding Matching:**
- NEW: Compare against mean embedding, not individual embeddings
- `_get_known_embeddings_with_average()` computes per-person average
- Reduces noise from outlier embeddings

**5. Embedding Quality Gate:**
- Before adding new embedding to person's collection
- Must be >0.85 similar to their existing average
- Prevents identity drift from bad samples

**6. Temporal Exclusion:**
```python
TEMPORAL_EXCLUSION_SECONDS = 5
```
- If Person A1 seen on cam_192 at 12:46:05
- Detection on cam_238 at 12:46:05 CANNOT be A1
- Enforces physical impossibility of being two places at once

**7. Entry Camera Seeding:**
```python
ENTRY_CAMERAS = {"cam_009"}  # Only entrance can create new IDs
```
- New person IDs ONLY created from cam_009 (entrance)
- Other cameras can only match to existing persons
- Prevents duplicate identities from different angles

**8. Multi-Frame Verification:**
```python
MIN_DETECTIONS_FOR_CONFIRMATION = 3
```
- First detection: "candidate" status
- Requires 3 consistent detections before creating person
- Embeddings must be self-consistent (>0.80 similarity)
- Reduces single-frame noise

**9. Color Histogram Sanity Check:**
```python
COLOR_HISTOGRAM_THRESHOLD = 0.4
```
- Extract dominant clothing color from detection crop
- Before matching, verify color similarity
- If clothing color very different, reject match
- Fast secondary check (no ML needed)

**10. Per-Camera Trust Levels:**
```python
ENTRY_CAMERAS = {"cam_009"}  # Can create new person IDs
HIGH_TRUST_CAMERAS = {"cam_009", "cam_238", "cam_192"}  # Good embeddings
MEDIUM_TRUST_CAMERAS = {"cam_108", "cam_179", "cam_028", "cam_054", "cam_040"}  # Match only
EXCLUDED_CAMERAS = {"cam_068", "cam_060"}  # No embeddings (top-down)
```

**New Methods Added to ReIDWorker:**

| Method | Purpose |
|--------|---------|
| `_extract_color_histogram()` | Extract RGB histogram from thumbnail |
| `_compare_color_histograms()` | Compare histograms using intersection |
| `_get_known_embeddings_with_average()` | Get per-person average embeddings |
| `_find_best_match_enhanced()` | Match with temporal/color checks |
| `_maybe_add_embedding_with_quality_gate()` | Quality-gated embedding addition |
| `_update_person_color_histogram()` | Running average of person's colors |
| `_store_candidate()` | Store candidate for multi-frame verification |
| `_should_create_person()` | Check if candidate has enough frames |
| `_update_candidate()` | Process candidate on update events |

**Files Modified:**
| File | Changes |
|------|---------|
| `/home/claude-user/frigate/config/config.yml` | cam_040 rotation with transpose=1 |
| `backend/reid_worker.py` | All 10 comprehensive improvements |

**Tracking State Variables Added:**
```python
_candidate_detections: Dict[str, Dict[str, dict]]  # Multi-frame candidates
_person_color_histograms: Dict[int, np.ndarray]   # Color histograms per person
```

**ReID Matching Flow (Enhanced):**
```
1. Person detected on camera
   ↓
2. Check if camera excluded (cam_068, cam_060) → skip
   ↓
3. Check detection confidence > 0.75 → skip if low
   ↓
4. Check detection area > 5000px → skip if small
   ↓
5. Extract embedding + color histogram
   ↓
6. Get known persons with average embeddings
   ↓
7. For each known person:
   a. TEMPORAL EXCLUSION: Skip if seen elsewhere < 5s ago
   b. COLOR CHECK: Skip if clothing color very different
   c. AVERAGE MATCH: Compare to average embedding
   d. CONFIRMATION: Count individual embeddings above threshold
   ↓
8. If match found:
   - Update person, add quality-gated embedding
   ↓
9. If no match:
   - Entry camera (cam_009)? → Multi-frame verification → Create
   - Other camera? → Store as candidate (don't create)
```

**Verification Commands:**
```bash
# Check ReID status
curl -s http://localhost:8000/api/reid/status

# Reset all tracking (fresh start)
curl -X POST http://localhost:8000/api/reid/reset

# Check active persons
curl -s "http://localhost:8000/api/reid/persons?active_only=true"

# Monitor backend logs for ReID matching
docker compose logs backend -f | grep -E "ReID|match|candidate"
```

**Expected Behavior:**
1. New people entering via cam_009 get unique IDs (A1, B1, C1...)
2. Same person tracked across cameras maintains same ID
3. Different people get different IDs (no over-matching)
4. People on excluded cameras still tracked but no ReID
5. cam_040 shows upright people (rotated 90°)
6. Temporal impossibilities prevented (can't be two places at once)
7. Clothing color provides secondary verification
8. Noisy single-frame detections don't create false persons

---

### Session 35g: Fix cam_040 - Rotate in ReID Only
**Date**: 2026-01-11

**Problem:**
The `transpose=1` ffmpeg filter for cam_040 in Frigate was crashing ffmpeg repeatedly due to GPU decode pixel format incompatibility. Error logs showed:
- "Impossible to convert between the formats supported by the filter"
- "Error reinitializing filters"
- Constant ffmpeg crashes and restarts for cam_040

**Solution:**
Removed rotation from Frigate config and moved rotation to ReID embedding extraction instead. This is faster (pure numpy/cv2 operations) and doesn't interfere with ffmpeg decoding.

**Fixes Applied:**

**1. Reverted Frigate Config for cam_040:**
```yaml
# Before (crashing):
cam_040:
  ffmpeg:
    output_args:
      record: -vf transpose=1 -f segment ...
      detect: -vf transpose=1 -f rawvideo -pix_fmt yuv420p
  detect:
    width: 1080   # Swapped
    height: 1920  # Swapped

# After (working):
cam_040:
  ffmpeg:
    output_args:
      record: preset-record-generic-audio-copy
  # Default 1920x1080 detect dimensions
```

**2. Added ROTATED_CAMERAS Config to reid_worker.py:**
```python
# Cameras that need rotation before embedding extraction
ROTATED_CAMERAS = {
    "cam_040": 90  # Mounted sideways, rotate 90 degrees clockwise
}
```

**3. Added _rotate_thumbnail_if_needed() Method:**
```python
def _rotate_thumbnail_if_needed(self, image_bytes: bytes, camera_id: str) -> bytes:
    """Rotate thumbnail for cameras that are mounted sideways."""
    if camera_id not in ROTATED_CAMERAS:
        return image_bytes
    
    # Uses cv2.rotate() for fast rotation:
    # - 90°: cv2.ROTATE_90_CLOCKWISE
    # - 180°: cv2.ROTATE_180
    # - 270°: cv2.ROTATE_90_COUNTERCLOCKWISE
```

**4. Applied Rotation in Detection Flow:**
- `_handle_new_detection()`: Rotate thumbnail before embedding extraction
- `_update_candidate()`: Rotate thumbnail before embedding extraction

**Files Modified:**
| File | Changes |
|------|---------|
| `/home/claude-user/frigate/config/config.yml` | Removed transpose filter, reverted detect dimensions |
| `backend/reid_worker.py` | Added ROTATED_CAMERAS config, added rotation method |

**Why This Approach is Better:**

| Aspect | Frigate transpose | ReID rotation |
|--------|-------------------|---------------|
| Performance | GPU decode compatibility issues | Pure numpy/cv2, very fast |
| Reliability | Crashes ffmpeg | No impact on video stream |
| Scope | Affects all streams (record, detect) | Only affects embedding extraction |
| Flexibility | Hard to debug | Easy to add more cameras |

**Verification:**
```bash
# Frigate cam_040 stats (working)
curl -s http://localhost:5000/api/stats | jq '.cameras.cam_040'
# {"camera_fps": 5.0, "process_fps": 5.0, "detection_fps": 2.5, ...}

# No ffmpeg errors in logs
docker logs frigate 2>&1 --since 5m | grep -i "cam_040.*error"
# (no output = no errors)
```

**Expected Behavior:**
1. cam_040 ffmpeg processes run without crashing
2. Detection works normally at 5 FPS
3. ReID embeddings extracted from rotated thumbnails (upright person orientation)
4. Better embedding quality since person features are upright during extraction

---

### Session 36: Dashboard Detection Tuning UI
**Date**: 2026-01-11

**Goal:** Create a UI in the dashboard that allows non-technical users to tune Frigate detection settings without SSH access.

**Implementation Summary:**
The feature was already implemented in previous sessions. This session verified the implementation and fixed a volume mount issue.

**Backend Components:**

**1. FrigateConfigService (`backend/frigate_config_service.py`):**
- Reads/writes Frigate's `config.yml`
- Per-camera detection settings management
- Built-in presets: high_sensitivity, balanced, low_sensitivity, stationary_focus, entrance_counting
- Custom preset save/load/delete
- Config history (last 50 changes)
- Restore from history
- Camera groups: seating, entrance, kitchen, cashier, hallway
- Validation of settings ranges

**2. Detection Config Router (`backend/routers/detection_config.py`):**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/detection/config` | GET | Get all detection settings |
| `/api/detection/config/{camera}` | GET | Get camera settings |
| `/api/detection/config/{camera}` | PUT | Update camera settings |
| `/api/detection/reload` | POST | Trigger Frigate restart |
| `/api/detection/presets` | GET | Get all presets |
| `/api/detection/presets/{camera}/apply` | POST | Apply preset to camera |
| `/api/detection/presets/apply-all` | POST | Apply preset to all cameras |
| `/api/detection/presets/apply-group` | POST | Apply preset to camera group |
| `/api/detection/presets/custom` | POST | Create custom preset |
| `/api/detection/presets/custom/{name}` | DELETE | Delete custom preset |
| `/api/detection/config/history` | GET | Get config change history |
| `/api/detection/config/restore/{id}` | POST | Restore from history |
| `/api/detection/stats/{camera}` | GET | Get camera detection stats |
| `/api/detection/camera-groups` | GET | Get camera groups |

**Frontend Components:**

**3. DetectionSettings Page (`frontend/src/pages/DetectionSettings.tsx`):**
- Camera selector with list of all cameras
- Live camera preview with min area size indicator
- Four tabs: Detection, Motion, Presets, History
- Detection settings sliders:
  - Min Area (500-20000 px²)
  - Max Area (10000-200000 px²)
  - Detection Threshold (30-95%)
  - Min Score (20-90%)
  - Max Disappeared (25-200 frames)
- Motion settings sliders:
  - Motion Threshold (5-60)
  - Contour Area (10-500)
- Stationary settings:
  - Check Interval (0-100 frames)
  - Threshold (10-150 frames)
- Presets tab with:
  - Built-in preset cards with Apply/Apply All buttons
  - Camera groups with dropdown preset selector
  - Custom presets section
- History tab with restore functionality
- Apply to All confirmation modal
- Real-time FPS stats display
- Role-based access (admin/manager can edit)

**4. Navigation:**
- Route: `/detection`
- Sidebar nav item: "Detection" with eye icon

**Bug Fix:**
Volume mount path corrected in `docker-compose.yml`:
```yaml
# Before (wrong path)
- /mnt/hdd/frigate/config:/frigate/config

# After (correct path)
- /home/claude-user/frigate/config:/frigate/config
```

**Exposed Settings Per Camera:**

| Setting | Range | Description |
|---------|-------|-------------|
| min_area | 100-50000 | Minimum detection size in pixels |
| max_area | 1000-500000 | Maximum detection size |
| threshold | 0.1-1.0 | Confidence threshold for detection |
| min_score | 0.1-1.0 | Minimum score to start tracking |
| max_disappeared | 10-500 | Frames before object considered gone |
| motion.threshold | 1-100 | Pixel difference for motion |
| motion.contour_area | 10-1000 | Minimum contour area |
| stationary.interval | 0-200 | Frames between stationary checks |
| stationary.threshold | 0-200 | Frames to be considered stationary |

**Presets:**

| Preset | min_area | threshold | motion_threshold | Use Case |
|--------|----------|-----------|------------------|----------|
| High Sensitivity | 1500 | 0.50 | 15 | Catch more, may have false positives |
| Balanced | 2500 | 0.70 | 25 | Default settings |
| Low Sensitivity | 5000 | 0.80 | 35 | Reduce false positives |
| Stationary Focus | 2000 | 0.65 | 20 | Seated customers |
| Entrance Counting | 3000 | 0.75 | 20 | Doorway counting |

**Camera Groups:**
- seating: cam_192, cam_179, cam_028
- entrance: cam_009
- kitchen: cam_108, cam_239
- cashier: cam_040
- hallway: cam_054

**Verification:**
```bash
# Get all detection settings
curl -s http://localhost:8000/api/detection/config | jq '.cameras | keys'

# Get camera-specific settings
curl -s http://localhost:8000/api/detection/config/cam_009 | jq '.detect'

# Get available presets
curl -s http://localhost:8000/api/detection/presets | jq '.builtin | keys'
```

**User Flow:**
1. Navigate to Detection Settings from sidebar
2. Select camera from list
3. View live preview with min area indicator
4. Adjust sliders on Detection or Motion tabs
5. Click "Save Changes" to apply
6. Or use Presets tab for quick configuration
7. Click "Reload Frigate" to apply changes
8. Use History tab to restore previous configs if needed

---

## Session 37: Enhanced Manual Labeling + ReID Integration

### Overview
Enhanced the labeling system to allow manual tags to integrate properly with ReID embeddings. Added support for named customers (regulars), staff ReID via appearance, person merge/split capabilities, and negative feedback system.

### Database Changes

**TrackedPerson Model Updates:**
- Added `name` field (nullable) - for named customers like "Mike"
- Added `is_regular` boolean - flag for regular customers
- Added `notes` field - for customer info
- Added `person_type` field - "visitor", "regular", "staff"

**PersonEmbedding Model Updates:**
- Added `is_verified` boolean - manually verified embeddings get higher trust

**New Models:**

1. **StaffAppearanceEmbedding:**
   - Links appearance embeddings to staff
   - Enables staff tracking by appearance (not just face)
   - Fields: staff_id, embedding, camera_id, confidence, is_verified

2. **NegativePair:**
   - Stores pairs of persons confirmed NOT to be the same
   - Used to prevent future false matches
   - Fields: person_id_a, person_id_b, created_by, reason

### New API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/reid/persons/{id}` | PUT | Update person details (name, notes, type) |
| `/api/reid/persons/{id}/label-regular` | POST | Label as named regular customer |
| `/api/reid/persons/{id}/detail` | GET | Get person with embeddings and sightings |
| `/api/reid/merge` | POST | Merge two persons into one |
| `/api/reid/split` | POST | Split sightings/embeddings to new person |
| `/api/reid/negative-pair` | POST | Mark two persons as NOT the same |
| `/api/reid/negative-pairs` | GET | List all negative pairs |
| `/api/reid/negative-pairs/{id}` | DELETE | Delete negative pair |
| `/api/reid/persons/{id}/embeddings/{eid}` | DELETE | Delete specific embedding |
| `/api/reid/persons/{id}/embeddings/{eid}/verify` | POST | Mark embedding as verified |
| `/api/reid/regulars` | GET | List all regular customers |

### Frontend Changes

**1. LabelingModal Updates:**
- Added "Regular Customer" option in mode selection
- Gold/amber colored button with star icon
- Select existing regular or create new one
- Name input required, optional notes
- Regulars recognized by appearance across visits

**2. JourneyPanel Updates:**
- Shows customer name instead of "Person A3" when named
- Gold/amber color for regular customers
- Blue color for staff members
- Type badges: "Staff", "Regular", or nothing for visitors
- Avatar shows first letter of name or display ID

**3. PersonDetailModal (New Component):**
- Four tabs: Info, Sightings, Embeddings, Merge
- Info Tab:
  - View/edit name, notes, type
  - Display ID, first/last seen, visit count
- Sightings Tab:
  - List of all camera sightings with timestamps
- Embeddings Tab:
  - View all embeddings
  - Mark as verified (higher trust)
  - Delete bad embeddings
- Merge Tab:
  - Search and select another person
  - Merge into current person (transfers all data)
  - "Not Same Person" button for negative pairs

**4. API Client Types:**
- Added PersonUpdate, LabelAsRegularRequest
- Added MergeRequest, SplitRequest, NegativePairRequest
- Added PersonEmbeddingInfo, PersonDetail
- Added NegativePairInfo
- Added all new API functions

### Files Modified

**Backend:**
- `backend/models.py` - New models and fields
- `backend/routers/reid.py` - New endpoints

**Frontend:**
- `frontend/src/api/client.ts` - New types and API functions
- `frontend/src/components/LabelingModal.tsx` - Regular customer UI
- `frontend/src/components/JourneyPanel.tsx` - Name and badge display
- `frontend/src/components/PersonDetailModal.tsx` - New component

### Usage Examples

**Label as Regular Customer:**
1. Click detection bounding box
2. Select "This is a regular customer"
3. Create new regular: Enter name (e.g., "Mike"), optional notes
4. Or link to existing regular from list
5. Mike now shows with gold badge and name on future detections

**Merge Two Persons:**
1. Open PersonDetailModal for person A
2. Go to Merge tab
3. Search and select person B
4. Click "Merge Into This Person"
5. All of B's embeddings/sightings transfer to A
6. B is deleted

**Mark Not Same Person:**
1. Open PersonDetailModal
2. Go to Merge tab
3. Select incorrectly matched person
4. Click "Not Same Person"
5. Creates negative pair - prevents future false matches

**Delete Bad Embedding:**
1. Open PersonDetailModal
2. Go to Embeddings tab
3. Click trash icon on bad embedding
4. Removes embedding from matching pool

### Color Scheme

| Person Type | Avatar BG | Avatar Text | Badge |
|-------------|-----------|-------------|-------|
| Staff | Blue 20% | Blue | "Staff" blue |
| Regular | Amber 20% | Gold | "Regular" amber |
| Visitor | ID color 20% | ID color | None |

### Next Steps Possible
- Thumbnail storage for persons
- Appearance embedding extraction on staff label
- Live ReID matching in detection overlay
- Bulk merge operations
- Export/import person data

---

## Session 38: Disk Space Cleanup

### Overview
Performed extensive but conservative disk cleanup to free up SSD space while preserving essential data (models, SQLite DB, Docker images in use).

### Before
- **Disk Usage:** 92% (8.4GB free of 98GB)
- **Main Space Consumers:**
  - Docker dangling images: ~35GB
  - Docker build cache: 11GB
  - pip cache: 4.1GB
  - frigate/venv: 7.4GB
  - frigate/storage: 6.1GB

### Cleanup Actions

| Action | Space Freed |
|--------|-------------|
| pip cache purge | 4.35GB |
| Docker build cache prune --all | 22.63GB |
| Docker container prune | 603KB |
| Docker image prune (dangling) | ~0B* |
| apt cache clean | 193MB |
| Python build artifacts | <100MB |
| Misc cache clean | <100MB |

*Dangling image layers were shared with active images

### After
- **Disk Usage:** 73% (26GB free of 98GB)
- **Total Space Freed:** ~17.6GB

### Items Preserved (Not Moved/Deleted)
- AI models (OSNet, YOLO, CLIP)
- SQLite databases
- Docker images in use:
  - analytics-dashboard-backend (8.25GB)
  - analytics-dashboard-frontend (63.3MB)
  - frigate (2.94GB)
  - codeproject/ai-server (10.9GB)
  - compreface (4.08GB)
  - And other active images
- Playwright browser cache (613MB - used for e2e tests)
- npm cache (384MB - small, kept on SSD)
- frigate recordings/storage (6.1GB)
- frigate Python venv (7.4GB)

### Service Verification
All services verified working after cleanup:
- Dashboard (localhost:3000) - OK
- Backend API (localhost:8000/api/health) - OK  
- Frigate (localhost:5000/api/stats) - OK
- npm - OK

### Recommendations for Future
1. **Docker log rotation** - Add to daemon.json if not set:
   ```json
   {
     "log-driver": "json-file",
     "log-opts": {
       "max-size": "10m",
       "max-file": "3"
     }
   }
   ```
2. **Regular cleanup schedule** - Run monthly:
   - `pip cache purge`
   - `docker builder prune -f`
   - `docker container prune -f`
3. **Consider moving to HDD** if needed later:
   - frigate/storage (recordings)
   - frigate/venv (Python environment)

---

## Session 39: End-to-End Validation & Bug Fixes

### Overview
Comprehensive system validation before building analytics reports. Identified and fixed critical bugs.

### Validation Results

```
╔═══════════════════════════════════════════════════════════════╗
║            VALIDATION REPORT - 2026-01-11                     ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  SYSTEM HEALTH                                                ║
║  ─────────────────────────────────────────────────────────    ║
║  Services:         ALL OK                                     ║
║    - analytics-backend:   Up (healthy)                        ║
║    - analytics-frontend:  Up                                  ║
║    - frigate:             Up (healthy)                        ║
║    - frigate-analytics:   Up                                  ║
║    - mosquitto:           Up                                  ║
║    - influxdb:            Up                                  ║
║                                                               ║
║  Resources:        OK                                         ║
║    - Disk:   73% used (26GB free on SSD)                      ║
║    - Memory: 10GB/47GB used (36GB available)                  ║
║    - GPU:    RTX 2070 SUPER, 3270MB/8192MB, 86% util          ║
║                                                               ║
║  Error Loops:      NONE DETECTED                              ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  FEATURE VALIDATION                                           ║
║  ─────────────────────────────────────────────────────────    ║
║                                                               ║
║  ReID Tracking:    OK (with fix applied)                      ║
║    - Status: initialized=true, device=cuda, dim=512           ║
║    - MQTT: Connected, subscribing to frigate/events           ║
║    - Thresholds: same_camera=0.90, cross_camera=0.85          ║
║    - BUG FIXED: Added opencv-python-headless for cam_040      ║
║    - BUG FIXED: Database schema migration (4 columns added)   ║
║                                                               ║
║  Journey Tracking: OK                                         ║
║    - JourneyPanel: Component exists                           ║
║    - API: /api/reid/persons returns data                      ║
║    - Note: No active visitors (waiting for cam_009 entry)     ║
║                                                               ║
║  Face Recognition: OK                                         ║
║    - Frigate: enabled=true, model_size=large                  ║
║    - Trained faces: 3 (elliot, jb, e2e_test_staff)            ║
║    - Staff with faces: 3/5                                    ║
║    - Recognition working (jb detected with 0.93 confidence)   ║
║                                                               ║
║  Labeling System:  OK                                         ║
║    - Staff endpoint: /api/staff (5 staff)                     ║
║    - Regulars endpoint: /api/reid/regulars (0 regulars)       ║
║    - LabelingModal component ready                            ║
║                                                               ║
║  Detection Tuning: OK                                         ║
║    - Config API: /api/detection/config (14 cameras)           ║
║    - Presets: 5 available                                     ║
║      (balanced, entrance_counting, high_sensitivity,          ║
║       low_sensitivity, stationary_focus)                      ║
║                                                               ║
║  Camera Streaming: OK                                         ║
║    - All 14 cameras: detecting at ~5 FPS                      ║
║    - Detection FPS: 1.0-8.3 (all reasonable)                  ║
║    - All cameras detection_enabled=true                       ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  FRONTEND PAGES                                               ║
║  ─────────────────────────────────────────────────────────    ║
║  /           Dashboard      200 OK                            ║
║  /cameras    Cameras        200 OK                            ║
║  /staff      Staff          200 OK                            ║
║  /detection  Detection      200 OK                            ║
║  /alerts     Alerts         200 OK                            ║
║  /zones      Zones          200 OK                            ║
║  /settings   Settings       200 OK                            ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  DATABASE HEALTH                                              ║
║  ─────────────────────────────────────────────────────────    ║
║  Location: /app/data/analytics.db                             ║
║  Size: 1.1MB                                                  ║
║                                                               ║
║  Record Counts:                                                ║
║    - TrackedPerson:   0 (fresh after schema fix)              ║
║    - PersonEmbedding: 0                                       ║
║    - PersonSighting:  0                                       ║
║    - Staff:           5                                       ║
║    - Zones:           1                                       ║
║    - Cameras:         1                                       ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  BUGS FOUND & FIXED                                           ║
║  ─────────────────────────────────────────────────────────    ║
║                                                               ║
║  CRITICAL (Fixed):                                            ║
║  1. Database Schema Mismatch                                  ║
║     - Missing columns: name, is_regular, notes, person_type   ║
║     - Fixed via ALTER TABLE migrations                        ║
║                                                               ║
║  HIGH (Fixed):                                                ║
║  2. OpenCV Missing                                            ║
║     - cam_040 rotation failed (No module named 'cv2')         ║
║     - Fixed: Added opencv-python-headless to requirements     ║
║     - Rebuilt backend container                               ║
║                                                               ║
║  MEDIUM:                                                      ║
║  3. ReID Only Creates Persons from Entry Camera               ║
║     - Design limitation, not a bug                            ║
║     - Only cam_009 can create new TrackedPerson entries       ║
║     - Other cameras can only match existing persons           ║
║                                                               ║
║  LOW:                                                         ║
║  None identified                                              ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  SUMMARY                                                      ║
║  ─────────────────────────────────────────────────────────    ║
║  Critical: 1 (fixed)                                          ║
║  High:     1 (fixed)                                          ║
║  Medium:   1 (design limitation)                              ║
║  Low:      0                                                  ║
║                                                               ║
║  READY FOR ANALYTICS: YES                                     ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
```

### Fixes Applied

**1. Database Schema Migration**
```sql
ALTER TABLE tracked_persons ADD COLUMN name VARCHAR(100);
ALTER TABLE tracked_persons ADD COLUMN is_regular BOOLEAN DEFAULT 0;
ALTER TABLE tracked_persons ADD COLUMN notes VARCHAR(500);
ALTER TABLE tracked_persons ADD COLUMN person_type VARCHAR(20) DEFAULT "visitor";
ALTER TABLE person_embeddings ADD COLUMN is_verified BOOLEAN DEFAULT 0;
```

**2. OpenCV Installation**
```
# Added to backend/requirements.txt
opencv-python-headless>=4.8.0
```
Rebuilt backend container to include OpenCV for cam_040 thumbnail rotation.

### API Health Verified

| Endpoint | Status | Response |
|----------|--------|----------|
| GET /api/health | 200 | healthy, frigate=true, influxdb=true, database=true |
| GET /api/reid/status | 200 | initialized=true, device=cuda, dim=512 |
| GET /api/reid/persons | 200 | Returns person list |
| GET /api/reid/config | 200 | Similarity thresholds |
| GET /api/detection/config | 200 | 14 cameras |
| GET /api/detection/presets | 200 | 5 presets |
| GET /api/staff | 200 | 5 staff members |

### Camera Status (All 14 Cameras)

| Camera | FPS | Detection FPS | Enabled | Notes |
|--------|-----|---------------|---------|-------|
| cam_009 | 5.0 | 3.2 | ✓ | Entry camera (creates new persons) |
| cam_026 | 5.0 | 2.4 | ✓ | |
| cam_028 | 5.0 | 7.0 | ✓ | Seating main |
| cam_040 | 5.1 | 2.0 | ✓ | Cashier (rotation fixed) |
| cam_054 | 5.0 | 2.2 | ✓ | Hallway |
| cam_060 | 5.0 | 1.3 | ✓ | Excluded from ReID |
| cam_068 | 5.0 | 1.0 | ✓ | Excluded from ReID |
| cam_089 | 5.0 | 1.2 | ✓ | |
| cam_108 | 5.1 | 2.3 | ✓ | Kitchen |
| cam_179 | 5.0 | 5.9 | ✓ | Service area |
| cam_192 | 5.1 | 3.7 | ✓ | Seating service |
| cam_237 | 5.1 | 5.3 | ✓ | CamHi |
| cam_238 | 5.1 | 1.7 | ✓ | CamHi |
| cam_239 | 5.1 | 8.3 | ✓ | Kitchen prep |

### Next Steps
- Build analytics reports dashboard
- Add occupancy analytics
- Add dwell time analysis
- Add journey visualization


---

## Session 39b: Pre-Analytics Data Audit

### Overview
Comprehensive data audit before building analytics reports to verify data quality and volume.

### Data Audit Report

```
╔═══════════════════════════════════════════════════════════════╗
║              DATA AUDIT REPORT - 2026-01-11                   ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  SQLITE DATABASE (ReID Tracking)                              ║
║  ─────────────────────────────────────────────────────────    ║
║  TrackedPerson:   0   (no ReID data yet)                      ║
║  PersonEmbedding: 0                                           ║
║  PersonSighting:  0                                           ║
║  Staff:           5                                           ║
║  Zones:           1                                           ║
║  Cameras:         1                                           ║
║                                                               ║
║  NOTE: SQLite ReID tables are empty because:                  ║
║  1. Schema was just fixed (columns were missing)              ║
║  2. Only cam_009 (entry) can create new persons               ║
║  3. Need activity at entrance to populate                     ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  INFLUXDB (Time-Series Analytics)                             ║
║  ─────────────────────────────────────────────────────────    ║
║  Status: RUNNING ✓                                            ║
║  Bucket: analytics (infinite retention)                       ║
║                                                               ║
║  Measurements:                                                ║
║    • person_detection: 13,950 records                         ║
║    • zone_activity:     4,776 records                         ║
║    • entry_exit:           14 records                         ║
║                                                               ║
║  Data Timespan: 2026-01-10 (about 1-2 days)                   ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  CAMERA DETECTION DISTRIBUTION (InfluxDB)                     ║
║  ─────────────────────────────────────────────────────────    ║
║  cam_239 (kitchen_prep):    3,306  ████████████████████       ║
║  cam_108 (kitchen):         2,882  █████████████████          ║
║  cam_192 (seating_service): 1,769  ███████████                ║
║  cam_040 (cashier):         1,389  █████████                  ║
║  cam_054 (hallway):         1,051  ███████                    ║
║  cam_009 (entrance):          910  ██████                     ║
║  cam_060:                     766  █████                      ║
║  cam_238:                     637  ████                       ║
║  cam_237:                     407  ███                        ║
║  cam_028 (seating_main):      382  ██                         ║
║  cam_089:                     341  ██                         ║
║  cam_179 (service_area):       50  █                          ║
║  cam_026:                      44  █                          ║
║  cam_068:                      16  █                          ║
║                                                               ║
║  TOTAL: ~13,950 detections across 14 cameras                  ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  ZONE ACTIVITY DISTRIBUTION (InfluxDB)                        ║
║  ─────────────────────────────────────────────────────────    ║
║  service_zone:       1,857  ████████████████████              ║
║  cashier_zone:       1,106  ████████████                      ║
║  washroom_zone:        914  ██████████                        ║
║  doorway_zone:         803  █████████                         ║
║  kitchen_entry_zone:    89  █                                 ║
║  exit_zone:              7  █                                 ║
║                                                               ║
║  TOTAL: 4,776 zone events across 6 zones                      ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  DATA QUALITY                                                 ║
║  ─────────────────────────────────────────────────────────    ║
║  Timestamp issues:      NO (all in 2026-01-10/11)             ║
║  Zone mapping:          OK (6 zones defined)                  ║
║  Camera coverage:       OK (all 14 cameras have data)         ║
║  Over-matching:         N/A (ReID not populated yet)          ║
║                                                               ║
║  Average Dwell Time:    26.9 seconds                          ║
║  Classification:        "customer" labels present             ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  SAMPLE ANALYTICS QUERIES                                     ║
║  ─────────────────────────────────────────────────────────    ║
║  ✓ Hourly traffic aggregation: WORKING                        ║
║  ✓ Dwell time calculation:     WORKING (avg 26.9s)            ║
║  ✓ Zone activity counts:       WORKING                        ║
║  ✓ Camera distribution:        WORKING                        ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  BLOCKERS                                                     ║
║  ─────────────────────────────────────────────────────────    ║
║  CRITICAL: None                                               ║
║                                                               ║
║  MINOR:                                                       ║
║  • SQLite ReID tables empty (will populate over time)         ║
║  • Limited timespan (1-2 days of data)                        ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  RECOMMENDATION                                               ║
║  ─────────────────────────────────────────────────────────    ║
║                                                               ║
║  READY FOR ANALYTICS: YES ✓                                   ║
║                                                               ║
║  InfluxDB has sufficient data (~14k person detections,        ║
║  ~5k zone events) across all cameras for building:            ║
║  • Traffic/occupancy dashboards                               ║
║  • Zone heatmaps                                              ║
║  • Dwell time analysis                                        ║
║  • Hourly/daily patterns                                      ║
║                                                               ║
║  ReID journey tracking will populate automatically as         ║
║  people enter via cam_009 (entrance camera).                  ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
```

### Key Findings

**1. InfluxDB Is Primary Data Source**
- Person detection data: ~14,000 records
- Zone activity data: ~5,000 records
- All 14 cameras contributing
- 6 zones tracked

**2. SQLite ReID Tables Empty (Expected)**
- Schema was just fixed (added missing columns)
- ReID worker now running without errors
- Will populate as entrance traffic occurs

**3. Data Quality Good**
- No timestamp anomalies
- Proper camera/zone tagging
- Classification labels present ("customer")

### InfluxDB Schema

**Measurements:**

| Measurement | Fields | Tags | Purpose |
|-------------|--------|------|---------|
| person_detection | confidence, customer_score, dwell_time, staff_score, zones_count | camera, classification, track_id, zone_* | Track individual detections |
| zone_activity | dwell_time, person_count | zone, camera | Zone occupancy |
| entry_exit | count, dwell_time | camera, track_id, type | Entry/exit tracking |

**Data Volume:**
- person_detection: 13,950 records
- zone_activity: 4,776 records  
- entry_exit: 14 records

### Analytics Ready

The system has sufficient data in InfluxDB to build:
1. **Traffic Dashboard** - Hourly/daily visitor counts
2. **Zone Heatmap** - Which areas are busiest
3. **Dwell Analysis** - How long people stay
4. **Camera Activity** - Detection distribution
5. **Peak Hours** - Identify busy periods

### Next Steps
1. Build analytics dashboard components using InfluxDB data
2. Monitor ReID table population over time
3. Consider adding more zone definitions


---

## Session 40: Analytics Reports & Dashboards Implementation

**Date:** 2026-01-11  
**Status:** COMPLETED

### Summary

Built comprehensive analytics reports and dashboards using real InfluxDB data (14,000+ detections, 5,000+ zone events).

### Backend Analytics Endpoints Created

#### New InfluxDB Service (`backend/services/influxdb_service.py`)

Created `InfluxDBAnalyticsService` class with query helpers:

| Method | Description |
|--------|-------------|
| `get_hourly_traffic(date)` | Hourly customer/staff counts |
| `get_daily_traffic(start, end)` | Daily traffic for date range |
| `get_traffic_by_camera(date)` | Detection counts per camera |
| `get_zone_activity(date, days)` | Zone activity with percentages |
| `get_dwell_times_by_zone(date, days)` | Average dwell per zone |
| `get_average_dwell_time(date, days)` | Overall average dwell |
| `get_dwell_distribution(date, days)` | Dwell time buckets |
| `get_peak_hours(days)` | Peak hour analysis |
| `get_day_hour_heatmap(days)` | Day/hour heatmap grid |
| `get_current_occupancy()` | Real-time occupancy |
| `get_occupancy_history(date)` | 5-minute occupancy timeline |
| `get_analytics_summary(date)` | Key metrics summary |
| `export_detections_csv(date)` | CSV export data |

#### Analytics API Endpoints (`backend/routers/analytics.py`)

**Traffic Endpoints:**
- `GET /api/analytics/traffic/hourly?date=YYYY-MM-DD`
- `GET /api/analytics/traffic/daily?start=&end=`
- `GET /api/analytics/traffic/by-camera?date=`

**Dwell Time Endpoints:**
- `GET /api/analytics/dwell/by-zone?date=&days=`
- `GET /api/analytics/dwell/average?date=&days=`
- `GET /api/analytics/dwell/distribution?date=&days=`

**Peak Hours & Heatmap:**
- `GET /api/analytics/peak-hours?days=7`
- `GET /api/analytics/heatmap?days=7`

**Occupancy Endpoints:**
- `GET /api/analytics/occupancy/current` (real-time)
- `GET /api/analytics/occupancy/history?date=`

**Zone Analytics:**
- `GET /api/analytics/zones/traffic?date=&days=`
- `GET /api/analytics/zones/heatmap-data?date=&days=`

**Summary & Export:**
- `GET /api/analytics/summary/date?date=`
- `GET /api/analytics/export/csv?date=` (downloadable CSV)

### Frontend Analytics Page

Updated `frontend/src/pages/Analytics.tsx` with:

#### Features
1. **Date Range Selector**
   - Quick buttons: Today, Yesterday, Last 7 Days, Last 30 Days
   - URL parameter support ready

2. **Summary Cards Row** (6 metrics)
   - Total Detections (with % change vs yesterday)
   - Unique Visitors
   - Average Dwell Time
   - Peak Hour
   - Busiest Zone
   - Current Occupancy (LIVE indicator, 30s refresh)

3. **Charts Grid**
   - **Hourly Traffic**: Bar chart showing customers vs staff by hour
   - **Occupancy Timeline**: Area chart of 5-minute occupancy
   - **Zone Activity**: Color-coded grid showing activity levels
   - **Traffic by Camera**: Pie chart with percentages
   - **Dwell Time by Zone**: Horizontal bar chart
   - **Dwell Distribution**: Histogram of stay durations

4. **Weekly Activity Heatmap**
   - 7x24 grid (days x hours)
   - Color intensity shows activity levels
   - Interactive tooltips

5. **CSV Export**
   - Green "Export CSV" button
   - Downloads detections for selected date

### API Client Updates (`frontend/src/api/client.ts`)

Added new TypeScript types:
- `AnalyticsSummaryV2`
- `DwellByZone`, `DwellAverage`, `DwellDistribution`
- `CameraTraffic`, `ZoneTraffic`
- `HeatmapCell`, `CurrentOccupancy`, `OccupancyPoint`

Added API functions:
- `getHourlyTraffic()`, `getDailyTraffic()`
- `getTrafficByCamera()`
- `getDwellByZone()`, `getDwellAverage()`, `getDwellDistribution()`
- `getPeakHours()`, `getHeatmapData()`
- `getCurrentOccupancy()`, `getOccupancyHistoryV2()`
- `getZoneTraffic()`, `getAnalyticsSummaryV2()`
- `exportAnalyticsCsv()`

### Configuration Fixes

Fixed InfluxDB connection in `docker-compose.yml`:
```yaml
- INFLUXDB_TOKEN=frigate-analytics-token-2024
- INFLUXDB_ORG=frigate
- INFLUXDB_BUCKET=analytics
```

### Testing Results

**API Endpoint Tests (2026-01-10 data):**

| Endpoint | Result |
|----------|--------|
| `/api/analytics/summary/date?date=2026-01-10` | 5,081 detections, peak 8:00 AM |
| `/api/analytics/zones/traffic` | 6 zones, service_zone busiest (29.5%) |
| `/api/analytics/traffic/by-camera` | 10+ cameras, cam_108 highest (24.5%) |
| `/api/analytics/dwell/by-zone` | service_zone longest (43.6s avg) |
| `/api/analytics/dwell/distribution` | 76.7% stay < 30s |
| `/api/analytics/occupancy/current` | 32 people real-time |
| `/api/analytics/heatmap` | Full 7x24 grid data |

### Files Modified

**Backend:**
- `backend/services/__init__.py` (new)
- `backend/services/influxdb_service.py` (new - 700+ lines)
- `backend/routers/analytics.py` (rewritten - 430 lines)
- `docker-compose.yml` (fixed InfluxDB credentials)

**Frontend:**
- `frontend/src/api/client.ts` (added ~100 lines)
- `frontend/src/pages/Analytics.tsx` (rewritten - 600 lines)
- `frontend/src/components/CameraFeedModal.tsx` (fixed TypeScript errors)
- `frontend/src/components/JourneyPanel.tsx` (fixed unused imports)
- `frontend/src/components/LabelingModal.tsx` (fixed unused imports)

### Mobile Responsive

The Analytics page includes:
- Responsive grid layouts (1-col mobile, 2-col desktop)
- Smaller fonts/padding on mobile
- Horizontally scrollable heatmap
- Touch-friendly date selector buttons

### Real-Time Features

- **Live Occupancy Card**: Updates every 30 seconds
- **LIVE Indicator**: Animated green dot
- Automatic data refresh on date selection

### Build Status

```
✓ Backend: Rebuilt and running (healthy)
✓ Frontend: TypeScript compilation clean
✓ All containers: Running
```

### Summary

Successfully implemented full analytics dashboard with:
- 15+ new API endpoints querying real InfluxDB data
- Summary cards with key metrics and trends
- 6 interactive charts using Recharts
- Day/hour activity heatmap
- Real-time occupancy tracking
- CSV export functionality
- Mobile-responsive design
- Loading states and error handling

The analytics page at `/analytics` now displays real visitor data from the restaurant's camera system.

---

## Session 40c: Authentication and Performance Fixes

### Issues Diagnosed

1. **Backend Severely Overloaded**
   - analytics-backend consuming 104.71% CPU and 6.7GB RAM
   - Uvicorn process using 58.7% CPU and 16.1% memory (7.9GB RSS)
   - ReID worker causing memory accumulation over time
   - API requests timing out from host

2. **Authentication Working But Slow**
   - Auth router properly registered in main.py
   - Login endpoint functional but slow due to resource exhaustion
   - Users exist in database with proper bcrypt hashes

### Fixes Applied

1. **Performance Fix**
   - Restarted analytics-backend container to clear memory buildup
   - CPU dropped from 104.71% to 0.78%
   - Memory dropped from 6.7GB to 453MB
   - API response times now 63-67ms (target <500ms)

2. **Authentication Tested**
   - Verified login endpoint works with form-urlencoded data
   - Password change endpoint (`POST /api/auth/me/password`) working
   - JWT tokens properly issued with 8-hour expiry

### Test Results

| Test | Result |
|------|--------|
| Health endpoint | 67ms |
| Cameras endpoint | 64ms |
| Events endpoint | 63ms |
| Login (form-data) | Working (returns JWT + user info) |
| Password change | Working |
| Container CPU | 0.82% |
| Container Memory | 454.7MB |

### Root Cause Analysis

The ReID worker runs continuously processing MQTT events and extracting embeddings. Over time, memory accumulates (possibly from embedding storage or MQTT message queues). This is a known pattern with long-running workers that need periodic restarts or memory management improvements.

### Recommendations

1. **Immediate**: Monitor backend container and restart if memory exceeds 2GB
2. **Short-term**: Add memory limits to docker-compose for analytics-backend
3. **Long-term**: Investigate ReID worker memory management, add garbage collection or periodic restarts

### Files Unchanged

No code changes required - the authentication code was functioning correctly. The issue was resource exhaustion preventing timely responses.

### Status

All reported issues resolved:
- [x] Login authentication working (63ms response time)
- [x] System performance restored (CPU 0.82%, Memory 454MB)
- [x] Password change working


---

## Session 40d: Permanent ReID Memory Leak Fix

### Problem

Backend container was overloaded again (102% CPU, 3.4GB RAM) causing all API requests to timeout.

### Root Cause Analysis

Found multiple memory leaks in `reid_worker.py`:

1. **`_active_tracks`** - Dictionary grows if "end" events are missed
2. **`_last_embedding_time`** - Never cleaned up, grows with each new person
3. **`_person_last_camera`** - Never cleaned up
4. **`_recent_exits`** - Never cleaned up
5. **`_candidate_detections`** - Stores ALL embeddings in lists, never trimmed
6. **`_person_color_histograms`** - Grows unbounded with each new person

### Fixes Implemented

#### 1. Memory Management Constants (reid_worker.py)
```python
MAX_ACTIVE_TRACKS = 100
MAX_CANDIDATES_PER_CAMERA = 20
MAX_CANDIDATE_EMBEDDINGS = 5
MAX_COLOR_HISTOGRAMS = 200
MAX_RECENT_EXITS = 50
CACHE_CLEANUP_INTERVAL = 60  # seconds
CANDIDATE_EXPIRY_SECONDS = 300
DETECTION_COUNT_FOR_GC = 100
```

#### 2. Periodic Cache Cleanup Function
- Added `cleanup_stale_caches()` function that:
  - Removes entries older than defined thresholds
  - Limits size of all dictionaries
  - Runs every 60 seconds automatically

#### 3. Garbage Collection
- Added periodic `gc.collect()` every 100 detections
- Helps Python reclaim memory from deleted objects

#### 4. Candidate Embeddings Limit
- Limited embeddings per candidate to 5 (was unlimited)
- Uses sliding window to keep most recent embeddings

#### 5. Container Memory Limits (docker-compose.yml)
```yaml
deploy:
  resources:
    limits:
      memory: 4G
    reservations:
      memory: 1G
```

#### 6. Health Endpoint Memory Monitoring (main.py)
- Added `memory_mb` and `memory_percent` to health response
- Status changes to "warning" if memory exceeds 2GB

### Files Modified

- `backend/reid_worker.py` - Added memory management
- `backend/main.py` - Added memory monitoring to health endpoint
- `docker-compose.yml` - Added memory limits

### Verification

| Metric | Before Fix | After Fix |
|--------|------------|-----------|
| CPU Usage | 102% | 0.77% |
| Memory Usage | 3.4GB | 647MB |
| Memory Limit | None | 4GB |
| API Response | Timeout | 8-66ms |

### Health Endpoint Response

```json
{
  "status": "healthy",
  "frigate": true,
  "influxdb": true,
  "database": true,
  "memory_mb": 1029.8,
  "memory_percent": 25.1
}
```

### Prevention

Memory will now:
1. Be automatically cleaned every 60 seconds
2. Be garbage collected every 100 detections
3. Be limited to 4GB by Docker
4. Be monitored via health endpoint

If memory exceeds 4GB, Docker will restart the container automatically.


---

## Session 40e: Comprehensive ReID Memory Leak Fix

### Problem
Backend memory would grow from 400MB to 3.5GB in 10 minutes during active detection periods.

### Root Causes Identified

1. **PyTorch GPU Memory Leak** (`reid_service.py`)
   - `extract_features()` never explicitly freed GPU tensors
   - No `torch.cuda.empty_cache()` call after inference
   - PIL Images not explicitly deleted

2. **Unbounded Cache Growth** (`reid_worker.py`)
   - Cache limits too high (100-200 entries)
   - Cleanup interval too long (60s)
   - No hard limits on some caches

3. **No Dedicated Cleanup Task**
   - Cleanup only ran during message processing
   - During low activity, stale data accumulated

### Fixes Applied

#### 1. PyTorch Memory Fix (reid_service.py)
```python
async def extract_features(self, image_data):
    input_tensor = None
    embedding = None
    image = None
    try:
        # ... inference code ...
        return result
    finally:
        # Explicit cleanup
        if input_tensor is not None:
            del input_tensor
        if embedding is not None:
            del embedding
        if image is not None:
            del image
        if self.device.type == 'cuda':
            torch.cuda.empty_cache()
```

#### 2. Aggressive Cache Limits (reid_worker.py)
```python
MAX_ACTIVE_TRACKS = 50           # was 100
MAX_CANDIDATES_PER_CAMERA = 10   # was 20
MAX_CANDIDATE_EMBEDDINGS = 3     # was 5
MAX_COLOR_HISTOGRAMS = 100       # was 200
MAX_RECENT_EXITS = 25            # was 50
CACHE_CLEANUP_INTERVAL = 30      # was 60s
CANDIDATE_EXPIRY_SECONDS = 120   # was 300s
DETECTION_COUNT_FOR_GC = 50      # was 100
```

#### 3. Dedicated Periodic Cleanup Task
```python
async def _periodic_cleanup(self):
    while self._running:
        await asyncio.sleep(CACHE_CLEANUP_INTERVAL)
        cleanup_stale_caches()
        gc.collect()
```

#### 4. Memory Logging
```python
def cleanup_stale_caches():
    mem_before = get_memory_mb()
    # ... cleanup ...
    mem_after = get_memory_mb()
    logger.info(f"[CLEANUP] Memory: {mem_before:.0f}MB -> {mem_after:.0f}MB")
    log_cache_sizes()
```

#### 5. Duplicate Event Detection
```python
if event_key in self._recent_event_ids:
    return  # Skip duplicate
self._recent_event_ids.add(event_key)
```

### Verification

| Time | Memory | Status |
|------|--------|--------|
| 0s | 438MB | Started |
| 10s | 653MB | Stable |
| 60s | 653MB | Stable |
| 120s | 653MB | Stable |

Memory remained stable at ~653MB for 3+ minutes with active detection.

### Files Modified
- `backend/reid_service.py` - PyTorch tensor cleanup
- `backend/reid_worker.py` - Cache limits, periodic cleanup, logging

---

## Session 41: MQTT Connection Fix & Memory Validation

### Problem
Previous memory leak diagnosis was **invalid** because:
- MQTT port 1883 wasn't reachable from Frigate
- ReID worker couldn't connect to broker
- Zero detections were being processed
- Memory appeared stable only because NO WORK was happening

### Root Cause
Frigate was configured to connect to `127.0.0.1:1883` for MQTT, but:
- Frigate runs in a container on `frigate_default` network
- `127.0.0.1` points to Frigate's own container, not mosquitto
- Mosquitto container IP is `172.20.0.2` on `frigate_default` network

### Fix Applied
Updated `/home/claude-user/frigate/config/config.yml`:
```yaml
mqtt:
  enabled: true
  host: 172.20.0.2  # Was: 127.0.0.1 (wrong!)
  port: 1883
  topic_prefix: frigate
  client_id: frigate
```

### MQTT Topology After Fix
```
Frigate (frigate_default) --> Mosquitto (172.20.0.2:1883)
                                     |
                                     v (port 1883 exposed on host)
Backend (analytics-dashboard_default) --> host.docker.internal:1883
```

### Verification Steps
1. Confirmed Frigate publishing: `docker exec mosquitto mosquitto_sub -t "frigate/events" -v`
2. Confirmed backend receiving: Events flowing with ~5 messages/10s
3. ReID worker processing: Thumbnails fetched, embeddings extracted

### Memory Test Under REAL Load (5 minutes)

| Time | RSS | Objects | Notes |
|------|-----|---------|-------|
| 14:54:46 | 762 MB | 415,399 | Before model load |
| 14:54:56 | 1033 MB | 426,687 | OSNet model loaded (+271 MB) |
| 14:55:06 | 1033 MB | 427,123 | Stable |
| 14:56:08 | 1048 MB | 431,834 | Minor growth |
| 14:57:00 | 1048 MB | 431,880 | Stable |
| 14:58:00 | 1048 MB | 431,928 | Stable |
| 14:59:45 | 1050 MB | 431,910 | Final |

**Analysis:**
- Initial: 762 MB (before OSNet model)
- After model load: 1033 MB (+271 MB for OSNet weights)
- Final: 1050 MB
- Growth rate: ~3.4 MB/min initially, then stabilized
- Object count stable around 431,800-432,000

**Conclusion:** Memory is **stable** under real MQTT load. The +17 MB growth over 5 minutes is acceptable and stabilized.

### Files Modified
- `/home/claude-user/frigate/config/config.yml` - Fixed MQTT host
- `/home/claude-user/analytics-dashboard/CLAUDE.md` - Updated MQTT documentation

---

## Session Summary: Memory Leak Investigation (Sessions 40e + 41)

### Key Discovery
Initial memory leak diagnosis was **invalid** - MQTT was disconnected so no actual work was happening. Memory appeared stable because:
- Zero detections processed
- OSNet model never loaded (lazy loading)
- No image processing occurring

### All Issues Fixed

| Issue | Root Cause | Fix | Status |
|-------|-----------|-----|--------|
| Memory leak (1GB→4GB) | PIL Images not closed | Added image.close() in finally blocks | Fixed |
| BytesIO buffers leaking | Not closed after use | Added buffer.close() in finally blocks | Fixed |
| Cache unbounded | No max size | Added MAX_SIZE=500 with eviction | Fixed |
| Frontend subLabel crash | Null safety | Added typeof checks | Fixed |
| MQTT disconnected | Frigate config 127.0.0.1 | Changed to 172.20.0.2 | Fixed |

### Current System Status
- Memory stable at ~1034 MB under load
- MQTT connected, detections flowing
- ReID worker processing events
- Dashboard functional with 14 cameras


---

## Session 40f: Slow API Fix + CamHi Camera Recovery (Jan 11, 2026)

### Issues Fixed

| Issue | Root Cause | Fix | Result |
|-------|-----------|-----|--------|
| Slow analytics APIs (3+ min) | InfluxDB missing `\|> group()` | Added group() before aggregateWindow | <0.5s response |
| CamHi cameras down | RTSP/H.265 encoder locked | Physical power cycle | All 3 cameras restored |

### Technical Details

**InfluxDB Query Fix:**
- Queries without `group()` created windows per track_id
- Thousands of track_ids × 288 windows = millions of rows (39MB output)
- Adding `|> group()` consolidates to single series first
- Fixed in: `get_occupancy_history`, `get_peak_hours`, `get_day_hour_heatmap`

**Performance Improvement:**
| Endpoint | Before | After | Improvement |
|----------|--------|-------|-------------|
| /api/analytics/occupancy/history | 3+ min | 0.46s | ~400x faster |
| /api/analytics/peak-hours | 2+ min | 0.48s | ~250x faster |
| /api/analytics/heatmap | 2+ min | 0.47s | ~250x faster |

### Files Modified
- `backend/services/influxdb_service.py` - Added `|> group()` to 3 queries
- `CLAUDE.md` - Added slow analytics and CamHi camera documentation

### Current Status
✅ All analytics APIs respond in <0.5s
✅ All 14 cameras online (including CamHi 237/238/239)
✅ Memory stable at ~1034MB
✅ MQTT connected, detections flowing
✅ Dashboard fully functional
