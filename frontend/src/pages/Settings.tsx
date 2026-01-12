import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  getBusinessHours,
  updateBusinessHours,
  getThresholdSettings,
  updateThresholdSettings,
  getEmailSettings,
  updateEmailSettings,
  testEmailSettings,
  getRetentionSettings,
  updateRetentionSettings,
  BusinessHours,
  ThresholdSettings,
  EmailSettings,
  RetentionSettings
} from '../api/client'

type Tab = 'hours' | 'thresholds' | 'email' | 'retention'

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function Settings() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('hours')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Business hours
  const [businessHours, setBusinessHours] = useState<BusinessHours[]>([])

  // Thresholds
  const [thresholds, setThresholds] = useState<ThresholdSettings>({
    max_occupancy: 100,
    wait_time_warning: 15,
    staff_idle_threshold: 30
  })

  // Email
  const [email, setEmail] = useState<EmailSettings>({
    smtp_host: '',
    smtp_port: 587,
    smtp_user: '',
    smtp_password: '',
    from_email: '',
    from_name: 'Restaurant Analytics',
    enabled: false
  })

  // Retention
  const [retention, setRetention] = useState<RetentionSettings>({
    recordings_days: 30,
    metrics_days: 90,
    audit_logs_days: 365,
    events_days: 30
  })

  const canEdit = user?.role === 'admin' || user?.role === 'manager'

  useEffect(() => {
    loadData()
  }, [activeTab])

  const loadData = async () => {
    setLoading(true)
    setError(null)

    try {
      switch (activeTab) {
        case 'hours':
          const hoursRes = await getBusinessHours()
          setBusinessHours(hoursRes.data)
          break
        case 'thresholds':
          const thresholdsRes = await getThresholdSettings()
          setThresholds(thresholdsRes.data)
          break
        case 'email':
          if (canEdit) {
            const emailRes = await getEmailSettings()
            setEmail(emailRes.data)
          }
          break
        case 'retention':
          const retentionRes = await getRetentionSettings()
          setRetention(retentionRes.data)
          break
      }
    } catch (err) {
      setError('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateBusinessHours = async (day: number, field: string, value: any) => {
    if (!canEdit) return

    const updated = businessHours.map(h => {
      if (h.day_of_week === day) {
        return { ...h, [field]: value }
      }
      return h
    })
    setBusinessHours(updated)

    try {
      await updateBusinessHours(day, { [field]: value })
      setSuccess('Business hours updated')
      setTimeout(() => setSuccess(null), 2000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update')
      loadData()
    }
  }

  const handleSaveThresholds = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await updateThresholdSettings(thresholds)
      setSuccess('Threshold settings saved')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save thresholds')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveEmail = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await updateEmailSettings(email)
      setSuccess('Email settings saved')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save email settings')
    } finally {
      setSaving(false)
    }
  }

  const handleTestEmail = async () => {
    try {
      await testEmailSettings()
      setSuccess('Test email sent')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to send test email')
    }
  }

  const handleSaveRetention = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await updateRetentionSettings(retention)
      setSuccess('Retention settings saved')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save retention settings')
    } finally {
      setSaving(false)
    }
  }

  const formatTime = (hour: number, minute: number) => {
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Settings</h1>

      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-900/50 border border-green-700 text-green-300 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      {!canEdit && (
        <div className="bg-yellow-900/50 border border-yellow-700 text-yellow-300 px-4 py-3 rounded-lg">
          You have read-only access. Contact an admin or manager to make changes.
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-700">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('hours')}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'hours'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            Business Hours
          </button>
          <button
            onClick={() => setActiveTab('thresholds')}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'thresholds'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            Alert Thresholds
          </button>
          <button
            onClick={() => setActiveTab('email')}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'email'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            Email Notifications
          </button>
          <button
            onClick={() => setActiveTab('retention')}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'retention'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            Data Retention
          </button>
        </nav>
      </div>

      {/* Business Hours Tab */}
      {activeTab === 'hours' && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Business Hours Configuration</h2>
          <p className="text-sm text-gray-400 mb-6">
            Set your restaurant's operating hours for each day of the week.
          </p>

          <div className="space-y-4">
            {businessHours.map((hours) => (
              <div key={hours.day_of_week} className="flex items-center space-x-4 p-3 bg-gray-700/50 border border-gray-600 rounded-lg">
                <div className="w-28 font-medium text-white">{DAY_NAMES[hours.day_of_week]}</div>

                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={hours.is_open}
                    onChange={(e) => handleUpdateBusinessHours(hours.day_of_week, 'is_open', e.target.checked)}
                    disabled={!canEdit}
                    className="h-4 w-4 text-blue-500 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-300">Open</span>
                </label>

                {hours.is_open && (
                  <>
                    <div className="flex items-center space-x-2">
                      <label className="text-sm text-gray-400">From:</label>
                      <input
                        type="time"
                        value={formatTime(hours.open_hour, hours.open_minute)}
                        onChange={(e) => {
                          const [h, m] = e.target.value.split(':').map(Number)
                          handleUpdateBusinessHours(hours.day_of_week, 'open_hour', h)
                          handleUpdateBusinessHours(hours.day_of_week, 'open_minute', m)
                        }}
                        disabled={!canEdit}
                        className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex items-center space-x-2">
                      <label className="text-sm text-gray-400">To:</label>
                      <input
                        type="time"
                        value={formatTime(hours.close_hour, hours.close_minute)}
                        onChange={(e) => {
                          const [h, m] = e.target.value.split(':').map(Number)
                          handleUpdateBusinessHours(hours.day_of_week, 'close_hour', h)
                          handleUpdateBusinessHours(hours.day_of_week, 'close_minute', m)
                        }}
                        disabled={!canEdit}
                        className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </>
                )}

                {!hours.is_open && (
                  <span className="text-sm text-gray-500">Closed</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Thresholds Tab */}
      {activeTab === 'thresholds' && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Alert Thresholds</h2>
          <p className="text-sm text-gray-400 mb-6">
            Configure thresholds that trigger alerts in the system.
          </p>

          <div className="space-y-6 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Maximum Occupancy Limit
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Alert when occupancy exceeds this number
              </p>
              <input
                type="number"
                value={thresholds.max_occupancy}
                onChange={(e) => setThresholds({ ...thresholds, max_occupancy: parseInt(e.target.value) })}
                disabled={!canEdit}
                min={1}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Wait Time Warning (minutes)
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Alert when customer wait time exceeds this
              </p>
              <input
                type="number"
                value={thresholds.wait_time_warning}
                onChange={(e) => setThresholds({ ...thresholds, wait_time_warning: parseInt(e.target.value) })}
                disabled={!canEdit}
                min={1}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Staff Idle Time Threshold (minutes)
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Alert when staff is idle for this long
              </p>
              <input
                type="number"
                value={thresholds.staff_idle_threshold}
                onChange={(e) => setThresholds({ ...thresholds, staff_idle_threshold: parseInt(e.target.value) })}
                disabled={!canEdit}
                min={1}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>

            {canEdit && (
              <button
                onClick={handleSaveThresholds}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save Thresholds'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Email Tab */}
      {activeTab === 'email' && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Email Notification Settings</h2>
          <p className="text-sm text-gray-400 mb-6">
            Configure SMTP settings for sending email notifications and reports.
          </p>

          {!canEdit ? (
            <p className="text-gray-400">Email settings require manager or admin access.</p>
          ) : (
            <div className="space-y-6 max-w-md">
              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={email.enabled}
                  onChange={(e) => setEmail({ ...email, enabled: e.target.checked })}
                  className="h-4 w-4 text-blue-500 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                />
                <span className="font-medium text-white">Enable Email Notifications</span>
              </label>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">SMTP Host</label>
                <input
                  type="text"
                  value={email.smtp_host}
                  onChange={(e) => setEmail({ ...email, smtp_host: e.target.value })}
                  placeholder="smtp.example.com"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">SMTP Port</label>
                <input
                  type="number"
                  value={email.smtp_port}
                  onChange={(e) => setEmail({ ...email, smtp_port: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">SMTP Username</label>
                <input
                  type="text"
                  value={email.smtp_user}
                  onChange={(e) => setEmail({ ...email, smtp_user: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">SMTP Password</label>
                <input
                  type="password"
                  value={email.smtp_password}
                  onChange={(e) => setEmail({ ...email, smtp_password: e.target.value })}
                  placeholder="********"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">From Email</label>
                <input
                  type="email"
                  value={email.from_email}
                  onChange={(e) => setEmail({ ...email, from_email: e.target.value })}
                  placeholder="noreply@example.com"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">From Name</label>
                <input
                  type="text"
                  value={email.from_name}
                  onChange={(e) => setEmail({ ...email, from_name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={handleSaveEmail}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving...' : 'Save Email Settings'}
                </button>
                <button
                  onClick={handleTestEmail}
                  disabled={!email.enabled || !email.smtp_host}
                  className="px-4 py-2 bg-gray-700 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-600 disabled:opacity-50 transition-colors"
                >
                  Send Test Email
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Retention Tab */}
      {activeTab === 'retention' && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Data Retention Settings</h2>
          <p className="text-sm text-gray-400 mb-6">
            Configure how long different types of data are kept in the system.
          </p>

          <div className="space-y-6 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Video Recordings (days)
              </label>
              <p className="text-xs text-gray-500 mb-2">
                How long to keep Frigate video recordings
              </p>
              <input
                type="number"
                value={retention.recordings_days}
                onChange={(e) => setRetention({ ...retention, recordings_days: parseInt(e.target.value) })}
                disabled={!canEdit}
                min={1}
                max={365}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Metrics Data (days)
              </label>
              <p className="text-xs text-gray-500 mb-2">
                How long to keep analytics metrics in InfluxDB
              </p>
              <input
                type="number"
                value={retention.metrics_days}
                onChange={(e) => setRetention({ ...retention, metrics_days: parseInt(e.target.value) })}
                disabled={!canEdit}
                min={1}
                max={730}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Audit Logs (days)
              </label>
              <p className="text-xs text-gray-500 mb-2">
                How long to keep audit log entries
              </p>
              <input
                type="number"
                value={retention.audit_logs_days}
                onChange={(e) => setRetention({ ...retention, audit_logs_days: parseInt(e.target.value) })}
                disabled={!canEdit}
                min={30}
                max={3650}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Detection Events (days)
              </label>
              <p className="text-xs text-gray-500 mb-2">
                How long to keep detection event records
              </p>
              <input
                type="number"
                value={retention.events_days}
                onChange={(e) => setRetention({ ...retention, events_days: parseInt(e.target.value) })}
                disabled={!canEdit}
                min={1}
                max={365}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>

            {canEdit && (
              <button
                onClick={handleSaveRetention}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save Retention Settings'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
