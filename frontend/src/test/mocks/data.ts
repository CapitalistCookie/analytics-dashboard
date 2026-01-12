// Mock data for tests
import type {
  Staff, Camera, OccupancyData, Event, HealthStatus,
  AnalyticsSummary, HourlyCount, ZoneActivity, WaitTimeTrend,
  AlertConfig, Alert, AlertStats, User, Profile,
  Incident, IncidentStats, ShiftNote, NoteStats,
  LeaderboardEntry, TeamSummary, ShiftSummary,
  Zone, CameraHealth, CameraHealthSummary
} from '../../api/client'

export const mockHealthStatus: HealthStatus = {
  status: 'healthy',
  frigate: true,
  influxdb: true,
  database: true,
}

export const mockCameras: Camera[] = [
  { camera_id: 'cam_001', fps: 15.0, detection_fps: 5.0, process_fps: 4.8, capture_pid: 1234, ffmpeg_pid: 1235 },
  { camera_id: 'cam_002', fps: 15.0, detection_fps: 5.0, process_fps: 4.9, capture_pid: 1236, ffmpeg_pid: 1237 },
  { camera_id: 'cam_003', fps: 15.0, detection_fps: 5.0, process_fps: 5.0, capture_pid: 1238, ffmpeg_pid: 1239 },
]

export const mockOccupancy: OccupancyData = {
  timestamp: '2026-01-10T12:00:00Z',
  total_count: 42,
  by_camera: { cam_001: 15, cam_002: 12, cam_003: 15 },
  by_zone: { dining: 25, bar: 10, entrance: 7 },
}

export const mockEvents: Event[] = [
  {
    id: 'evt_001',
    camera: 'cam_001',
    label: 'person',
    zones: ['dining'],
    start_time: Date.now() / 1000 - 300,
    end_time: null,
    has_clip: true,
    has_snapshot: true,
    data: { box: [0.1, 0.2, 0.3, 0.4], region: [0, 0, 1, 1], score: 0.95, top_score: 0.95, attributes: [], type: 'object' },
    thumbnail: null,
  },
  {
    id: 'evt_002',
    camera: 'cam_002',
    label: 'person',
    zones: ['bar'],
    start_time: Date.now() / 1000 - 600,
    end_time: Date.now() / 1000 - 500,
    has_clip: true,
    has_snapshot: true,
    data: { box: [0.2, 0.3, 0.4, 0.5], region: [0, 0, 1, 1], score: 0.88, top_score: 0.88, attributes: [], type: 'object' },
    thumbnail: null,
  },
]

export const mockStaff: Staff[] = [
  {
    id: 1,
    name: 'John Smith',
    role: 'Server',
    badge_id: 'EMP001',
    photo_path: null,
    frigate_face_id: null,
    is_active: true,
    face_trained: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-10T00:00:00Z',
  },
  {
    id: 2,
    name: 'Jane Doe',
    role: 'Manager',
    badge_id: 'EMP002',
    photo_path: '/photos/jane.jpg',
    frigate_face_id: 'face_002',
    is_active: true,
    face_trained: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-10T00:00:00Z',
  },
  {
    id: 3,
    name: 'Bob Wilson',
    role: 'Bartender',
    badge_id: 'EMP003',
    photo_path: null,
    frigate_face_id: null,
    is_active: false,
    face_trained: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-10T00:00:00Z',
  },
]

export const mockAnalyticsSummary: AnalyticsSummary = {
  total_customers: 256,
  avg_wait_time: 8.5,
  table_turnover_rate: 3.2,
  staff_efficiency: 0.85,
  busiest_hour: '12:00 PM',
  peak_occupancy: 65,
}

export const mockHourlyCounts: HourlyCount[] = [
  { hour: '9 AM', customers: 15, staff: 4 },
  { hour: '10 AM', customers: 28, staff: 5 },
  { hour: '11 AM', customers: 45, staff: 6 },
  { hour: '12 PM', customers: 65, staff: 8 },
  { hour: '1 PM', customers: 58, staff: 8 },
  { hour: '2 PM', customers: 42, staff: 6 },
]

export const mockZoneActivity: ZoneActivity[] = [
  { zone: 'Dining Area', activity: 85 },
  { zone: 'Bar', activity: 62 },
  { zone: 'Entrance', activity: 45 },
  { zone: 'Kitchen', activity: 30 },
]

export const mockWaitTimes: WaitTimeTrend[] = [
  { time: '9 AM', wait_minutes: 5 },
  { time: '10 AM', wait_minutes: 8 },
  { time: '11 AM', wait_minutes: 12 },
  { time: '12 PM', wait_minutes: 15 },
  { time: '1 PM', wait_minutes: 12 },
  { time: '2 PM', wait_minutes: 8 },
]

export const mockAlertConfigs: AlertConfig[] = [
  {
    id: 1,
    name: 'High Occupancy Alert',
    alert_type: 'occupancy',
    severity: 'warning',
    threshold_value: 50,
    threshold_operator: 'gt',
    zone_id: null,
    camera_id: null,
    is_enabled: true,
    notify_email: true,
    notify_webhook: false,
    webhook_url: null,
    cooldown_minutes: 15,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-10T00:00:00Z',
  },
  {
    id: 2,
    name: 'After Hours Detection',
    alert_type: 'after_hours',
    severity: 'critical',
    threshold_value: null,
    threshold_operator: 'eq',
    zone_id: null,
    camera_id: null,
    is_enabled: true,
    notify_email: true,
    notify_webhook: true,
    webhook_url: 'https://webhook.example.com/alert',
    cooldown_minutes: 5,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-10T00:00:00Z',
  },
]

export const mockAlerts: Alert[] = [
  {
    id: 1,
    config_id: 1,
    alert_type: 'occupancy',
    severity: 'warning',
    message: 'Occupancy exceeded 50 people',
    details: { count: 55, threshold: 50 },
    camera_id: null,
    zone_id: null,
    is_acknowledged: false,
    acknowledged_by: null,
    acknowledged_at: null,
    created_at: '2026-01-10T11:30:00Z',
  },
  {
    id: 2,
    config_id: 2,
    alert_type: 'after_hours',
    severity: 'critical',
    message: 'Motion detected after hours',
    details: { camera: 'cam_001' },
    camera_id: 'cam_001',
    zone_id: null,
    is_acknowledged: true,
    acknowledged_by: 'admin',
    acknowledged_at: '2026-01-10T06:15:00Z',
    created_at: '2026-01-10T05:30:00Z',
  },
]

export const mockAlertStats: AlertStats = {
  total: 25,
  unacknowledged: 5,
  by_severity: { critical: 3, warning: 15, info: 7 },
  by_type: { occupancy: 10, after_hours: 8, wait_time: 7 },
  time_range_hours: 24,
}

export const mockUser: User = {
  id: 1,
  username: 'admin',
  email: 'admin@example.com',
  role: 'admin',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  last_login: '2026-01-10T08:00:00Z',
}

export const mockProfile: Profile = {
  id: 1,
  username: 'admin',
  email: 'admin@example.com',
  display_name: 'Administrator',
  role: 'admin',
  is_active: true,
  photo_path: null,
  notify_email: true,
  notify_in_app: true,
  notify_alerts: true,
  notify_reports: false,
  created_at: '2026-01-01T00:00:00Z',
  last_login: '2026-01-10T08:00:00Z',
}

export const mockIncidents: Incident[] = [
  {
    id: 1,
    title: 'Customer Complaint - Cold Food',
    description: 'Customer at table 5 complained about cold pasta',
    incident_type: 'complaint',
    severity: 'medium',
    status: 'open',
    camera_id: 'cam_001',
    zone_id: 1,
    zone_name: 'Dining Area',
    location: 'Table 5',
    assigned_to: 2,
    assigned_to_name: 'Jane Doe',
    reported_by: 1,
    reported_by_name: 'John Smith',
    frigate_event_id: null,
    clip_url: null,
    snapshot_url: null,
    resolution_notes: null,
    resolved_at: null,
    resolved_by: null,
    resolved_by_name: null,
    created_at: '2026-01-10T11:00:00Z',
    updated_at: '2026-01-10T11:00:00Z',
  },
  {
    id: 2,
    title: 'Spill in Bar Area',
    description: 'Wine spill near bar stool 3',
    incident_type: 'spill',
    severity: 'low',
    status: 'resolved',
    camera_id: 'cam_002',
    zone_id: 2,
    zone_name: 'Bar',
    location: 'Near bar stool 3',
    assigned_to: 3,
    assigned_to_name: 'Bob Wilson',
    reported_by: 2,
    reported_by_name: 'Jane Doe',
    frigate_event_id: null,
    clip_url: null,
    snapshot_url: null,
    resolution_notes: 'Cleaned and sanitized area',
    resolved_at: '2026-01-10T10:30:00Z',
    resolved_by: 3,
    resolved_by_name: 'Bob Wilson',
    created_at: '2026-01-10T10:00:00Z',
    updated_at: '2026-01-10T10:30:00Z',
  },
]

export const mockIncidentStats: IncidentStats = {
  total: 15,
  open: 5,
  investigating: 3,
  resolved: 7,
  by_severity: { low: 5, medium: 6, high: 3, critical: 1 },
  by_type: { complaint: 5, spill: 4, equipment: 3, safety: 2, other: 1 },
  time_range_hours: 24,
}

export const mockShiftNotes: ShiftNote[] = [
  {
    id: 1,
    content: 'Table 8 requested no onions in their orders',
    category: 'customer',
    is_pinned: true,
    is_acknowledged: false,
    acknowledged_by: null,
    acknowledged_by_name: null,
    acknowledged_at: null,
    created_by: 1,
    created_by_name: 'John Smith',
    shift_date: '2026-01-10',
    shift_type: 'afternoon',
    created_at: '2026-01-10T12:00:00Z',
    updated_at: '2026-01-10T12:00:00Z',
  },
  {
    id: 2,
    content: 'Dishwasher making strange noise - maintenance notified',
    category: 'maintenance',
    is_pinned: false,
    is_acknowledged: true,
    acknowledged_by: 2,
    acknowledged_by_name: 'Jane Doe',
    acknowledged_at: '2026-01-10T11:00:00Z',
    created_by: 3,
    created_by_name: 'Bob Wilson',
    shift_date: '2026-01-10',
    shift_type: 'morning',
    created_at: '2026-01-10T10:00:00Z',
    updated_at: '2026-01-10T11:00:00Z',
  },
]

export const mockNoteStats: NoteStats = {
  total: 12,
  unread: 4,
  pinned: 3,
  by_category: { general: 3, customer: 4, maintenance: 2, inventory: 2, staff: 1 },
}

export const mockLeaderboard: LeaderboardEntry[] = [
  {
    rank: 1,
    staff_id: 2,
    name: 'Jane Doe',
    role: 'Manager',
    photo_url: '/photos/jane.jpg',
    score: 95,
    tables_served: 28,
    response_time: 2.5,
    badges: ['speed_star', 'customer_favorite'],
    streak_days: 7,
    trend: 'improving',
  },
  {
    rank: 2,
    staff_id: 1,
    name: 'John Smith',
    role: 'Server',
    photo_url: null,
    score: 88,
    tables_served: 22,
    response_time: 3.2,
    badges: ['team_player'],
    streak_days: 3,
    trend: 'stable',
  },
]

export const mockTeamSummary: TeamSummary = {
  period: 'week',
  total_staff: 8,
  active_staff: 6,
  avg_response_time: 3.5,
  avg_floor_time_percent: 75,
  total_tables_served: 180,
  total_customers_served: 520,
  badges_earned_this_period: 5,
  top_performer: { staff_id: 2, name: 'Jane Doe', score: 95 },
  most_improved: { staff_id: 1, name: 'John Smith', improvement_percent: 15 },
}

export const mockCurrentShift: ShiftSummary = {
  id: 1,
  shift_date: '2026-01-10',
  shift_type: 'afternoon',
  start_time: '2026-01-10T11:00:00Z',
  end_time: '2026-01-10T19:00:00Z',
  metrics: {
    total_customers: 125,
    peak_hour: '12:00 PM',
    peak_occupancy: 58,
    avg_wait_time: 8.5,
    table_turnovers: 45,
    incidents_count: 2,
    revenue_estimate: 4500,
  },
  staff_on_shift: [
    { staff_id: 1, name: 'John Smith', role: 'Server', tables_served: 12, customers_served: 35, floor_time_minutes: 180, idle_time_minutes: 20, response_time_avg: 3.2 },
    { staff_id: 2, name: 'Jane Doe', role: 'Manager', tables_served: 8, customers_served: 25, floor_time_minutes: 200, idle_time_minutes: 15, response_time_avg: 2.5 },
  ],
  comparison: {
    previous_date: '2026-01-03',
    total_customers_change: 10,
    avg_wait_time_change: -1.5,
    table_turnovers_change: 5,
    is_improvement: true,
  },
  notes: null,
  created_at: '2026-01-10T11:00:00Z',
}

export const mockZones: Zone[] = [
  {
    id: 1,
    name: 'Dining Area',
    zone_type: 'dining',
    capacity: 50,
    camera_ids: ['cam_001', 'cam_002'],
    polygon: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }],
    color: '#4CAF50',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-10T00:00:00Z',
  },
  {
    id: 2,
    name: 'Bar',
    zone_type: 'bar',
    capacity: 20,
    camera_ids: ['cam_002'],
    polygon: [{ x: 0.5, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.4 }, { x: 0.5, y: 0.4 }],
    color: '#2196F3',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-10T00:00:00Z',
  },
]

export const mockCameraHealth: CameraHealth[] = [
  {
    camera_id: 'cam_001',
    name: 'Front Entrance',
    status: 'online',
    fps: 15.0,
    detection_fps: 5.0,
    process_fps: 4.9,
    last_seen: '2026-01-10T12:00:00Z',
    latency_ms: 50,
    uptime_percent: 99.5,
    disk_usage_mb: 1024,
    recording_enabled: true,
    detection_enabled: true,
    error_message: null,
  },
  {
    camera_id: 'cam_002',
    name: 'Bar Area',
    status: 'online',
    fps: 15.0,
    detection_fps: 5.0,
    process_fps: 5.0,
    last_seen: '2026-01-10T12:00:00Z',
    latency_ms: 45,
    uptime_percent: 98.2,
    disk_usage_mb: 980,
    recording_enabled: true,
    detection_enabled: true,
    error_message: null,
  },
  {
    camera_id: 'cam_003',
    name: 'Kitchen',
    status: 'degraded',
    fps: 10.0,
    detection_fps: 3.0,
    process_fps: 2.8,
    last_seen: '2026-01-10T11:55:00Z',
    latency_ms: 150,
    uptime_percent: 85.0,
    disk_usage_mb: 800,
    recording_enabled: true,
    detection_enabled: true,
    error_message: 'High latency detected',
  },
]

export const mockCameraHealthSummary: CameraHealthSummary = {
  total_cameras: 3,
  online: 2,
  offline: 0,
  degraded: 1,
  avg_fps: 13.3,
  total_disk_usage_mb: 2804,
  alerts: [
    { camera_id: 'cam_003', severity: 'warning', message: 'High latency detected', timestamp: '2026-01-10T11:55:00Z' },
  ],
}
