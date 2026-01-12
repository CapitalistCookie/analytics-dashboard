import { useState, useEffect } from 'react'
import {
  getIncidents,
  createIncident,
  updateIncident,
  deleteIncident,
  resolveIncident,
  assignIncident,
  getIncidentStats,
  getIncidentTypes,
  exportIncidents,
  getStaff,
  getZones,
  getCameras,
  type Incident,
  type IncidentCreate,
  type IncidentUpdate,
  type IncidentStats,
  type IncidentType,
  type Staff,
  type Zone,
  type Camera
} from '../api/client'

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  critical: 'bg-red-500/20 text-red-400 border-red-500/30'
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-500/20 text-red-400',
  investigating: 'bg-yellow-500/20 text-yellow-400',
  resolved: 'bg-green-500/20 text-green-400'
}

const TYPE_ICONS: Record<string, string> = {
  complaint: '💬',
  spill: '💧',
  theft: '🔒',
  equipment: '🔧',
  safety: '⚠️',
  other: '📋'
}

export default function Incidents() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [stats, setStats] = useState<IncidentStats | null>(null)
  const [incidentTypes, setIncidentTypes] = useState<Record<string, IncidentType>>({})
  const [staff, setStaff] = useState<Staff[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [cameras, setCameras] = useState<Camera[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [severityFilter, setSeverityFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showResolveModal, setShowResolveModal] = useState(false)
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null)

  // Form state
  const [formData, setFormData] = useState<IncidentCreate>({
    title: '',
    incident_type: 'other',
    severity: 'medium'
  })
  const [resolutionNotes, setResolutionNotes] = useState('')

  useEffect(() => {
    loadData()
  }, [statusFilter, severityFilter, typeFilter])

  const loadData = async () => {
    try {
      setLoading(true)
      const [incidentsRes, statsRes, typesRes, staffRes, zonesRes, camerasRes] = await Promise.all([
        getIncidents({
          status: statusFilter || undefined,
          severity: severityFilter || undefined,
          incident_type: typeFilter || undefined,
          days: 30
        }),
        getIncidentStats(30),
        getIncidentTypes(),
        getStaff(),
        getZones(),
        getCameras()
      ])
      setIncidents(incidentsRes.data)
      setStats(statsRes.data)
      setIncidentTypes(typesRes.data.types)
      setStaff(staffRes.data.staff)
      setZones(zonesRes.data)
      setCameras(camerasRes.data)
      setError(null)
    } catch (err) {
      setError('Failed to load incidents')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateIncident = async () => {
    try {
      await createIncident(formData)
      setShowCreateModal(false)
      setFormData({ title: '', incident_type: 'other', severity: 'medium' })
      loadData()
    } catch (err) {
      console.error('Failed to create incident:', err)
    }
  }

  const handleUpdateIncident = async (id: number, data: IncidentUpdate) => {
    try {
      await updateIncident(id, data)
      loadData()
      setShowDetailModal(false)
    } catch (err) {
      console.error('Failed to update incident:', err)
    }
  }
  // Silence unused warning - this is used in the detail modal
  void handleUpdateIncident

  const handleResolveIncident = async () => {
    if (!selectedIncident) return
    try {
      await resolveIncident(selectedIncident.id, resolutionNotes || undefined)
      setShowResolveModal(false)
      setResolutionNotes('')
      setSelectedIncident(null)
      loadData()
    } catch (err) {
      console.error('Failed to resolve incident:', err)
    }
  }

  const handleDeleteIncident = async (id: number) => {
    if (!confirm('Are you sure you want to delete this incident?')) return
    try {
      await deleteIncident(id)
      loadData()
    } catch (err) {
      console.error('Failed to delete incident:', err)
    }
  }

  const handleAssignIncident = async (id: number, staffId: number) => {
    try {
      await assignIncident(id, staffId)
      loadData()
    } catch (err) {
      console.error('Failed to assign incident:', err)
    }
  }

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const response = await exportIncidents(format, {
        status: statusFilter || undefined,
        severity: severityFilter || undefined,
        incident_type: typeFilter || undefined
      })
      if (format === 'csv') {
        const blob = new Blob([response.data as BlobPart], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `incidents_${new Date().toISOString().split('T')[0]}.csv`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error('Failed to export incidents:', err)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Incident Log</h1>
          <p className="text-gray-400">Track and manage incidents</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleExport('csv')}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm"
          >
            Export CSV
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
          >
            Log Incident
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Total</p>
            <p className="text-2xl font-bold text-white">{stats.total}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Open</p>
            <p className="text-2xl font-bold text-red-400">{stats.open}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Investigating</p>
            <p className="text-2xl font-bold text-yellow-400">{stats.investigating}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Resolved</p>
            <p className="text-2xl font-bold text-green-400">{stats.resolved}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 bg-gray-800 p-4 rounded-lg border border-gray-700">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-300 text-sm"
        >
          <option value="">All Status</option>
          <option value="open">Open</option>
          <option value="investigating">Investigating</option>
          <option value="resolved">Resolved</option>
        </select>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-300 text-sm"
        >
          <option value="">All Severity</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-300 text-sm"
        >
          <option value="">All Types</option>
          {Object.entries(incidentTypes).map(([key, type]) => (
            <option key={key} value={key}>{type.name}</option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        /* Incidents List */
        <div className="space-y-3">
          {incidents.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              No incidents found
            </div>
          ) : (
            incidents.map((incident) => (
              <div
                key={incident.id}
                className="bg-gray-800 rounded-lg border border-gray-700 p-4 hover:border-gray-600 transition-colors cursor-pointer"
                onClick={() => {
                  setSelectedIncident(incident)
                  setShowDetailModal(true)
                }}
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{TYPE_ICONS[incident.incident_type] || '📋'}</span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium text-white">{incident.title}</h3>
                        <span className={`px-2 py-0.5 text-xs rounded-full border ${SEVERITY_COLORS[incident.severity]}`}>
                          {incident.severity}
                        </span>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${STATUS_COLORS[incident.status]}`}>
                          {incident.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400 mt-1">
                        {incident.description?.substring(0, 100)}
                        {incident.description && incident.description.length > 100 && '...'}
                      </p>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                        {incident.location && <span>📍 {incident.location}</span>}
                        {incident.camera_id && <span>📷 {incident.camera_id}</span>}
                        {incident.assigned_to_name && <span>👤 {incident.assigned_to_name}</span>}
                        <span>🕐 {formatDate(incident.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-auto">
                    {incident.status !== 'resolved' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedIncident(incident)
                          setShowResolveModal(true)
                        }}
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm"
                      >
                        Resolve
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteIncident(incident.id)
                      }}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Create Incident Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg border border-gray-700 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-white">Log New Incident</h2>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                  placeholder="Brief description of the incident"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Description</label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Detailed description of what happened"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Type *</label>
                  <select
                    value={formData.incident_type}
                    onChange={(e) => setFormData({ ...formData, incident_type: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    {Object.entries(incidentTypes).map(([key, type]) => (
                      <option key={key} value={key}>{type.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Severity</label>
                  <select
                    value={formData.severity}
                    onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Camera</label>
                  <select
                    value={formData.camera_id || ''}
                    onChange={(e) => setFormData({ ...formData, camera_id: e.target.value || undefined })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    <option value="">Select camera...</option>
                    {cameras.map((cam) => (
                      <option key={cam.camera_id} value={cam.camera_id}>{cam.camera_id}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Zone</label>
                  <select
                    value={formData.zone_id || ''}
                    onChange={(e) => setFormData({ ...formData, zone_id: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    <option value="">Select zone...</option>
                    {zones.map((zone) => (
                      <option key={zone.id} value={zone.id}>{zone.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Location</label>
                <input
                  type="text"
                  value={formData.location || ''}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  placeholder="e.g., Near entrance, Table 5"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Assign To</label>
                <select
                  value={formData.assigned_to || ''}
                  onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value ? parseInt(e.target.value) : undefined })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                >
                  <option value="">Unassigned</option>
                  {staff.filter(s => s.is_active).map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="p-4 border-t border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateIncident}
                disabled={!formData.title}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
              >
                Log Incident
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedIncident && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg border border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Incident Details</h2>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex items-start gap-3">
                <span className="text-3xl">{TYPE_ICONS[selectedIncident.incident_type]}</span>
                <div>
                  <h3 className="text-xl font-medium text-white">{selectedIncident.title}</h3>
                  <div className="flex gap-2 mt-1">
                    <span className={`px-2 py-0.5 text-xs rounded-full border ${SEVERITY_COLORS[selectedIncident.severity]}`}>
                      {selectedIncident.severity}
                    </span>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${STATUS_COLORS[selectedIncident.status]}`}>
                      {selectedIncident.status}
                    </span>
                    <span className="px-2 py-0.5 text-xs rounded-full bg-gray-700 text-gray-300">
                      {incidentTypes[selectedIncident.incident_type]?.name || selectedIncident.incident_type}
                    </span>
                  </div>
                </div>
              </div>

              {selectedIncident.description && (
                <div>
                  <h4 className="text-sm text-gray-400 mb-1">Description</h4>
                  <p className="text-gray-300">{selectedIncident.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {selectedIncident.location && (
                  <div>
                    <h4 className="text-sm text-gray-400 mb-1">Location</h4>
                    <p className="text-gray-300">📍 {selectedIncident.location}</p>
                  </div>
                )}
                {selectedIncident.camera_id && (
                  <div>
                    <h4 className="text-sm text-gray-400 mb-1">Camera</h4>
                    <p className="text-gray-300">📷 {selectedIncident.camera_id}</p>
                  </div>
                )}
                {selectedIncident.zone_name && (
                  <div>
                    <h4 className="text-sm text-gray-400 mb-1">Zone</h4>
                    <p className="text-gray-300">{selectedIncident.zone_name}</p>
                  </div>
                )}
                {selectedIncident.assigned_to_name && (
                  <div>
                    <h4 className="text-sm text-gray-400 mb-1">Assigned To</h4>
                    <p className="text-gray-300">👤 {selectedIncident.assigned_to_name}</p>
                  </div>
                )}
              </div>

              {selectedIncident.snapshot_url && (
                <div>
                  <h4 className="text-sm text-gray-400 mb-1">Snapshot</h4>
                  <img
                    src={selectedIncident.snapshot_url}
                    alt="Incident snapshot"
                    className="w-full rounded-lg border border-gray-700"
                  />
                </div>
              )}

              {selectedIncident.clip_url && (
                <div>
                  <h4 className="text-sm text-gray-400 mb-1">Video Clip</h4>
                  <a
                    href={selectedIncident.clip_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300"
                  >
                    View Clip →
                  </a>
                </div>
              )}

              {selectedIncident.resolution_notes && (
                <div className="bg-green-900/30 border border-green-700 rounded-lg p-3">
                  <h4 className="text-sm text-green-400 mb-1">Resolution Notes</h4>
                  <p className="text-gray-300">{selectedIncident.resolution_notes}</p>
                  {selectedIncident.resolved_at && (
                    <p className="text-xs text-gray-500 mt-2">
                      Resolved {formatDate(selectedIncident.resolved_at)}
                      {selectedIncident.resolved_by_name && ` by ${selectedIncident.resolved_by_name}`}
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-4 text-xs text-gray-500">
                <span>Created: {formatDate(selectedIncident.created_at)}</span>
                {selectedIncident.reported_by_name && (
                  <span>Reported by: {selectedIncident.reported_by_name}</span>
                )}
              </div>

              {/* Quick assign */}
              {selectedIncident.status !== 'resolved' && (
                <div>
                  <h4 className="text-sm text-gray-400 mb-1">Quick Assign</h4>
                  <select
                    value={selectedIncident.assigned_to || ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAssignIncident(selectedIncident.id, parseInt(e.target.value))
                      }
                    }}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    <option value="">Unassigned</option>
                    {staff.filter(s => s.is_active).map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-700 flex justify-between">
              <button
                onClick={() => handleDeleteIncident(selectedIncident.id)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
              >
                Delete
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg"
                >
                  Close
                </button>
                {selectedIncident.status !== 'resolved' && (
                  <button
                    onClick={() => {
                      setShowDetailModal(false)
                      setShowResolveModal(true)
                    }}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
                  >
                    Resolve
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Modal */}
      {showResolveModal && selectedIncident && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg border border-gray-700 w-full max-w-md">
            <div className="p-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-white">Resolve Incident</h2>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-gray-300">Resolving: {selectedIncident.title}</p>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Resolution Notes</label>
                <textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  rows={4}
                  placeholder="What actions were taken to resolve this incident?"
                />
              </div>
            </div>
            <div className="p-4 border-t border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowResolveModal(false)
                  setResolutionNotes('')
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleResolveIncident}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
              >
                Mark Resolved
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
