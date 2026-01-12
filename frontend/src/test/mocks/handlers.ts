import { http, HttpResponse } from 'msw'
import {
  mockHealthStatus, mockCameras, mockOccupancy, mockEvents, mockStaff,
  mockAnalyticsSummary, mockHourlyCounts, mockZoneActivity, mockWaitTimes,
  mockAlertConfigs, mockAlerts, mockAlertStats, mockUser, mockProfile,
  mockIncidents, mockIncidentStats, mockShiftNotes, mockNoteStats,
  mockLeaderboard, mockTeamSummary, mockCurrentShift, mockZones,
  mockCameraHealth, mockCameraHealthSummary
} from './data'

export const handlers = [
  // Health
  http.get('/api/health', () => {
    return HttpResponse.json(mockHealthStatus)
  }),

  // Cameras
  http.get('/api/cameras', () => {
    return HttpResponse.json(mockCameras)
  }),
  http.get('/api/cameras/health', () => {
    return HttpResponse.json(mockCameraHealth)
  }),
  http.get('/api/cameras/health/summary', () => {
    return HttpResponse.json(mockCameraHealthSummary)
  }),

  // Occupancy
  http.get('/api/analytics/occupancy', () => {
    return HttpResponse.json(mockOccupancy)
  }),
  http.get('/api/analytics/occupancy/history', () => {
    return HttpResponse.json({ history: [mockOccupancy], error: null })
  }),
  http.get('/api/analytics/occupancy/live', () => {
    return HttpResponse.json({
      timestamp: mockOccupancy.timestamp,
      total: mockOccupancy.total_count,
      by_zone: mockOccupancy.by_zone,
      source: 'demo',
    })
  }),

  // Events
  http.get('/api/events', () => {
    return HttpResponse.json(mockEvents)
  }),

  // Staff
  http.get('/api/staff', () => {
    return HttpResponse.json({ staff: mockStaff, total: mockStaff.length })
  }),
  http.get('/api/staff/:id', ({ params }) => {
    const staff = mockStaff.find(s => s.id === Number(params.id))
    if (staff) {
      return HttpResponse.json(staff)
    }
    return new HttpResponse(null, { status: 404 })
  }),
  http.post('/api/staff', async ({ request }) => {
    const body = await request.json() as { name: string; role: string; badge_id?: string }
    const newStaff = {
      id: mockStaff.length + 1,
      name: body.name,
      role: body.role,
      badge_id: body.badge_id || null,
      photo_path: null,
      frigate_face_id: null,
      is_active: true,
      face_trained: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    return HttpResponse.json(newStaff)
  }),
  http.put('/api/staff/:id', async ({ params, request }) => {
    const body = await request.json() as { name?: string; role?: string; badge_id?: string; is_active?: boolean }
    const staff = mockStaff.find(s => s.id === Number(params.id))
    if (staff) {
      return HttpResponse.json({ ...staff, ...body, updated_at: new Date().toISOString() })
    }
    return new HttpResponse(null, { status: 404 })
  }),
  http.delete('/api/staff/:id', ({ params }) => {
    const staff = mockStaff.find(s => s.id === Number(params.id))
    if (staff) {
      return HttpResponse.json({ message: 'Staff deleted' })
    }
    return new HttpResponse(null, { status: 404 })
  }),
  http.post('/api/staff/:id/train', ({ params }) => {
    const staff = mockStaff.find(s => s.id === Number(params.id))
    if (staff) {
      return HttpResponse.json({
        staff_id: staff.id,
        name: staff.name,
        face_trained: true,
        frigate_face_id: `face_${staff.id}`,
        message: 'Face trained successfully',
      })
    }
    return new HttpResponse(null, { status: 404 })
  }),
  http.get('/api/staff/:id/training-status', ({ params }) => {
    const staff = mockStaff.find(s => s.id === Number(params.id))
    if (staff) {
      return HttpResponse.json({
        staff_id: staff.id,
        name: staff.name,
        face_trained: staff.face_trained,
        frigate_face_id: staff.frigate_face_id,
        message: staff.face_trained ? 'Face is trained' : 'Face not trained',
      })
    }
    return new HttpResponse(null, { status: 404 })
  }),

  // Analytics
  http.get('/api/analytics/summary', () => {
    return HttpResponse.json(mockAnalyticsSummary)
  }),
  http.get('/api/analytics/hourly-counts', () => {
    return HttpResponse.json(mockHourlyCounts)
  }),
  http.get('/api/analytics/zone-activity', () => {
    return HttpResponse.json(mockZoneActivity)
  }),
  http.get('/api/analytics/wait-times', () => {
    return HttpResponse.json(mockWaitTimes)
  }),
  http.get('/api/analytics/staff-performance', () => {
    return HttpResponse.json([
      { name: 'John Smith', floor_time: 75, idle_time: 25 },
      { name: 'Jane Doe', floor_time: 85, idle_time: 15 },
    ])
  }),
  http.get('/api/analytics/table-turnover', () => {
    return HttpResponse.json([
      { table_id: 'Table 1', turnovers: 4, avg_duration: 45 },
      { table_id: 'Table 2', turnovers: 5, avg_duration: 38 },
    ])
  }),
  http.get('/api/analytics/customer-staff-breakdown', () => {
    return HttpResponse.json([
      { label: 'Customers', value: 256 },
      { label: 'Staff', value: 8 },
    ])
  }),

  // Alert Configs
  http.get('/api/alerts/configs', () => {
    return HttpResponse.json(mockAlertConfigs)
  }),
  http.post('/api/alerts/configs', async ({ request }) => {
    const body = await request.json() as { name: string; alert_type: string }
    return HttpResponse.json({
      id: mockAlertConfigs.length + 1,
      ...body,
      severity: 'warning',
      threshold_value: null,
      threshold_operator: 'gt',
      zone_id: null,
      camera_id: null,
      is_enabled: true,
      notify_email: false,
      notify_webhook: false,
      webhook_url: null,
      cooldown_minutes: 15,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }),
  http.put('/api/alerts/configs/:id', async ({ params, request }) => {
    const body = await request.json()
    const config = mockAlertConfigs.find(c => c.id === Number(params.id))
    if (config) {
      return HttpResponse.json({ ...config, ...body, updated_at: new Date().toISOString() })
    }
    return new HttpResponse(null, { status: 404 })
  }),
  http.delete('/api/alerts/configs/:id', () => {
    return HttpResponse.json({ message: 'Config deleted' })
  }),
  http.post('/api/alerts/configs/:id/toggle', ({ params }) => {
    const config = mockAlertConfigs.find(c => c.id === Number(params.id))
    if (config) {
      return HttpResponse.json({ ...config, is_enabled: !config.is_enabled })
    }
    return new HttpResponse(null, { status: 404 })
  }),

  // Alerts
  http.get('/api/alerts', () => {
    return HttpResponse.json(mockAlerts)
  }),
  http.get('/api/alerts/stats/summary', () => {
    return HttpResponse.json(mockAlertStats)
  }),
  http.post('/api/alerts/:id/acknowledge', ({ params }) => {
    const alert = mockAlerts.find(a => a.id === Number(params.id))
    if (alert) {
      return HttpResponse.json({ ...alert, is_acknowledged: true, acknowledged_at: new Date().toISOString() })
    }
    return new HttpResponse(null, { status: 404 })
  }),
  http.post('/api/alerts/acknowledge-all', () => {
    return HttpResponse.json({ acknowledged: mockAlerts.length })
  }),

  // Auth
  http.post('/api/auth/login', async ({ request }) => {
    const body = await request.text()
    const params = new URLSearchParams(body)
    const username = params.get('username')
    const password = params.get('password')

    if (username === 'admin' && password === 'password') {
      return HttpResponse.json({
        access_token: 'mock_token_12345',
        token_type: 'bearer',
        expires_in: 3600,
        user: mockUser,
      })
    }
    return new HttpResponse(JSON.stringify({ detail: 'Invalid credentials' }), { status: 401 })
  }),
  http.post('/api/auth/register', async ({ request }) => {
    const body = await request.json() as { username: string; password: string; email?: string }
    return HttpResponse.json({
      id: 2,
      username: body.username,
      email: body.email || null,
      role: 'viewer',
      is_active: true,
      created_at: new Date().toISOString(),
      last_login: null,
    })
  }),
  http.get('/api/auth/me', () => {
    return HttpResponse.json(mockUser)
  }),
  http.get('/api/auth/check', () => {
    return HttpResponse.json({ authenticated: true, username: 'admin', role: 'admin' })
  }),

  // Profile
  http.get('/api/profile', () => {
    return HttpResponse.json(mockProfile)
  }),
  http.put('/api/profile', async ({ request }) => {
    const body = await request.json()
    return HttpResponse.json({ ...mockProfile, ...body })
  }),
  http.put('/api/profile/notifications', async ({ request }) => {
    const body = await request.json()
    return HttpResponse.json({ ...mockProfile, ...body })
  }),

  // Incidents
  http.get('/api/incidents', () => {
    return HttpResponse.json(mockIncidents)
  }),
  http.get('/api/incidents/stats/summary', () => {
    return HttpResponse.json(mockIncidentStats)
  }),
  http.get('/api/incidents/types', () => {
    return HttpResponse.json({
      types: {
        complaint: { name: 'Complaint', description: 'Customer complaint' },
        spill: { name: 'Spill', description: 'Spill or mess' },
        equipment: { name: 'Equipment', description: 'Equipment issue' },
        safety: { name: 'Safety', description: 'Safety concern' },
        other: { name: 'Other', description: 'Other incident' },
      }
    })
  }),
  http.post('/api/incidents', async ({ request }) => {
    const body = await request.json() as { title: string; incident_type: string }
    return HttpResponse.json({
      id: mockIncidents.length + 1,
      title: body.title,
      incident_type: body.incident_type,
      severity: 'medium',
      status: 'open',
      ...body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }),
  http.put('/api/incidents/:id', async ({ params, request }) => {
    const body = await request.json()
    const incident = mockIncidents.find(i => i.id === Number(params.id))
    if (incident) {
      return HttpResponse.json({ ...incident, ...body, updated_at: new Date().toISOString() })
    }
    return new HttpResponse(null, { status: 404 })
  }),
  http.delete('/api/incidents/:id', () => {
    return HttpResponse.json({ message: 'Incident deleted' })
  }),
  http.post('/api/incidents/:id/resolve', ({ params }) => {
    const incident = mockIncidents.find(i => i.id === Number(params.id))
    if (incident) {
      return HttpResponse.json({ ...incident, status: 'resolved', resolved_at: new Date().toISOString() })
    }
    return new HttpResponse(null, { status: 404 })
  }),

  // Shift Notes
  http.get('/api/notes', () => {
    return HttpResponse.json(mockShiftNotes)
  }),
  http.get('/api/notes/current-shift', () => {
    return HttpResponse.json(mockShiftNotes.filter(n => n.shift_type === 'afternoon'))
  }),
  http.get('/api/notes/stats/summary', () => {
    return HttpResponse.json(mockNoteStats)
  }),
  http.get('/api/notes/unread-count', () => {
    return HttpResponse.json({ unread_count: mockNoteStats.unread })
  }),
  http.get('/api/notes/categories', () => {
    return HttpResponse.json({
      categories: {
        general: { name: 'General', description: 'General notes', color: '#6B7280' },
        customer: { name: 'Customer', description: 'Customer related', color: '#3B82F6' },
        maintenance: { name: 'Maintenance', description: 'Maintenance notes', color: '#F59E0B' },
        inventory: { name: 'Inventory', description: 'Inventory notes', color: '#10B981' },
        staff: { name: 'Staff', description: 'Staff related', color: '#8B5CF6' },
      }
    })
  }),
  http.get('/api/notes/templates', () => {
    return HttpResponse.json({
      templates: [
        { id: '1', category: 'maintenance', content: 'Equipment needs repair: ' },
        { id: '2', category: 'inventory', content: 'Running low on: ' },
        { id: '3', category: 'customer', content: 'VIP guest: ' },
      ]
    })
  }),
  http.post('/api/notes', async ({ request }) => {
    const body = await request.json() as { content: string; category?: string }
    return HttpResponse.json({
      id: mockShiftNotes.length + 1,
      content: body.content,
      category: body.category || 'general',
      is_pinned: false,
      is_acknowledged: false,
      acknowledged_by: null,
      acknowledged_by_name: null,
      acknowledged_at: null,
      created_by: 1,
      created_by_name: 'Test User',
      shift_date: new Date().toISOString().split('T')[0],
      shift_type: 'afternoon',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }),
  http.put('/api/notes/:id', async ({ params, request }) => {
    const body = await request.json()
    const note = mockShiftNotes.find(n => n.id === Number(params.id))
    if (note) {
      return HttpResponse.json({ ...note, ...body, updated_at: new Date().toISOString() })
    }
    return new HttpResponse(null, { status: 404 })
  }),
  http.delete('/api/notes/:id', () => {
    return HttpResponse.json({ message: 'Note deleted' })
  }),
  http.post('/api/notes/:id/pin', ({ params }) => {
    const note = mockShiftNotes.find(n => n.id === Number(params.id))
    if (note) {
      return HttpResponse.json({ success: true, is_pinned: !note.is_pinned })
    }
    return new HttpResponse(null, { status: 404 })
  }),
  http.post('/api/notes/:id/acknowledge', ({ params }) => {
    const note = mockShiftNotes.find(n => n.id === Number(params.id))
    if (note) {
      return HttpResponse.json({ ...note, is_acknowledged: true, acknowledged_at: new Date().toISOString() })
    }
    return new HttpResponse(null, { status: 404 })
  }),

  // Scorecards
  http.get('/api/scorecards/leaderboard', () => {
    return HttpResponse.json(mockLeaderboard)
  }),
  http.get('/api/scorecards/team/summary', () => {
    return HttpResponse.json(mockTeamSummary)
  }),
  http.get('/api/scorecards/badges', () => {
    return HttpResponse.json([
      { id: 'speed_star', name: 'Speed Star', description: 'Fast response times', icon: '⚡', earned_date: null },
      { id: 'customer_favorite', name: 'Customer Favorite', description: 'High ratings', icon: '⭐', earned_date: null },
      { id: 'team_player', name: 'Team Player', description: 'Helps teammates', icon: '🤝', earned_date: null },
    ])
  }),
  http.get('/api/scorecards/staff/:id', ({ params }) => {
    const entry = mockLeaderboard.find(e => e.staff_id === Number(params.id))
    if (entry) {
      return HttpResponse.json({
        staff_id: entry.staff_id,
        name: entry.name,
        role: entry.role,
        photo_url: entry.photo_url,
        current_metrics: {
          avg_response_time: entry.response_time,
          tables_served_per_hour: entry.tables_served / 8,
          floor_time_percent: 80,
          idle_time_percent: 20,
          customer_interactions: 45,
          zones_covered: ['dining', 'bar'],
        },
        trends: [],
        team_comparisons: [],
        weekly_summaries: [],
        badges: entry.badges,
        streak_days: entry.streak_days,
        rank: entry.rank,
        total_staff: mockLeaderboard.length,
      })
    }
    return new HttpResponse(null, { status: 404 })
  }),

  // Shifts
  http.get('/api/shifts/current', () => {
    return HttpResponse.json(mockCurrentShift)
  }),
  http.get('/api/shifts/history', () => {
    return HttpResponse.json([
      {
        id: 1,
        shift_date: '2026-01-10',
        shift_type: 'afternoon',
        total_customers: 125,
        staff_count: 6,
        avg_wait_time: 8.5,
        created_at: '2026-01-10T19:00:00Z',
      },
      {
        id: 2,
        shift_date: '2026-01-09',
        shift_type: 'afternoon',
        total_customers: 115,
        staff_count: 5,
        avg_wait_time: 9.2,
        created_at: '2026-01-09T19:00:00Z',
      },
    ])
  }),
  http.post('/api/shifts/generate', () => {
    return HttpResponse.json(mockCurrentShift)
  }),

  // Zones
  http.get('/api/zones', () => {
    return HttpResponse.json(mockZones)
  }),
  http.get('/api/zones/types', () => {
    return HttpResponse.json({
      types: [
        { id: 'dining', name: 'Dining', description: 'Dining area', color: '#4CAF50' },
        { id: 'bar', name: 'Bar', description: 'Bar area', color: '#2196F3' },
        { id: 'kitchen', name: 'Kitchen', description: 'Kitchen', color: '#FF9800' },
        { id: 'entrance', name: 'Entrance', description: 'Entrance', color: '#9C27B0' },
      ]
    })
  }),
  http.post('/api/zones', async ({ request }) => {
    const body = await request.json() as { name: string; zone_type: string }
    return HttpResponse.json({
      id: mockZones.length + 1,
      name: body.name,
      zone_type: body.zone_type,
      capacity: null,
      camera_ids: [],
      polygon: null,
      color: '#4CAF50',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }),
]
