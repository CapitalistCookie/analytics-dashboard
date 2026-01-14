import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
})

export interface HealthStatus {
  status: string
  frigate: boolean
  influxdb: boolean
  database: boolean
}

export interface Camera {
  camera_id: string
  fps: number
  detection_fps: number
  process_fps: number
  capture_pid: number
  ffmpeg_pid: number
}

export interface OccupancyData {
  timestamp: string
  total_count: number
  by_camera: Record<string, number>
  by_zone: Record<string, number>
}

export interface EventData {
  box: number[]
  region: number[]
  score: number
  top_score: number
  attributes: unknown[]
  type: string
}

export interface Event {
  id: string
  camera: string
  label: string
  zones: string[]
  start_time: number
  end_time: number | null
  has_clip: boolean
  has_snapshot: boolean
  data: EventData
  thumbnail: string | null
  sub_label: string | null // Face recognition name (staff member)
}

export interface Staff {
  id: number
  name: string
  role: string
  badge_id: string | null
  photo_path: string | null
  frigate_face_id: string | null
  is_active: boolean
  face_trained: boolean
  created_at: string
  updated_at: string
}

export interface StaffListResponse {
  staff: Staff[]
  total: number
}

export interface StaffCreate {
  name: string
  role: string
  badge_id?: string
}

export interface StaffUpdate {
  name?: string
  role?: string
  badge_id?: string
  is_active?: boolean
}

export interface TrainingStatus {
  staff_id: number
  name: string
  face_trained: boolean
  frigate_face_id: string | null
  message: string
}

export interface StaffActivity {
  id: number
  staff_id: number
  action: string
  details: string
  timestamp: string
}

export const getHealth = () => api.get<HealthStatus>('/health')
export const getCameras = () => api.get<Camera[]>('/cameras')
export const getOccupancy = () => api.get<OccupancyData>('/analytics/occupancy')
export interface OccupancyHistoryResponse {
  history: OccupancyData[]
  error?: string
}

export const getOccupancyHistory = (hours?: number) =>
  api.get<OccupancyHistoryResponse>('/analytics/occupancy/history', { params: { hours } })
export const getEvents = (limit?: number, camera?: string, label?: string, in_progress?: boolean) =>
  api.get<Event[]>('/events', {
    params: {
      limit,
      camera,
      label,
      in_progress: in_progress ? 1 : undefined
    }
  })

// Staff CRUD endpoints
export const getStaff = () => api.get<StaffListResponse>('/staff')
export const getStaffById = (id: number) => api.get<Staff>(`/staff/${id}`)
export const createStaff = (data: StaffCreate) => api.post<Staff>('/staff', data)
export const updateStaff = (id: number, data: StaffUpdate) => api.put<Staff>(`/staff/${id}`, data)
export const deleteStaff = (id: number) => api.delete(`/staff/${id}`)

// Staff photo endpoints
export const uploadStaffPhoto = (id: number, file: File, onProgress?: (percent: number) => void) => {
  const formData = new FormData()
  formData.append('file', file)
  return api.post<Staff>(`/staff/${id}/photo`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded * 100) / e.total))
      }
    }
  })
}

// Staff face training endpoints
export const trainStaffFace = (id: number) => api.post<TrainingStatus>(`/staff/${id}/train`)
export const getTrainingStatus = (id: number) => api.get<TrainingStatus>(`/staff/${id}/training-status`)
export const deleteStaffFace = (id: number) => api.delete(`/staff/${id}/face`)

// Quick staff creation with face (for labeling from detection)
export interface QuickCreateStaffRequest {
  name: string
  role: string
  face_image: string // Base64 encoded JPEG image
}
export const quickCreateStaff = (data: QuickCreateStaffRequest) =>
  api.post<Staff>('/staff/quick-create', data)

// Add face from detection to existing staff
export interface AddFaceFromDetectionRequest {
  face_image: string // Base64 encoded JPEG image
}
export const addFaceFromDetection = (staffId: number, data: AddFaceFromDetectionRequest) =>
  api.post<TrainingStatus>(`/staff/${staffId}/face/add-from-detection`, data)

// Staff activity log
export const getStaffActivity = (id: number) => api.get<StaffActivity[]>(`/staff/${id}/activity`)

// Analytics types
export type DateRange = 'today' | 'week' | 'month'

export interface HourlyCount {
  hour: string
  customers: number
  staff: number
}

export interface DailyCount {
  date: string
  customers: number
  staff: number
}

export interface CameraTraffic {
  camera: string
  count: number
  percentage: number
}

export interface ZoneActivity {
  zone: string
  activity: number
}

export interface ZoneTraffic {
  zone: string
  count: number
  activity: number
  percentage: number
}

export interface StaffPerformance {
  name: string
  floor_time: number
  idle_time: number
}

export interface WaitTimeTrend {
  time: string
  wait_minutes: number
}

export interface TableTurnover {
  table_id: string
  turnovers: number
  avg_duration: number
}

export interface CustomerStaffBreakdown {
  label: string
  value: number
}

export interface AnalyticsSummary {
  total_customers: number
  avg_wait_time: number
  table_turnover_rate: number
  staff_efficiency: number
  busiest_hour: string
  peak_occupancy: number
}

export interface AnalyticsSummaryV2 {
  total_visitors: number
  total_detections: number
  avg_dwell_minutes: number
  peak_hour: string
  peak_hour_count: number
  busiest_zone: string
  vs_yesterday_percent: number
  date: string
}

export interface DwellByZone {
  zone: string
  avg_dwell_seconds: number
  avg_dwell_minutes: number
}

export interface DwellAverage {
  avg_seconds: number
  avg_minutes: number
  total_events: number
}

export interface DwellDistribution {
  bucket: string
  count: number
  percentage: number
}

export interface VisitDurationStats {
  avg_visit_minutes: number
  min_visit_minutes: number
  max_visit_minutes: number
  total_visits: number
}

export interface HourlyDwellTrend {
  hour: string
  avg_dwell_minutes: number
  count: number
}

export interface DwellSummary {
  avg_dwell_seconds: number
  avg_dwell_minutes: number
  total_sightings: number
  avg_visit_minutes: number
  total_visits: number
  longest_dwell_zone: string
  busiest_zone: string
  zones: DwellByZone[]
}

export interface PeakHour {
  hour: string
  avg_count: number
  total_count: number
}

export interface HeatmapCell {
  day: string
  day_index: number
  hour: number
  count: number
}

export interface CurrentOccupancy {
  total: number
  by_camera: Record<string, number>
  by_zone: Record<string, number>
  timestamp: string
  source: string
}

export interface OccupancyPoint {
  timestamp: string
  count: number
}

export interface LiveOccupancy {
  timestamp: string
  total: number
  by_zone: Record<string, number>
  source: string
}

// Legacy Analytics endpoints (for backward compatibility)
export const getHourlyCounts = (range: DateRange = 'today') =>
  api.get<HourlyCount[]>('/analytics/hourly-counts', { params: { range } })

export const getZoneActivity = (range: DateRange = 'today') =>
  api.get<ZoneActivity[]>('/analytics/zone-activity', { params: { range } })

export const getStaffPerformance = (range: DateRange = 'today') =>
  api.get<StaffPerformance[]>('/analytics/staff-performance', { params: { range } })

export const getWaitTimes = (range: DateRange = 'today') =>
  api.get<WaitTimeTrend[]>('/analytics/wait-times', { params: { range } })

export const getTableTurnover = (range: DateRange = 'today') =>
  api.get<TableTurnover[]>('/analytics/table-turnover', { params: { range } })

export const getCustomerStaffBreakdown = (range: DateRange = 'today') =>
  api.get<CustomerStaffBreakdown[]>('/analytics/customer-staff-breakdown', { params: { range } })

export const getAnalyticsSummary = (range: DateRange = 'today') =>
  api.get<AnalyticsSummary>('/analytics/summary', { params: { range } })

export const getLiveOccupancy = () =>
  api.get<LiveOccupancy>('/analytics/occupancy/live')

// New Analytics V2 endpoints (using real InfluxDB data)
export const getHourlyTraffic = (date?: string) =>
  api.get<HourlyCount[]>('/analytics/traffic/hourly', { params: { date } })

export const getDailyTraffic = (start: string, end: string) =>
  api.get<DailyCount[]>('/analytics/traffic/daily', { params: { start, end } })

export const getTrafficByCamera = (date?: string) =>
  api.get<CameraTraffic[]>('/analytics/traffic/by-camera', { params: { date } })

export const getDwellByZone = (date?: string, days?: number) =>
  api.get<DwellByZone[]>('/analytics/dwell/by-zone', { params: { date, days } })

export const getDwellAverage = (date?: string, days?: number) =>
  api.get<DwellAverage>('/analytics/dwell/average', { params: { date, days } })

export const getDwellDistribution = (date?: string, days?: number) =>
  api.get<DwellDistribution[]>('/analytics/dwell/distribution', { params: { date, days } })

export const getVisitDurationStats = (date?: string, days?: number) =>
  api.get<VisitDurationStats>('/analytics/dwell/visit-stats', { params: { date, days } })

export const getHourlyDwellTrend = (date?: string) =>
  api.get<HourlyDwellTrend[]>('/analytics/dwell/hourly-trend', { params: { date } })

export const getDwellSummary = (date?: string, days?: number) =>
  api.get<DwellSummary>('/analytics/dwell/summary', { params: { date, days } })

export const getPeakHours = (days?: number) =>
  api.get<PeakHour[]>('/analytics/peak-hours', { params: { days } })

export const getHeatmapData = (days?: number) =>
  api.get<HeatmapCell[]>('/analytics/heatmap', { params: { days } })

export const getCurrentOccupancy = () =>
  api.get<CurrentOccupancy>('/analytics/occupancy/current')

export const getOccupancyHistoryV2 = (date?: string) =>
  api.get<OccupancyPoint[]>('/analytics/occupancy/history', { params: { date } })

export const getZoneTraffic = (date?: string, days?: number) =>
  api.get<ZoneTraffic[]>('/analytics/zones/traffic', { params: { date, days } })

export const getAnalyticsSummaryV2 = (date?: string) =>
  api.get<AnalyticsSummaryV2>('/analytics/summary/date', { params: { date } })

export const exportAnalyticsCsv = (date?: string) =>
  api.get('/analytics/export/csv', { params: { date }, responseType: 'blob' })

// Queue Detection types
export interface QueuePerson {
  person_id: number
  display_id: string
  enter_time: string
  wait_seconds: number
  wait_formatted: string
}

export interface QueueStatus {
  zone: string
  queue_length: number
  people: QueuePerson[]
  avg_wait_seconds: number
  avg_wait_formatted: string
  max_wait_seconds: number
  max_wait_formatted: string
  updated_at: string
}

export interface QueueAlert {
  zone: string
  type: string
  severity: 'warning' | 'critical'
  message: string
  value: number
  threshold: number
}

export interface QueueHistoryPoint {
  hour: string
  queue_count: number
  avg_wait_seconds: number
  completed_visits: number
}

// Queue Detection endpoints
export const getQueueStatus = (zone?: string) =>
  api.get<QueueStatus>('/analytics/queue/status', { params: { zone } })

export const getQueueAlerts = () =>
  api.get<QueueAlert[]>('/analytics/queue/alerts')

export const getQueueHistory = (zone?: string, hours?: number) =>
  api.get<QueueHistoryPoint[]>('/analytics/queue/history', { params: { zone, hours } })

export const getAllQueues = () =>
  api.get<Record<string, QueueStatus>>('/analytics/queue/all')

// Entry/Exit types for traffic tracking
export interface EntryExitHour {
  hour: string
  hour_label: string
  entries: number
  exits: number
  net: number
}

export interface EntryExitCurrent {
  current_occupancy: number
  entries_today: number
  exits_today: number
  net_today: number
  net_change: number
  staff_count: number
  customer_count: number
  last_entry: string | null
  last_exit: string | null
  timestamp: string
}

export interface EntryExitHourly {
  hours: EntryExitHour[]
  total_entries: number
  total_exits: number
  date: string
}

export interface EntryExitStats {
  active_detectors: number
  total_detectors: number
  detection_rate: number
  last_calibration: string | null
}

// Entry/Exit endpoints
export const getEntryExitCurrent = () =>
  api.get<EntryExitCurrent>('/analytics/entry-exit/current')

export const getEntryExitHourly = (date?: string) =>
  api.get<EntryExitHourly>('/analytics/entry-exit/hourly', { params: { date } })

export const getEntryExitStats = () =>
  api.get<EntryExitStats>('/analytics/entry-exit/stats')

// Pose Estimation types
export interface PoseStats {
  total_active: number
  seated: number
  standing: number
  unknown: number
  seated_by_zone: Record<string, number>
  standing_by_zone: Record<string, number>
  updated_at: string
}

// Pose Estimation endpoints
export const getPoseStats = () =>
  api.get<PoseStats>('/analytics/pose/stats')

// Action Recognition types
export interface ActionData {
  count: number
  total_minutes: number
  avg_duration_seconds: number
  percentage?: number
}

export interface ActionStats {
  period_hours: number
  actions: Record<string, ActionData>
}

export interface ZoneActions {
  [zone: string]: {
    [action: string]: {
      count: number
      total_minutes: number
    }
  }
}

export interface ActionSummary {
  period_hours: number
  stats: ActionStats
  zone_breakdown: ZoneActions
  current_actions: Record<string, { action: string; since: string }>
  insights: {
    total_actions: number
    activity_level: string
    activity_ratio: number
    sitting_percentage: number
    standing_percentage: number
    walking_percentage: number
  }
}

export interface PersonAction {
  id: number
  action: string
  zone: string | null
  camera_id: string | null
  confidence: number
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
}

export interface ActionType {
  type: string
  name: string
}

// Action Recognition endpoints
export const getActionTypes = () =>
  api.get<ActionType[]>('/actions/types')

export const getActionStats = (hours = 24) =>
  api.get<ActionStats>('/actions/stats', { params: { hours } })

export const getActionsByZone = (hours = 24) =>
  api.get<ZoneActions>('/actions/by-zone', { params: { hours } })

export const getPersonActions = (personId: number, hours = 24) =>
  api.get<PersonAction[]>(`/actions/person/${personId}`, { params: { hours } })

export const getCurrentActions = () =>
  api.get<Record<string, { action: string; since: string }>>('/actions/current')

export const getActionSummary = (hours = 24) =>
  api.get<ActionSummary>('/actions/summary', { params: { hours } })

// Staff Analytics types
export interface StaffMemberSummary {
  person_id: number
  display_id: string
  staff_name: string | null
  staff_id: number | null
  first_seen: string | null
  last_seen: string | null
  total_time_minutes: number
  zones_visited: string[]
  zone_count: number
  action_breakdown: Record<string, number>
  sighting_count: number
}

export interface StaffSummary {
  period_hours: number
  total_staff_detected: number
  staff: StaffMemberSummary[]
}

export interface CoverageGap {
  zone: string
  hour: number
  severity: 'high' | 'medium'
}

export interface StaffCoverage {
  period_hours: number
  coverage_by_zone: Record<string, Record<number, number>>
  zone_scores: Record<string, number>
  coverage_gaps: CoverageGap[]
  overall_score: number
}

export interface StaffEfficiency {
  person_id: number
  display_id: string
  staff_name: string | null
  staff_id: number | null
  total_time_minutes: number
  active_time_minutes: number
  idle_time_minutes: number
  activity_rate: number
  zone_transitions: number
  mobility_score: number
  efficiency_score: number
}

export interface ZoneServiceTime {
  avg_dwell_seconds: number | null
  avg_dwell_minutes: number | null
  sample_size: number
  staff_present_count: number
}

export interface ServiceTimes {
  period_hours: number
  service_zones: Record<string, ZoneServiceTime>
}

export interface ShiftData {
  total_staff_hours: number
  avg_hours_per_day: number
  zones_covered: string[]
  coverage_count: number
  sighting_count: number
}

export interface ShiftComparison {
  period_days: number
  shifts: Record<string, ShiftData>
}

export interface StaffPosition {
  person_id: number
  display_id: string
  staff_name: string | null
  staff_id: number | null
  current_zone: string | null
  current_camera: string | null
  current_action: string | null
  last_seen: string | null
}

export interface StaffDashboard {
  summary: StaffSummary
  coverage: StaffCoverage
  efficiency: StaffEfficiency[]
  positions: StaffPosition[]
  service_times: ServiceTimes
}

// Staff Analytics endpoints
export const getStaffSummary = (hours = 24) =>
  api.get<StaffSummary>('/staff-analytics/summary', { params: { hours } })

export const getStaffCoverage = (hours = 8) =>
  api.get<StaffCoverage>('/staff-analytics/coverage', { params: { hours } })

export const getStaffEfficiency = (hours = 24) =>
  api.get<StaffEfficiency[]>('/staff-analytics/efficiency', { params: { hours } })

export const getStaffServiceTimes = (hours = 24) =>
  api.get<ServiceTimes>('/staff-analytics/service-times', { params: { hours } })

export const getStaffShiftComparison = (days = 7) =>
  api.get<ShiftComparison>('/staff-analytics/shifts', { params: { days } })

export const getStaffPositions = () =>
  api.get<StaffPosition[]>('/staff-analytics/positions')

export const getStaffDashboard = () =>
  api.get<StaffDashboard>('/staff-analytics/dashboard')

// Search types
export interface SearchResult {
  id: string
  camera: string
  label: string
  start_time: number
  end_time: number | null
  score: number
  thumbnail_url: string
  has_snapshot: boolean
  has_clip: boolean
  description: string | null
  sub_label: string | null
}

export interface SearchResponse {
  results: SearchResult[]
  total: number
  page: number
  limit: number
  has_more: boolean
}

export interface SearchParams {
  query?: string
  camera?: string
  label?: string
  start_date?: string
  end_date?: string
  min_score?: number
  has_snapshot?: boolean
  has_clip?: boolean
  page?: number
  limit?: number
}

export interface SearchCamera {
  id: string
  name: string
}

export interface SearchLabel {
  id: string
  name: string
}

// Search endpoints
export const searchEvents = (params: SearchParams) =>
  api.get<SearchResponse>('/search', { params })

export const getSearchSuggestions = () =>
  api.get<{ suggestions: string[] }>('/search/suggestions')

export const getSearchCameras = () =>
  api.get<{ cameras: SearchCamera[] }>('/search/cameras')

export const getSearchLabels = () =>
  api.get<{ labels: SearchLabel[] }>('/search/labels')

// Alert types
export interface AlertConfig {
  id: number
  name: string
  alert_type: string
  severity: string
  threshold_value: number | null
  threshold_operator: string
  zone_id: number | null
  camera_id: string | null
  is_enabled: boolean
  notify_email: boolean
  notify_webhook: boolean
  webhook_url: string | null
  cooldown_minutes: number
  created_at: string
  updated_at: string
}

export interface AlertConfigCreate {
  name: string
  alert_type: string
  severity?: string
  threshold_value?: number
  threshold_operator?: string
  zone_id?: number
  camera_id?: string
  is_enabled?: boolean
  notify_email?: boolean
  notify_webhook?: boolean
  webhook_url?: string
  cooldown_minutes?: number
}

export interface AlertConfigUpdate {
  name?: string
  severity?: string
  threshold_value?: number
  threshold_operator?: string
  zone_id?: number
  camera_id?: string
  is_enabled?: boolean
  notify_email?: boolean
  notify_webhook?: boolean
  webhook_url?: string
  cooldown_minutes?: number
}

export interface AfterHoursSchedule {
  id: number
  name: string
  day_of_week: number
  start_hour: number
  start_minute: number
  end_hour: number
  end_minute: number
  is_enabled: boolean
  created_at: string
}

export interface ScheduleCreate {
  name: string
  day_of_week: number
  start_hour: number
  start_minute?: number
  end_hour: number
  end_minute?: number
  is_enabled?: boolean
}

export interface Alert {
  id: number
  config_id: number | null
  alert_type: string
  severity: string
  message: string
  details: Record<string, unknown> | null
  camera_id: string | null
  zone_id: number | null
  is_acknowledged: boolean
  acknowledged_by: string | null
  acknowledged_at: string | null
  created_at: string
}

export interface AlertCreate {
  alert_type: string
  severity?: string
  message: string
  details?: Record<string, unknown>
  camera_id?: string
  zone_id?: number
}

export interface AlertStats {
  total: number
  unacknowledged: number
  by_severity: {
    critical: number
    warning: number
    info: number
  }
  by_type: Record<string, number>
  time_range_hours: number
}

// Alert config endpoints
export const getAlertConfigs = (params?: { alert_type?: string; is_enabled?: boolean }) =>
  api.get<AlertConfig[]>('/alerts/configs', { params })

export const createAlertConfig = (data: AlertConfigCreate) =>
  api.post<AlertConfig>('/alerts/configs', data)

export const getAlertConfig = (id: number) =>
  api.get<AlertConfig>(`/alerts/configs/${id}`)

export const updateAlertConfig = (id: number, data: AlertConfigUpdate) =>
  api.put<AlertConfig>(`/alerts/configs/${id}`, data)

export const deleteAlertConfig = (id: number) =>
  api.delete(`/alerts/configs/${id}`)

export const toggleAlertConfig = (id: number) =>
  api.post<AlertConfig>(`/alerts/configs/${id}/toggle`)

// Schedule endpoints
export const getSchedules = () =>
  api.get<AfterHoursSchedule[]>('/alerts/schedules')

export const createSchedule = (data: ScheduleCreate) =>
  api.post<AfterHoursSchedule>('/alerts/schedules', data)

export const deleteSchedule = (id: number) =>
  api.delete(`/alerts/schedules/${id}`)

export const toggleSchedule = (id: number) =>
  api.post<AfterHoursSchedule>(`/alerts/schedules/${id}/toggle`)

// Alert history endpoints
export const getAlerts = (params?: {
  severity?: string
  alert_type?: string
  is_acknowledged?: boolean
  hours?: number
  limit?: number
}) => api.get<Alert[]>('/alerts', { params })

export const createAlert = (data: AlertCreate) =>
  api.post<Alert>('/alerts', data)

export const getAlert = (id: number) =>
  api.get<Alert>(`/alerts/${id}`)

export const acknowledgeAlert = (id: number, acknowledged_by?: string) =>
  api.post(`/alerts/${id}/acknowledge`, null, { params: { acknowledged_by } })

export const acknowledgeAllAlerts = (params?: { acknowledged_by?: string; severity?: string }) =>
  api.post('/alerts/acknowledge-all', null, { params })

export const getAlertStats = (hours?: number) =>
  api.get<AlertStats>('/alerts/stats/summary', { params: { hours } })

// Auth types
export interface User {
  id: number
  username: string
  email: string | null
  role: string
  is_active: boolean
  created_at: string
  last_login: string | null
}

export interface LoginResponse {
  access_token: string
  token_type: string
  expires_in: number
  user: User
}

export interface AuthCheckResponse {
  authenticated: boolean
  username?: string
  role?: string
}

// Auth endpoints
export const login = (username: string, password: string) => {
  const formData = new URLSearchParams()
  formData.append('username', username)
  formData.append('password', password)
  return api.post<LoginResponse>('/auth/login', formData, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  })
}

export const register = (username: string, password: string, email?: string) =>
  api.post<User>('/auth/register', { username, password, email })

export const getCurrentUser = () =>
  api.get<User>('/auth/me')

export const checkAuth = () =>
  api.get<AuthCheckResponse>('/auth/check')

export const refreshToken = () =>
  api.post<LoginResponse>('/auth/refresh')

export const changePassword = (currentPassword: string, newPassword: string) =>
  api.post('/auth/me/password', {
    current_password: currentPassword,
    new_password: newPassword
  })

// Set auth token
export const setAuthToken = (token: string | null) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
  } else {
    delete api.defaults.headers.common['Authorization']
  }
}

// Profile types
export interface Profile {
  id: number
  username: string
  email: string | null
  display_name: string | null
  role: string
  is_active: boolean
  photo_path: string | null
  notify_email: boolean
  notify_in_app: boolean
  notify_alerts: boolean
  notify_reports: boolean
  created_at: string
  last_login: string | null
}

export interface ProfileUpdate {
  email?: string
  display_name?: string
}

export interface NotificationPreferences {
  notify_email: boolean
  notify_in_app: boolean
  notify_alerts: boolean
  notify_reports: boolean
}

// Profile endpoints
export const getProfile = () => api.get<Profile>('/profile')

export const updateProfile = (data: ProfileUpdate) =>
  api.put<Profile>('/profile', data)

export const updateNotificationPreferences = (prefs: NotificationPreferences) =>
  api.put<Profile>('/profile/notifications', prefs)

export const uploadProfilePhoto = (file: File, onProgress?: (percent: number) => void) => {
  const formData = new FormData()
  formData.append('file', file)
  return api.post('/profile/photo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded * 100) / e.total))
      }
    }
  })
}

export const deleteProfilePhoto = () => api.delete('/profile/photo')

export const changeProfilePassword = (currentPassword: string, newPassword: string) =>
  api.post('/profile/password', {
    current_password: currentPassword,
    new_password: newPassword
  })

// Admin types
export interface AdminUser {
  id: number
  username: string
  email: string | null
  display_name: string | null
  role: string
  is_active: boolean
  photo_path: string | null
  created_at: string
  last_login: string | null
}

export interface UserCreate {
  username: string
  email?: string
  display_name?: string
  password: string
  role?: string
}

export interface UserUpdate {
  email?: string
  display_name?: string
  role?: string
  is_active?: boolean
}

export interface AuditLog {
  id: number
  user_id: number | null
  username: string | null
  action: string
  resource_type: string
  resource_id: string | null
  details: string | null
  ip_address: string | null
  created_at: string
}

export interface AuditLogStats {
  total: number
  today: number
  this_week: number
  by_action: Record<string, number>
  by_resource: Record<string, number>
}

export interface RoleInfo {
  name: string
  display_name: string
  description: string
  permissions: string[]
}

// Admin endpoints
export const getAdminUsers = (params?: { role?: string; is_active?: boolean }) =>
  api.get<AdminUser[]>('/admin/users', { params })

export const createAdminUser = (data: UserCreate) =>
  api.post<AdminUser>('/admin/users', data)

export const getAdminUser = (id: number) =>
  api.get<AdminUser>(`/admin/users/${id}`)

export const updateAdminUser = (id: number, data: UserUpdate) =>
  api.put<AdminUser>(`/admin/users/${id}`, data)

export const deleteAdminUser = (id: number) =>
  api.delete(`/admin/users/${id}`)

export const resetAdminUserPassword = (id: number, newPassword: string) =>
  api.post(`/admin/users/${id}/reset-password`, { new_password: newPassword })

export const getRoles = () =>
  api.get<{ roles: RoleInfo[] }>('/admin/roles')

export const assignRole = (userId: number, role: string) =>
  api.put(`/admin/users/${userId}/role?role=${role}`)

export const getAuditLogs = (params?: {
  skip?: number
  limit?: number
  user_id?: number
  action?: string
  resource_type?: string
  start_date?: string
  end_date?: string
}) => api.get<AuditLog[]>('/admin/audit-logs', { params })

export const getAuditLogStats = () =>
  api.get<AuditLogStats>('/admin/audit-logs/stats')

// Settings types
export interface BusinessHours {
  id: number
  day_of_week: number
  is_open: boolean
  open_hour: number
  open_minute: number
  close_hour: number
  close_minute: number
}

export interface BusinessHoursUpdate {
  is_open?: boolean
  open_hour?: number
  open_minute?: number
  close_hour?: number
  close_minute?: number
}

export interface AppSetting {
  id: number
  key: string
  value: string | null
  value_type: string
  category: string | null
  description: string | null
  updated_at: string
}

export interface ThresholdSettings {
  max_occupancy: number
  wait_time_warning: number
  staff_idle_threshold: number
}

export interface EmailSettings {
  smtp_host: string
  smtp_port: number
  smtp_user: string
  smtp_password: string
  from_email: string
  from_name: string
  enabled: boolean
}

export interface RetentionSettings {
  recordings_days: number
  metrics_days: number
  audit_logs_days: number
  events_days: number
}

// Settings endpoints
export const getBusinessHours = () =>
  api.get<BusinessHours[]>('/settings/business-hours')

export const updateBusinessHours = (day: number, data: BusinessHoursUpdate) =>
  api.put<BusinessHours>(`/settings/business-hours/${day}`, data)

export const updateAllBusinessHours = (hours: BusinessHoursUpdate[]) =>
  api.put('/settings/business-hours', { hours })

export const getAllSettings = (category?: string) =>
  api.get<AppSetting[]>('/settings', { params: { category } })

export const getSetting = (key: string) =>
  api.get<AppSetting>(`/settings/${key}`)

export const updateSetting = (key: string, value: string) =>
  api.put<AppSetting>(`/settings/${key}`, { value })

export const getThresholdSettings = () =>
  api.get<ThresholdSettings>('/settings/thresholds/all')

export const updateThresholdSettings = (data: ThresholdSettings) =>
  api.put('/settings/thresholds/all', data)

export const getEmailSettings = () =>
  api.get<EmailSettings>('/settings/email/all')

export const updateEmailSettings = (data: EmailSettings) =>
  api.put('/settings/email/all', data)

export const testEmailSettings = () =>
  api.post('/settings/email/test')

export const getRetentionSettings = () =>
  api.get<RetentionSettings>('/settings/retention/all')

export const updateRetentionSettings = (data: RetentionSettings) =>
  api.put('/settings/retention/all', data)

// Reports types
export interface ReportType {
  name: string
  description: string
}

export interface ScheduledReport {
  id: number
  name: string
  report_type: string
  schedule: string
  day_of_week: number | null
  day_of_month: number | null
  hour: number
  email_recipients: string | null
  is_enabled: boolean
  last_run: string | null
  created_at: string
}

export interface ScheduledReportCreate {
  name: string
  report_type: string
  schedule: string
  day_of_week?: number
  day_of_month?: number
  hour?: number
  email_recipients?: string
  is_enabled?: boolean
}

export interface ScheduledReportUpdate {
  name?: string
  report_type?: string
  schedule?: string
  day_of_week?: number
  day_of_month?: number
  hour?: number
  email_recipients?: string
  is_enabled?: boolean
}

// Reports endpoints
export const getReportTypes = () =>
  api.get<{ report_types: Record<string, ReportType> }>('/reports/types')

export const exportReport = (
  reportType: string,
  format: 'csv' | 'json' = 'csv',
  startDate?: string,
  endDate?: string
) => {
  const params = new URLSearchParams()
  params.append('format', format)
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)

  if (format === 'csv') {
    return api.get(`/reports/export/${reportType}?${params.toString()}`, {
      responseType: 'blob'
    })
  }
  return api.get(`/reports/export/${reportType}`, { params: { format, start_date: startDate, end_date: endDate } })
}

export const getScheduledReports = () =>
  api.get<ScheduledReport[]>('/reports/scheduled')

export const createScheduledReport = (data: ScheduledReportCreate) =>
  api.post<ScheduledReport>('/reports/scheduled', data)

export const getScheduledReport = (id: number) =>
  api.get<ScheduledReport>(`/reports/scheduled/${id}`)

export const updateScheduledReport = (id: number, data: ScheduledReportUpdate) =>
  api.put<ScheduledReport>(`/reports/scheduled/${id}`, data)

export const deleteScheduledReport = (id: number) =>
  api.delete(`/reports/scheduled/${id}`)

export const runScheduledReport = (id: number) =>
  api.post(`/reports/scheduled/${id}/run`)

export const toggleScheduledReport = (id: number) =>
  api.post(`/reports/scheduled/${id}/toggle`)

// Shift Summary types
export interface StaffShiftStats {
  staff_id: number
  name: string
  role: string
  tables_served: number
  customers_served: number
  floor_time_minutes: number
  idle_time_minutes: number
  response_time_avg: number
}

export interface ShiftMetrics {
  total_customers: number
  peak_hour: string
  peak_occupancy: number
  avg_wait_time: number
  table_turnovers: number
  incidents_count: number
  revenue_estimate: number
}

export interface ShiftComparison {
  previous_date: string
  total_customers_change: number
  avg_wait_time_change: number
  table_turnovers_change: number
  is_improvement: boolean
}

export interface ShiftSummary {
  id: number
  shift_date: string
  shift_type: string
  start_time: string
  end_time: string
  metrics: ShiftMetrics
  staff_on_shift: StaffShiftStats[]
  comparison: ShiftComparison | null
  notes: string | null
  created_at: string
}

export interface ShiftSummaryList {
  id: number
  shift_date: string
  shift_type: string
  total_customers: number
  staff_count: number
  avg_wait_time: number
  created_at: string
}

export interface ShiftSummaryCreate {
  shift_date?: string
  shift_type?: string
  notes?: string
}

// Shift Summary endpoints
export const getCurrentShift = () =>
  api.get<ShiftSummary>('/shifts/current')

export const generateShiftSummary = (data: ShiftSummaryCreate) =>
  api.post<ShiftSummary>('/shifts/generate', data)

export const getShiftHistory = (params?: { days?: number; shift_type?: string }) =>
  api.get<ShiftSummaryList[]>('/shifts/history', { params })

export const getShiftSummary = (id: number) =>
  api.get<ShiftSummary>(`/shifts/${id}`)

export const deleteShiftSummary = (id: number) =>
  api.delete(`/shifts/${id}`)

export const emailShiftSummary = (id: number, recipients: string[]) =>
  api.post(`/shifts/${id}/email`, null, { params: { recipients } })

// Staff Scorecard types
export interface PerformanceMetrics {
  avg_response_time: number
  tables_served_per_hour: number
  floor_time_percent: number
  idle_time_percent: number
  customer_interactions: number
  zones_covered: string[]
}

export interface TrendPoint {
  date: string
  value: number
}

export interface PerformanceTrend {
  metric: string
  trend: string
  change_percent: number
  data_points: TrendPoint[]
}

export interface TeamComparison {
  metric: string
  staff_value: number
  team_average: number
  percentile: number
}

export interface WeeklyStats {
  week_start: string
  week_end: string
  total_hours: number
  tables_served: number
  customers_served: number
  avg_response_time: number
  floor_time_percent: number
}

export interface StaffScorecard {
  staff_id: number
  name: string
  role: string
  photo_url: string | null
  current_metrics: PerformanceMetrics
  trends: PerformanceTrend[]
  team_comparisons: TeamComparison[]
  weekly_summaries: WeeklyStats[]
  badges: string[]
  streak_days: number
  rank: number
  total_staff: number
}

export interface LeaderboardEntry {
  rank: number
  staff_id: number
  name: string
  role: string
  photo_url: string | null
  score: number
  tables_served: number
  response_time: number
  badges: string[]
  streak_days: number
  trend: string
}

export interface BadgeInfo {
  id: string
  name: string
  description: string
  icon: string
  earned_date: string | null
}

export interface TeamSummary {
  period: string
  total_staff: number
  active_staff: number
  avg_response_time: number
  avg_floor_time_percent: number
  total_tables_served: number
  total_customers_served: number
  badges_earned_this_period: number
  top_performer: {
    staff_id: number
    name: string
    score: number
  }
  most_improved: {
    staff_id: number
    name: string
    improvement_percent: number
  }
}

// Staff Scorecard endpoints
export const getStaffScorecard = (staffId: number, period: 'week' | 'month' = 'week') =>
  api.get<StaffScorecard>(`/scorecards/staff/${staffId}`, { params: { period } })

export const getLeaderboard = (params?: { period?: 'week' | 'month'; limit?: number }) =>
  api.get<LeaderboardEntry[]>('/scorecards/leaderboard', { params })

export const getAvailableBadges = () =>
  api.get<BadgeInfo[]>('/scorecards/badges')

export const getStaffBadges = (staffId: number) =>
  api.get<BadgeInfo[]>(`/scorecards/staff/${staffId}/badges`)

export const getTeamSummary = (period: 'week' | 'month' = 'week') =>
  api.get<TeamSummary>('/scorecards/team/summary', { params: { period } })

// Zone types
export interface PolygonPoint {
  x: number
  y: number
}

export interface Zone {
  id: number
  name: string
  zone_type: string
  capacity: number | null
  camera_ids: string[]
  polygon: PolygonPoint[] | null
  color: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ZoneCreate {
  name: string
  zone_type: string
  capacity?: number
  camera_ids?: string[]
  polygon?: PolygonPoint[]
  color?: string
}

export interface ZoneUpdate {
  name?: string
  zone_type?: string
  capacity?: number
  camera_ids?: string[]
  polygon?: PolygonPoint[]
  color?: string
  is_active?: boolean
}

export interface ZoneType {
  id: string
  name: string
  description: string
  color: string
}

export interface ZoneDetectionPreview {
  zone_id: number
  zone_name: string
  current_count: number
  last_detection: string | null
  detections: {
    event_id: string
    camera: string
    start_time: number
    score: number
  }[]
}

// Zone endpoints
export const getZones = (params?: { zone_type?: string; is_active?: boolean }) =>
  api.get<Zone[]>('/zones', { params })

export const createZone = (data: ZoneCreate) =>
  api.post<Zone>('/zones', data)

export const getZone = (id: number) =>
  api.get<Zone>(`/zones/${id}`)

export const updateZone = (id: number, data: ZoneUpdate) =>
  api.put<Zone>(`/zones/${id}`, data)

export const deleteZone = (id: number) =>
  api.delete(`/zones/${id}`)

export const getZoneTypes = () =>
  api.get<{ types: ZoneType[] }>('/zones/types')

export const getZoneDetectionPreview = (id: number) =>
  api.get<ZoneDetectionPreview>(`/zones/${id}/preview`)

export const saveZoneToFrigate = (id: number) =>
  api.post(`/zones/${id}/save-to-frigate`)

// Camera Health types
export interface CameraHealth {
  camera_id: string
  name: string | null
  status: 'online' | 'offline' | 'degraded'
  fps: number
  detection_fps: number
  process_fps: number
  last_seen: string | null
  latency_ms: number | null
  uptime_percent: number
  disk_usage_mb: number
  recording_enabled: boolean
  detection_enabled: boolean
  error_message: string | null
}

export interface CameraHealthSummary {
  total_cameras: number
  online: number
  offline: number
  degraded: number
  avg_fps: number
  total_disk_usage_mb: number
  alerts: {
    camera_id: string
    severity: string
    message: string
    timestamp: string
  }[]
}

export interface CameraUptimeHistory {
  camera_id: string
  history: {
    timestamp: string
    status: string
    fps: number
  }[]
  avg_uptime_percent: number
  total_downtime_minutes: number
}

export interface CameraSettings {
  camera_id: string
  name: string | null
  rtsp_url: string | null
  detection_enabled: boolean
  recording_enabled: boolean
  snapshots_enabled: boolean
  motion_threshold: number
  motion_contour_area: number
  detect_width: number
  detect_height: number
  detect_fps: number
}

export interface CameraSettingsUpdate {
  name?: string
  detection_enabled?: boolean
  recording_enabled?: boolean
  snapshots_enabled?: boolean
  motion_threshold?: number
  motion_contour_area?: number
}

// Camera Health endpoints
export const getCameraHealth = () =>
  api.get<CameraHealth[]>('/cameras/health')

export const getCameraHealthSummary = () =>
  api.get<CameraHealthSummary>('/cameras/health/summary')

export const getSingleCameraHealth = (cameraId: string) =>
  api.get<CameraHealth>(`/cameras/health/${cameraId}`)

export const getCameraUptimeHistory = (cameraId: string, hours?: number) =>
  api.get<CameraUptimeHistory>(`/cameras/health/${cameraId}/history`, { params: { hours } })

export const getCameraSettings = (cameraId: string) =>
  api.get<CameraSettings>(`/cameras/settings/${cameraId}`)

export const updateCameraSettings = (cameraId: string, data: CameraSettingsUpdate) =>
  api.put(`/cameras/settings/${cameraId}`, data)

export const restartCameraStream = (cameraId: string) =>
  api.post(`/cameras/${cameraId}/restart`)

export const getCameraSnapshot = (cameraId: string) =>
  api.get<{ camera_id: string; snapshot_url: string; thumbnail_url: string }>(`/cameras/${cameraId}/snapshot`)

export const toggleCameraDetection = (cameraId: string, enabled: boolean) =>
  api.post(`/cameras/${cameraId}/detect/toggle`, null, { params: { enabled } })

export const toggleCameraRecordings = (cameraId: string, enabled: boolean) =>
  api.post(`/cameras/${cameraId}/recordings/toggle`, null, { params: { enabled } })

// Camera naming types
export interface CameraName {
  camera_id: string
  display_name: string
  is_custom: boolean
}

export interface CameraNameUpdate {
  name: string | null  // null to reset to default
}

// Camera naming endpoints
export const getCameraNames = () =>
  api.get<CameraName[]>('/cameras/names')

export const updateCameraName = (cameraId: string, name: string | null) =>
  api.put<CameraName>(`/cameras/${cameraId}/name`, { name })

export const resetCameraName = (cameraId: string) =>
  api.delete<CameraName>(`/cameras/${cameraId}/name`)

// ============== Incident Types ==============

export interface Incident {
  id: number
  title: string
  description: string | null
  incident_type: string
  severity: string
  status: string
  camera_id: string | null
  zone_id: number | null
  zone_name: string | null
  location: string | null
  assigned_to: number | null
  assigned_to_name: string | null
  reported_by: number | null
  reported_by_name: string | null
  frigate_event_id: string | null
  clip_url: string | null
  snapshot_url: string | null
  resolution_notes: string | null
  resolved_at: string | null
  resolved_by: number | null
  resolved_by_name: string | null
  created_at: string
  updated_at: string
}

export interface IncidentCreate {
  title: string
  description?: string
  incident_type: string
  severity?: string
  camera_id?: string
  zone_id?: number
  location?: string
  assigned_to?: number
  frigate_event_id?: string
  clip_url?: string
  snapshot_url?: string
}

export interface IncidentUpdate {
  title?: string
  description?: string
  incident_type?: string
  severity?: string
  status?: string
  camera_id?: string
  zone_id?: number
  location?: string
  assigned_to?: number
  resolution_notes?: string
}

export interface IncidentStats {
  total: number
  open: number
  investigating: number
  resolved: number
  by_severity: Record<string, number>
  by_type: Record<string, number>
  time_range_hours: number
}

export interface IncidentType {
  name: string
  description: string
}

// Incident endpoints
export const getIncidents = (params?: {
  status?: string
  severity?: string
  incident_type?: string
  camera_id?: string
  zone_id?: number
  assigned_to?: number
  start_date?: string
  end_date?: string
  days?: number
  skip?: number
  limit?: number
}) => api.get<Incident[]>('/incidents', { params })

export const createIncident = (data: IncidentCreate, reported_by?: number) =>
  api.post<Incident>('/incidents', data, { params: { reported_by } })

export const getIncident = (id: number) =>
  api.get<Incident>(`/incidents/${id}`)

export const updateIncident = (id: number, data: IncidentUpdate) =>
  api.put<Incident>(`/incidents/${id}`, data)

export const deleteIncident = (id: number) =>
  api.delete(`/incidents/${id}`)

export const resolveIncident = (id: number, resolution_notes?: string, resolved_by?: number) =>
  api.post(`/incidents/${id}/resolve`, null, { params: { resolution_notes, resolved_by } })

export const assignIncident = (id: number, staff_id: number) =>
  api.post(`/incidents/${id}/assign`, null, { params: { staff_id } })

export const attachClipToIncident = (id: number, frigate_event_id: string) =>
  api.post(`/incidents/${id}/attach-clip`, null, { params: { frigate_event_id } })

export const getIncidentStats = (days?: number) =>
  api.get<IncidentStats>('/incidents/stats/summary', { params: { days } })

export const getIncidentTypes = () =>
  api.get<{ types: Record<string, IncidentType> }>('/incidents/types')

export const exportIncidents = (
  format: 'csv' | 'json' = 'csv',
  params?: {
    status?: string
    severity?: string
    incident_type?: string
    start_date?: string
    end_date?: string
    days?: number
  }
) => {
  const queryParams = { format, ...params }
  if (format === 'csv') {
    return api.get('/incidents/export', { params: queryParams, responseType: 'blob' })
  }
  return api.get('/incidents/export', { params: queryParams })
}

// ============== Shift Notes Types ==============

export interface ShiftNote {
  id: number
  content: string
  category: string
  is_pinned: boolean
  is_acknowledged: boolean
  acknowledged_by: number | null
  acknowledged_by_name: string | null
  acknowledged_at: string | null
  created_by: number
  created_by_name: string | null
  shift_date: string
  shift_type: string | null
  created_at: string
  updated_at: string
}

export interface NoteCreate {
  content: string
  category?: string
  is_pinned?: boolean
  shift_date?: string
  shift_type?: string
}

export interface NoteUpdate {
  content?: string
  category?: string
  is_pinned?: boolean
}

export interface NoteStats {
  total: number
  unread: number
  pinned: number
  by_category: Record<string, number>
}

export interface NoteCategory {
  name: string
  description: string
  color: string
}

export interface NoteTemplate {
  id: string
  category: string
  content: string
}

// Shift Notes endpoints
export const getShiftNotes = (params?: {
  category?: string
  is_pinned?: boolean
  is_acknowledged?: boolean
  shift_type?: string
  days?: number
  skip?: number
  limit?: number
}) => api.get<ShiftNote[]>('/notes', { params })

export const getCurrentShiftNotes = (include_unacknowledged_only?: boolean) =>
  api.get<ShiftNote[]>('/notes/current-shift', { params: { include_unacknowledged_only } })

export const getUnreadNoteCount = () =>
  api.get<{ unread_count: number }>('/notes/unread-count')

export const createShiftNote = (data: NoteCreate, created_by: number) =>
  api.post<ShiftNote>('/notes', data, { params: { created_by } })

export const getShiftNote = (id: number) =>
  api.get<ShiftNote>(`/notes/${id}`)

export const updateShiftNote = (id: number, data: NoteUpdate) =>
  api.put<ShiftNote>(`/notes/${id}`, data)

export const deleteShiftNote = (id: number) =>
  api.delete(`/notes/${id}`)

export const toggleNotePin = (id: number) =>
  api.post<{ success: boolean; is_pinned: boolean }>(`/notes/${id}/pin`)

export const acknowledgeNote = (id: number, acknowledged_by: number) =>
  api.post(`/notes/${id}/acknowledge`, null, { params: { acknowledged_by } })

export const acknowledgeAllNotes = (acknowledged_by: number, category?: string) =>
  api.post('/notes/acknowledge-all', null, { params: { acknowledged_by, category } })

export const getNoteStats = (days?: number) =>
  api.get<NoteStats>('/notes/stats/summary', { params: { days } })

export const getNoteCategories = () =>
  api.get<{ categories: Record<string, NoteCategory> }>('/notes/categories')

export const getNoteTemplates = () =>
  api.get<{ templates: NoteTemplate[] }>('/notes/templates')

// ============== Activity Feed Types ==============

export interface ActivityItem {
  id: string
  type: 'incident' | 'note' | 'alert'
  title: string
  description: string | null
  category: string | null
  severity: string | null
  status: string | null
  is_pinned: boolean
  is_acknowledged: boolean
  created_by: string | null
  created_at: string
  metadata: Record<string, unknown>
}

export interface ActivityFeed {
  items: ActivityItem[]
  total: number
  has_more: boolean
}

export interface ActivityStats {
  total: number
  incidents: number
  notes: number
  alerts: number
  unread_incidents: number
  unread_notes: number
  unacknowledged_alerts: number
  by_hour: Record<string, {
    incidents: number
    notes: number
    alerts: number
    total: number
  }>
}

export interface UnreadSummary {
  open_incidents: number
  critical_incidents: number
  unread_notes: number
  unacknowledged_alerts: number
  critical_alerts: number
  total_unread: number
  has_critical: boolean
}

// Activity Feed endpoints
export const getActivityFeed = (params?: {
  types?: string
  severity?: string
  category?: string
  include_acknowledged?: boolean
  hours?: number
  skip?: number
  limit?: number
}) => api.get<ActivityFeed>('/activity', { params })

export const getActivityStats = (hours?: number) =>
  api.get<ActivityStats>('/activity/stats', { params: { hours } })

export const getRecentActivity = (limit?: number) =>
  api.get<{ items: Array<{
    id: string
    type: string
    title: string
    severity?: string
    category?: string
    created_at: string
  }> }>('/activity/recent', { params: { limit } })

export const getUnreadSummary = () =>
  api.get<UnreadSummary>('/activity/unread-summary')

// ReID (Person Re-Identification) types
export interface ReIDStatus {
  initialized: boolean
  embedding_dim: number
  device: string
}

export interface ReIDConfig {
  similarity_threshold: number
  max_embedding_age: number
  embeddings_per_person: number
  inactive_timeout: number
}

export interface TrackedPerson {
  id: number
  display_id: string
  name: string | null  // Named customer (e.g., "Mike")
  is_regular: boolean  // Regular customer flag
  notes: string | null  // Customer notes
  person_type: string  // "visitor", "regular", "staff"
  first_seen: string
  last_seen: string
  first_camera_id: string | null
  last_camera_id: string | null
  is_customer: boolean
  is_staff: boolean
  staff_name: string | null
  visit_count: number
  is_active: boolean
  embedding_count: number
}

export interface TrackedPersonList {
  persons: TrackedPerson[]
  total: number
  active_count: number
}

export interface PersonSighting {
  id: number
  camera_id: string
  zone_name: string | null
  enter_time: string
  exit_time: string | null
  confidence: number
}

export interface PersonHistory {
  person_id: number
  display_id: string
  sightings: PersonSighting[]
}

export interface JourneyStop {
  camera: string
  zone: string
  enter: string
  exit: string | null
  dwell_seconds: number | null
}

export interface PersonJourney {
  person_id: number
  display_id: string
  journey: JourneyStop[]
  total_duration: string
  total_seconds: number
  zone_summary: Record<string, number>
  current_zone: string | null
  current_camera: string | null
  is_active: boolean
}

export interface MatchResult {
  matched: boolean
  person_id: number | null
  display_id: string | null
  similarity: number | null
  is_staff: boolean
  staff_name: string | null
  is_new: boolean
}

// ReID endpoints
export const getReIDStatus = () => api.get<ReIDStatus>('/reid/status')

export const initializeReID = () => api.post<{ status: string; message: string }>('/reid/initialize')

export const getReIDConfig = () => api.get<ReIDConfig>('/reid/config')

export const updateReIDConfig = (config: Partial<ReIDConfig>) =>
  api.put<ReIDConfig>('/reid/config', config)

export const getTrackedPersons = (activeOnly?: boolean, limit?: number, offset?: number) =>
  api.get<TrackedPersonList>('/reid/persons', {
    params: { active_only: activeOnly, limit, offset }
  })

export const getTrackedPerson = (personId: number) =>
  api.get<TrackedPerson>(`/reid/persons/${personId}`)

export const getPersonHistory = (personId: number, limit?: number) =>
  api.get<PersonHistory>(`/reid/persons/${personId}/history`, { params: { limit } })

export const getPersonJourney = (personId: number) =>
  api.get<PersonJourney>(`/reid/persons/${personId}/journey`)

export const linkPersonToStaff = (personId: number, staffId: number) =>
  api.post<{ message: string }>(`/reid/persons/${personId}/link-staff`, null, {
    params: { staff_id: staffId }
  })

export const deleteTrackedPerson = (personId: number) =>
  api.delete<{ message: string }>(`/reid/persons/${personId}`)

export const cleanupInactivePersons = (hours?: number) =>
  api.post<{ message: string }>('/reid/cleanup', null, { params: { hours } })

export const matchPersonImage = (image: string, cameraId?: string) =>
  api.post<MatchResult>('/reid/match', { image, camera_id: cameraId })

// New Enhanced Labeling Types
export interface PersonUpdate {
  name?: string
  is_regular?: boolean
  notes?: string
  person_type?: string  // "visitor", "regular", "staff"
}

export interface LabelAsRegularRequest {
  name: string
  notes?: string
}

export interface MergeRequest {
  keep_id: number
  merge_id: number
}

export interface SplitRequest {
  person_id: number
  sighting_ids?: number[]
  embedding_ids?: number[]
}

export interface NegativePairRequest {
  person_id_a: number
  person_id_b: number
  reason?: string
}

export interface PersonEmbeddingInfo {
  id: number
  camera_id: string | null
  confidence: number
  is_verified: boolean
  created_at: string
}

export interface PersonDetail extends TrackedPerson {
  embeddings: PersonEmbeddingInfo[]
  sightings: PersonSighting[]
}

export interface NegativePairInfo {
  id: number
  person_a: { id: number; display_id: string }
  person_b: { id: number; display_id: string }
  reason: string | null
  created_at: string
}

// Enhanced Labeling Endpoints
export const updatePerson = (personId: number, update: PersonUpdate) =>
  api.put<TrackedPerson>(`/reid/persons/${personId}`, update)

export const labelAsRegular = (personId: number, data: LabelAsRegularRequest) =>
  api.post<{ message: string }>(`/reid/persons/${personId}/label-regular`, data)

export const getPersonDetail = (personId: number) =>
  api.get<PersonDetail>(`/reid/persons/${personId}/detail`)

export const mergePersons = (data: MergeRequest) =>
  api.post<{ message: string; embeddings_moved: number; sightings_moved: number }>('/reid/merge', data)

export const splitPerson = (data: SplitRequest) =>
  api.post<{
    message: string
    new_person_id: number
    new_display_id: string
    embeddings_moved: number
    sightings_moved: number
  }>('/reid/split', data)

export const createNegativePair = (data: NegativePairRequest) =>
  api.post<{ message: string; id: number }>('/reid/negative-pair', data)

export const getNegativePairs = (limit?: number) =>
  api.get<{ pairs: NegativePairInfo[]; total: number }>('/reid/negative-pairs', { params: { limit } })

export const deleteNegativePair = (pairId: number) =>
  api.delete<{ message: string }>(`/reid/negative-pairs/${pairId}`)

export const deleteEmbedding = (personId: number, embeddingId: number) =>
  api.delete<{ message: string }>(`/reid/persons/${personId}/embeddings/${embeddingId}`)

export const verifyEmbedding = (personId: number, embeddingId: number) =>
  api.post<{ message: string }>(`/reid/persons/${personId}/embeddings/${embeddingId}/verify`)

export const getRegularCustomers = (limit?: number) =>
  api.get<{ regulars: TrackedPerson[]; total: number }>('/reid/regulars', { params: { limit } })

// ============== Detection Config Types ==============

export interface DetectSettings {
  enabled?: boolean
  min_area?: number
  max_area?: number
  threshold?: number
  min_score?: number
  max_disappeared?: number
}

export interface MotionSettings {
  threshold?: number
  contour_area?: number
  improve_contrast?: boolean
  frame_alpha?: number
  frame_height?: number
}

export interface StationarySettings {
  interval?: number
  threshold?: number
  max_frames?: {
    default: number | null
    objects: Record<string, number>
  }
}

export interface CameraDetectionSettings {
  camera_id: string
  enabled: boolean
  detect: DetectSettings
  motion: MotionSettings
  stationary: StationarySettings
  zones: string[]
}

export interface AllDetectionSettings {
  cameras: Record<string, CameraDetectionSettings>
  global: {
    detect: DetectSettings
    motion: MotionSettings
  }
}

export interface PresetConfig {
  name: string
  description: string
  detect?: DetectSettings
  motion?: MotionSettings
  stationary?: StationarySettings
  created_at?: string
}

export interface PresetsResponse {
  builtin: Record<string, PresetConfig>
  custom: Record<string, PresetConfig>
  camera_groups: Record<string, string[]>
}

export interface ConfigHistoryEntry {
  id: string
  timestamp: string
  reason: string
  config_file?: string
}

export interface CameraDetectionSettingsUpdate {
  detect?: DetectSettings
  motion?: MotionSettings
  stationary?: StationarySettings
}

export interface CustomPresetCreate {
  name: string
  description: string
  detect?: DetectSettings
  motion?: MotionSettings
  stationary?: StationarySettings
}

export interface CameraStats {
  camera_id: string
  detection_fps: number
  process_fps: number
  detection_enabled: boolean
  error?: string
}

// Detection Config endpoints
export const getAllDetectionConfig = () =>
  api.get<AllDetectionSettings>('/detection/config')

export const getCameraDetectionConfig = (cameraId: string) =>
  api.get<CameraDetectionSettings>(`/detection/config/${cameraId}`)

export const updateCameraDetectionConfig = (cameraId: string, settings: CameraDetectionSettingsUpdate) =>
  api.put<CameraDetectionSettings>(`/detection/config/${cameraId}`, settings)

export const reloadFrigateConfig = () =>
  api.post<{ success: boolean; message: string }>('/detection/reload')

export const getDetectionPresets = () =>
  api.get<PresetsResponse>('/detection/presets')

export const applyPresetToCamera = (cameraId: string, presetName: string) =>
  api.post<CameraDetectionSettings>(`/detection/presets/${cameraId}/apply`, { preset_name: presetName })

export const applyPresetToAllCameras = (presetName: string) =>
  api.post<Record<string, CameraDetectionSettings>>('/detection/presets/apply-all', { preset_name: presetName })

export const applyPresetToGroup = (groupName: string, presetName: string) =>
  api.post<Record<string, CameraDetectionSettings>>('/detection/presets/apply-group', {
    group_name: groupName,
    preset_name: presetName
  })

export const createCustomPreset = (preset: CustomPresetCreate) =>
  api.post<PresetConfig>('/detection/presets/custom', preset)

export const deleteCustomPreset = (presetName: string) =>
  api.delete(`/detection/presets/custom/${presetName}`)

export const getConfigHistory = (limit?: number) =>
  api.get<ConfigHistoryEntry[]>('/detection/config/history', { params: { limit } })

export const restoreConfig = (historyId: string) =>
  api.post<{ restored: string; message: string }>(`/detection/config/restore/${historyId}`)

export const getCameraDetectionStats = (cameraId: string) =>
  api.get<CameraStats>(`/detection/stats/${cameraId}`)

export const getCameraGroups = () =>
  api.get<Record<string, string[]>>('/detection/camera-groups')

// Customer Insights types
export type LoyaltyTier = 'new' | 'occasional' | 'regular' | 'vip'

export interface CustomerProfile {
  profile_id: string
  total_visits: number
  loyalty_tier: LoyaltyTier
  loyalty_points: number
  first_visit: string | null
  last_visit: string | null
  avg_dwell_minutes: number | null
  favorite_zone: string | null
  days_since_last_visit: number | null
}

export interface TierDistribution {
  new: number
  occasional: number
  regular: number
  vip: number
}

export interface InsightsSummary {
  total_customers: number
  tier_distribution: TierDistribution
  recent_visitors_7d: number
  returning_rate_7d: number
  avg_visits_per_customer: number
  avg_dwell_minutes: number
  vip_count: number
  regular_count: number
}

export interface FrequencyDistribution {
  once: number
  '2-3_times': number
  '4-7_times': number
  '8+_times': number
}

export interface VisitFrequency {
  period_days: number
  frequency_distribution: FrequencyDistribution
  total_active_customers: number
}

export interface RetentionPeriod {
  total_visitors: number
  returning_visitors: number
  new_visitors: number
  retention_rate: number
}

export interface RetentionAnalysis {
  '7d': RetentionPeriod
  '30d': RetentionPeriod
  '90d': RetentionPeriod
}

export interface ChurnRiskCustomer {
  profile_id: string
  loyalty_tier: LoyaltyTier
  total_visits: number
  last_visit: string | null
  days_since_visit: number | null
  loyalty_points: number
}

export interface CustomerJourneyPatterns {
  profile_id: string
  total_visits: number
  zone_time_minutes: Record<string, number>
  preferred_time: 'morning' | 'afternoon' | 'evening' | 'unknown'
  favorite_zone: string | null
  loyalty_tier: LoyaltyTier
  loyalty_points: number
  first_visit: string | null
  last_visit: string | null
}

export interface InsightsDashboard {
  summary: InsightsSummary
  top_customers: CustomerProfile[]
  retention: RetentionAnalysis
  churn_risk: ChurnRiskCustomer[]
  frequency: VisitFrequency
}

// Customer Insights endpoints
export const getInsightsSummary = () =>
  api.get<InsightsSummary>('/insights/summary')

export const getTopCustomers = (limit = 20) =>
  api.get<CustomerProfile[]>('/insights/top-customers', { params: { limit } })

export const getVisitFrequency = (days = 30) =>
  api.get<VisitFrequency>('/insights/frequency', { params: { days } })

export const getRetentionAnalysis = () =>
  api.get<RetentionAnalysis>('/insights/retention')

export const getChurnRisk = (days = 30) =>
  api.get<ChurnRiskCustomer[]>('/insights/churn-risk', { params: { days } })

export const getCustomerDetails = (profileId: string) =>
  api.get<CustomerJourneyPatterns>(`/insights/customer/${profileId}`)

export const getInsightsDashboard = () =>
  api.get<InsightsDashboard>('/insights/dashboard')

export default api
