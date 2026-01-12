import { useState, useEffect } from 'react'
import {
  getAlerts,
  getAlertConfigs,
  getAlertStats,
  getSchedules,
  createAlertConfig,
  updateAlertConfig,
  deleteAlertConfig,
  toggleAlertConfig,
  createSchedule,
  deleteSchedule,
  toggleSchedule,
  acknowledgeAlert,
  acknowledgeAllAlerts,
  Alert,
  AlertConfig,
  AlertConfigCreate,
  AlertStats,
  AfterHoursSchedule,
  ScheduleCreate
} from '../api/client'

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const ALERT_TYPES = [
  { id: 'occupancy', name: 'Occupancy', description: 'Trigger when occupancy exceeds threshold' },
  { id: 'wait_time', name: 'Wait Time', description: 'Trigger when wait time exceeds threshold' },
  { id: 'after_hours', name: 'After Hours', description: 'Trigger on activity during closed hours' },
  { id: 'zone_breach', name: 'Zone Breach', description: 'Trigger on unauthorized zone access' }
]

const SEVERITY_COLORS = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  info: 'bg-blue-500/20 text-blue-400 border-blue-500/30'
}

export default function Alerts() {
  const [activeTab, setActiveTab] = useState<'history' | 'config' | 'schedule'>('history')

  // Alert history
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [alertStats, setAlertStats] = useState<AlertStats | null>(null)
  const [alertsLoading, setAlertsLoading] = useState(true)
  const [severityFilter, setSeverityFilter] = useState<string>('')
  const [showAcknowledged, setShowAcknowledged] = useState(false)

  // Alert configurations
  const [configs, setConfigs] = useState<AlertConfig[]>([])
  const [configsLoading, setConfigsLoading] = useState(true)
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [editingConfig, setEditingConfig] = useState<AlertConfig | null>(null)

  // Schedules
  const [schedules, setSchedules] = useState<AfterHoursSchedule[]>([])
  const [schedulesLoading, setSchedulesLoading] = useState(true)
  const [showScheduleModal, setShowScheduleModal] = useState(false)

  // Config form state
  const [configForm, setConfigForm] = useState<AlertConfigCreate>({
    name: '',
    alert_type: 'occupancy',
    severity: 'warning',
    threshold_value: 50,
    threshold_operator: 'gt',
    is_enabled: true,
    cooldown_minutes: 15
  })

  // Schedule form state
  const [scheduleForm, setScheduleForm] = useState<ScheduleCreate>({
    name: '',
    day_of_week: 0,
    start_hour: 22,
    start_minute: 0,
    end_hour: 6,
    end_minute: 0,
    is_enabled: true
  })

  // Load alert history
  useEffect(() => {
    loadAlerts()
    loadStats()
  }, [severityFilter, showAcknowledged])

  // Load configs when tab changes
  useEffect(() => {
    if (activeTab === 'config') {
      loadConfigs()
    } else if (activeTab === 'schedule') {
      loadSchedules()
    }
  }, [activeTab])

  const loadAlerts = async () => {
    setAlertsLoading(true)
    try {
      const params: Parameters<typeof getAlerts>[0] = {
        hours: 24,
        limit: 100
      }
      if (severityFilter) params.severity = severityFilter
      if (!showAcknowledged) params.is_acknowledged = false

      const response = await getAlerts(params)
      setAlerts(response.data)
    } catch (err) {
      console.error('Failed to load alerts:', err)
    } finally {
      setAlertsLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      const response = await getAlertStats(24)
      setAlertStats(response.data)
    } catch (err) {
      console.error('Failed to load stats:', err)
    }
  }

  const loadConfigs = async () => {
    setConfigsLoading(true)
    try {
      const response = await getAlertConfigs()
      setConfigs(response.data)
    } catch (err) {
      console.error('Failed to load configs:', err)
    } finally {
      setConfigsLoading(false)
    }
  }

  const loadSchedules = async () => {
    setSchedulesLoading(true)
    try {
      const response = await getSchedules()
      setSchedules(response.data)
    } catch (err) {
      console.error('Failed to load schedules:', err)
    } finally {
      setSchedulesLoading(false)
    }
  }

  const handleAcknowledge = async (id: number) => {
    try {
      await acknowledgeAlert(id)
      loadAlerts()
      loadStats()
    } catch (err) {
      console.error('Failed to acknowledge alert:', err)
    }
  }

  const handleAcknowledgeAll = async () => {
    try {
      await acknowledgeAllAlerts()
      loadAlerts()
      loadStats()
    } catch (err) {
      console.error('Failed to acknowledge all alerts:', err)
    }
  }

  const handleSaveConfig = async () => {
    try {
      if (editingConfig) {
        await updateAlertConfig(editingConfig.id, configForm)
      } else {
        await createAlertConfig(configForm)
      }
      setShowConfigModal(false)
      setEditingConfig(null)
      resetConfigForm()
      loadConfigs()
    } catch (err) {
      console.error('Failed to save config:', err)
    }
  }

  const handleDeleteConfig = async (id: number) => {
    if (!confirm('Are you sure you want to delete this alert configuration?')) return
    try {
      await deleteAlertConfig(id)
      loadConfigs()
    } catch (err) {
      console.error('Failed to delete config:', err)
    }
  }

  const handleToggleConfig = async (id: number) => {
    try {
      await toggleAlertConfig(id)
      loadConfigs()
    } catch (err) {
      console.error('Failed to toggle config:', err)
    }
  }

  const handleSaveSchedule = async () => {
    try {
      await createSchedule(scheduleForm)
      setShowScheduleModal(false)
      resetScheduleForm()
      loadSchedules()
    } catch (err) {
      console.error('Failed to save schedule:', err)
    }
  }

  const handleDeleteSchedule = async (id: number) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return
    try {
      await deleteSchedule(id)
      loadSchedules()
    } catch (err) {
      console.error('Failed to delete schedule:', err)
    }
  }

  const handleToggleSchedule = async (id: number) => {
    try {
      await toggleSchedule(id)
      loadSchedules()
    } catch (err) {
      console.error('Failed to toggle schedule:', err)
    }
  }

  const openEditConfig = (config: AlertConfig) => {
    setEditingConfig(config)
    setConfigForm({
      name: config.name,
      alert_type: config.alert_type,
      severity: config.severity,
      threshold_value: config.threshold_value || undefined,
      threshold_operator: config.threshold_operator,
      zone_id: config.zone_id || undefined,
      camera_id: config.camera_id || undefined,
      is_enabled: config.is_enabled,
      notify_email: config.notify_email,
      notify_webhook: config.notify_webhook,
      webhook_url: config.webhook_url || undefined,
      cooldown_minutes: config.cooldown_minutes
    })
    setShowConfigModal(true)
  }

  const resetConfigForm = () => {
    setConfigForm({
      name: '',
      alert_type: 'occupancy',
      severity: 'warning',
      threshold_value: 50,
      threshold_operator: 'gt',
      is_enabled: true,
      cooldown_minutes: 15
    })
  }

  const resetScheduleForm = () => {
    setScheduleForm({
      name: '',
      day_of_week: 0,
      start_hour: 22,
      start_minute: 0,
      end_hour: 6,
      end_minute: 0,
      is_enabled: true
    })
  }

  const formatTime = (date: string) => {
    return new Date(date).toLocaleString()
  }

  const formatHour = (hour: number, minute: number = 0) => {
    const date = new Date()
    date.setHours(hour, minute)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Alerts</h1>
          <p className="text-gray-400 mt-1">Monitor and configure system alerts</p>
        </div>
      </div>

      {/* Stats Cards */}
      {alertStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-400">Total (24h)</p>
            <p className="text-2xl font-bold text-white">{alertStats.total}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-400">Unacknowledged</p>
            <p className="text-2xl font-bold text-red-400">{alertStats.unacknowledged}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-400">Critical</p>
            <p className="text-2xl font-bold text-red-400">{alertStats.by_severity.critical}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-400">Warnings</p>
            <p className="text-2xl font-bold text-yellow-400">{alertStats.by_severity.warning}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-700">
        <nav className="flex space-x-8">
          {[
            { id: 'history', name: 'Alert History' },
            { id: 'config', name: 'Configuration' },
            { id: 'schedule', name: 'After-Hours Schedule' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-600'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Alert History Tab */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-4 items-center">
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
            >
              <option value="">All Severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showAcknowledged}
                onChange={(e) => setShowAcknowledged(e.target.checked)}
                className="rounded border-gray-600 bg-gray-700 text-blue-500"
              />
              <span className="text-sm text-gray-400">Show acknowledged</span>
            </label>

            {alertStats && alertStats.unacknowledged > 0 && (
              <button
                onClick={handleAcknowledgeAll}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 ml-auto"
              >
                Acknowledge All ({alertStats.unacknowledged})
              </button>
            )}
          </div>

          {/* Alert List */}
          {alertsLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-12 bg-gray-800 rounded-lg">
              <p className="text-gray-500">No alerts found</p>
            </div>
          ) : (
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-700/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Severity</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Message</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Time</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {alerts.map((alert) => (
                    <tr key={alert.id} className={alert.is_acknowledged ? 'bg-gray-800/50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full border ${SEVERITY_COLORS[alert.severity as keyof typeof SEVERITY_COLORS] || SEVERITY_COLORS.info}`}>
                          {alert.severity}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 capitalize">
                        {alert.alert_type.replace('_', ' ')}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-300 max-w-md truncate">
                        {alert.message}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatTime(alert.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {alert.is_acknowledged ? (
                          <span className="text-xs text-gray-500">
                            Ack by {alert.acknowledged_by}
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded-full">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {!alert.is_acknowledged && (
                          <button
                            onClick={() => handleAcknowledge(alert.id)}
                            className="text-sm text-blue-400 hover:text-blue-300"
                          >
                            Acknowledge
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Configuration Tab */}
      {activeTab === 'config' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => {
                resetConfigForm()
                setEditingConfig(null)
                setShowConfigModal(true)
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Add Alert Rule
            </button>
          </div>

          {configsLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : configs.length === 0 ? (
            <div className="text-center py-12 bg-gray-800 rounded-lg">
              <p className="text-gray-500">No alert configurations yet</p>
              <p className="text-sm text-gray-600 mt-1">Create your first alert rule to get started</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {configs.map((config) => (
                <div
                  key={config.id}
                  className={`bg-gray-800 rounded-lg p-4 border-l-4 ${
                    config.is_enabled ? 'border-green-500' : 'border-gray-600'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-medium text-white">{config.name}</h3>
                        <span className={`px-2 py-0.5 text-xs rounded border ${SEVERITY_COLORS[config.severity as keyof typeof SEVERITY_COLORS]}`}>
                          {config.severity}
                        </span>
                        {!config.is_enabled && (
                          <span className="px-2 py-0.5 text-xs bg-gray-700 text-gray-400 rounded">
                            Disabled
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 mt-1">
                        Type: {config.alert_type.replace('_', ' ')} |
                        {config.threshold_value && ` Threshold: ${config.threshold_operator} ${config.threshold_value} |`}
                        {' '}Cooldown: {config.cooldown_minutes}min
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleConfig(config.id)}
                        className={`px-3 py-1 text-sm rounded ${
                          config.is_enabled
                            ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
                            : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                        }`}
                      >
                        {config.is_enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={() => openEditConfig(config)}
                        className="px-3 py-1 text-sm bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteConfig(config.id)}
                        className="px-3 py-1 text-sm bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Schedule Tab */}
      {activeTab === 'schedule' && (
        <div className="space-y-4">
          <div className="flex justify-between items-start">
            <p className="text-gray-400 max-w-2xl">
              Configure after-hours schedules to receive alerts when activity is detected during closed hours.
            </p>
            <button
              onClick={() => {
                resetScheduleForm()
                setShowScheduleModal(true)
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Add Schedule
            </button>
          </div>

          {schedulesLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : schedules.length === 0 ? (
            <div className="text-center py-12 bg-gray-800 rounded-lg">
              <p className="text-gray-500">No after-hours schedules configured</p>
            </div>
          ) : (
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-700/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Day</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Start</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">End</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {schedules.map((schedule) => (
                    <tr key={schedule.id}>
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-white">
                        {schedule.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {DAYS_OF_WEEK[schedule.day_of_week]}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                        {formatHour(schedule.start_hour, schedule.start_minute)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                        {formatHour(schedule.end_hour, schedule.end_minute)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          schedule.is_enabled
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-gray-700 text-gray-400'
                        }`}>
                          {schedule.is_enabled ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleToggleSchedule(schedule.id)}
                            className="text-sm text-blue-400 hover:text-blue-300"
                          >
                            {schedule.is_enabled ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            onClick={() => handleDeleteSchedule(schedule.id)}
                            className="text-sm text-red-400 hover:text-red-300"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Config Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-4">
                {editingConfig ? 'Edit Alert Rule' : 'New Alert Rule'}
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
                  <input
                    type="text"
                    value={configForm.name}
                    onChange={(e) => setConfigForm({ ...configForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder:text-gray-500"
                    placeholder="e.g., High Occupancy Alert"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Alert Type</label>
                  <select
                    value={configForm.alert_type}
                    onChange={(e) => setConfigForm({ ...configForm, alert_type: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    disabled={!!editingConfig}
                  >
                    {ALERT_TYPES.map((type) => (
                      <option key={type.id} value={type.id}>{type.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {ALERT_TYPES.find(t => t.id === configForm.alert_type)?.description}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Severity</label>
                  <select
                    value={configForm.severity}
                    onChange={(e) => setConfigForm({ ...configForm, severity: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                {(configForm.alert_type === 'occupancy' || configForm.alert_type === 'wait_time') && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Operator</label>
                      <select
                        value={configForm.threshold_operator}
                        onChange={(e) => setConfigForm({ ...configForm, threshold_operator: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                      >
                        <option value="gt">Greater than</option>
                        <option value="gte">Greater than or equal</option>
                        <option value="lt">Less than</option>
                        <option value="lte">Less than or equal</option>
                        <option value="eq">Equal to</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Threshold {configForm.alert_type === 'wait_time' ? '(minutes)' : '(count)'}
                      </label>
                      <input
                        type="number"
                        value={configForm.threshold_value || ''}
                        onChange={(e) => setConfigForm({ ...configForm, threshold_value: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Cooldown (minutes)</label>
                  <input
                    type="number"
                    value={configForm.cooldown_minutes}
                    onChange={(e) => setConfigForm({ ...configForm, cooldown_minutes: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    min="1"
                    max="1440"
                  />
                  <p className="text-xs text-gray-500 mt-1">Minimum time between repeated alerts</p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_enabled"
                    checked={configForm.is_enabled}
                    onChange={(e) => setConfigForm({ ...configForm, is_enabled: e.target.checked })}
                    className="rounded border-gray-600 bg-gray-700 text-blue-500"
                  />
                  <label htmlFor="is_enabled" className="text-sm text-gray-300">Enable this alert rule</label>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowConfigModal(false)
                    setEditingConfig(null)
                  }}
                  className="px-4 py-2 text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveConfig}
                  disabled={!configForm.name}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {editingConfig ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg shadow-xl max-w-lg w-full">
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-4">New After-Hours Schedule</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
                  <input
                    type="text"
                    value={scheduleForm.name}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder:text-gray-500"
                    placeholder="e.g., Weeknight Closed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Day of Week</label>
                  <select
                    value={scheduleForm.day_of_week}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, day_of_week: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    {DAYS_OF_WEEK.map((day, idx) => (
                      <option key={idx} value={idx}>{day}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Start Hour</label>
                    <select
                      value={scheduleForm.start_hour}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, start_hour: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{formatHour(i)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">End Hour</label>
                    <select
                      value={scheduleForm.end_hour}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, end_hour: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{formatHour(i)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="schedule_enabled"
                    checked={scheduleForm.is_enabled}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, is_enabled: e.target.checked })}
                    className="rounded border-gray-600 bg-gray-700 text-blue-500"
                  />
                  <label htmlFor="schedule_enabled" className="text-sm text-gray-300">Enable this schedule</label>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setShowScheduleModal(false)}
                  className="px-4 py-2 text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSchedule}
                  disabled={!scheduleForm.name}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
