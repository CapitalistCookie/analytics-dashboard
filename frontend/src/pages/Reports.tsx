import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  getReportTypes,
  exportReport,
  getScheduledReports,
  createScheduledReport,
  updateScheduledReport,
  deleteScheduledReport,
  runScheduledReport,
  toggleScheduledReport,
  ReportType,
  ScheduledReport,
  ScheduledReportCreate
} from '../api/client'

type Tab = 'export' | 'scheduled'

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function Reports() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('export')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Report types
  const [reportTypes, setReportTypes] = useState<Record<string, ReportType>>({})

  // Export form
  const [exportType, setExportType] = useState('')
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [exporting, setExporting] = useState(false)

  // Scheduled reports
  const [scheduledReports, setScheduledReports] = useState<ScheduledReport[]>([])
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [editingReport, setEditingReport] = useState<ScheduledReport | null>(null)

  // Schedule form
  const [scheduleForm, setScheduleForm] = useState<ScheduledReportCreate>({
    name: '',
    report_type: '',
    schedule: 'daily',
    day_of_week: 0,
    day_of_month: 1,
    hour: 8,
    email_recipients: '',
    is_enabled: true
  })

  const canManageScheduled = user?.role === 'admin' || user?.role === 'manager'

  useEffect(() => {
    loadReportTypes()
  }, [])

  useEffect(() => {
    if (activeTab === 'scheduled' && canManageScheduled) {
      loadScheduledReports()
    }
  }, [activeTab])

  const loadReportTypes = async () => {
    try {
      const { data } = await getReportTypes()
      setReportTypes(data.report_types)
      const types = Object.keys(data.report_types)
      if (types.length > 0 && !exportType) {
        setExportType(types[0])
      }
    } catch (err) {
      setError('Failed to load report types')
    } finally {
      setLoading(false)
    }
  }

  const loadScheduledReports = async () => {
    try {
      const { data } = await getScheduledReports()
      setScheduledReports(data)
    } catch (err) {
      console.error('Failed to load scheduled reports', err)
    }
  }

  const handleExport = async () => {
    if (!exportType) {
      setError('Please select a report type')
      return
    }

    setExporting(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await exportReport(
        exportType,
        exportFormat,
        startDate || undefined,
        endDate || undefined
      )

      if (exportFormat === 'csv') {
        // Download CSV file
        const blob = new Blob([response.data], { type: 'text/csv' })
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `${exportType}_${new Date().toISOString().split('T')[0]}.csv`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
        setSuccess('Report downloaded successfully')
      } else {
        // Show JSON data or download
        console.log('Report data:', response.data)
        setSuccess('Report generated - check console for data')
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to export report')
    } finally {
      setExporting(false)
    }
  }

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    try {
      await createScheduledReport(scheduleForm)
      setSuccess('Scheduled report created')
      setShowScheduleModal(false)
      resetScheduleForm()
      loadScheduledReports()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create scheduled report')
    }
  }

  const handleUpdateSchedule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingReport) return
    setError(null)
    setSuccess(null)

    try {
      await updateScheduledReport(editingReport.id, scheduleForm)
      setSuccess('Scheduled report updated')
      setShowScheduleModal(false)
      setEditingReport(null)
      resetScheduleForm()
      loadScheduledReports()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update scheduled report')
    }
  }

  const handleDeleteSchedule = async (id: number) => {
    if (!confirm('Are you sure you want to delete this scheduled report?')) return

    try {
      await deleteScheduledReport(id)
      setSuccess('Scheduled report deleted')
      loadScheduledReports()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete scheduled report')
    }
  }

  const handleRunNow = async (id: number) => {
    try {
      const { data } = await runScheduledReport(id)
      setSuccess(`Report generated: ${data.records} records`)
      loadScheduledReports()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to run report')
    }
  }

  const handleToggle = async (id: number) => {
    try {
      await toggleScheduledReport(id)
      loadScheduledReports()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to toggle report')
    }
  }

  const resetScheduleForm = () => {
    setScheduleForm({
      name: '',
      report_type: Object.keys(reportTypes)[0] || '',
      schedule: 'daily',
      day_of_week: 0,
      day_of_month: 1,
      hour: 8,
      email_recipients: '',
      is_enabled: true
    })
  }

  const openEditModal = (report: ScheduledReport) => {
    setEditingReport(report)
    setScheduleForm({
      name: report.name,
      report_type: report.report_type,
      schedule: report.schedule,
      day_of_week: report.day_of_week || 0,
      day_of_month: report.day_of_month || 1,
      hour: report.hour,
      email_recipients: report.email_recipients || '',
      is_enabled: report.is_enabled
    })
    setShowScheduleModal(true)
  }

  const getScheduleDescription = (report: ScheduledReport) => {
    const hour = report.hour.toString().padStart(2, '0') + ':00'
    switch (report.schedule) {
      case 'daily':
        return `Daily at ${hour}`
      case 'weekly':
        return `Every ${DAY_NAMES[report.day_of_week || 0]} at ${hour}`
      case 'monthly':
        return `Day ${report.day_of_month} of each month at ${hour}`
      default:
        return report.schedule
    }
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
      <h1 className="text-2xl font-bold text-white">Reports</h1>

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

      {/* Tabs */}
      <div className="border-b border-gray-700">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('export')}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'export'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            Export Reports
          </button>
          {canManageScheduled && (
            <button
              onClick={() => setActiveTab('scheduled')}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'scheduled'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-400 hover:text-gray-300'
              }`}
            >
              Scheduled Reports
            </button>
          )}
        </nav>
      </div>

      {/* Export Tab */}
      {activeTab === 'export' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Export Form */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Export Analytics</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Report Type
                </label>
                <select
                  value={exportType}
                  onChange={(e) => setExportType(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {Object.entries(reportTypes).map(([key, type]) => (
                    <option key={key} value={key}>{type.name}</option>
                  ))}
                </select>
                {exportType && reportTypes[exportType] && (
                  <p className="mt-1 text-xs text-gray-500">
                    {reportTypes[exportType].description}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Format
                </label>
                <div className="flex space-x-4">
                  <label className="flex items-center text-gray-300">
                    <input
                      type="radio"
                      value="csv"
                      checked={exportFormat === 'csv'}
                      onChange={() => setExportFormat('csv')}
                      className="mr-2 text-blue-500 bg-gray-700 border-gray-600 focus:ring-blue-500"
                    />
                    CSV
                  </label>
                  <label className="flex items-center text-gray-300">
                    <input
                      type="radio"
                      value="json"
                      checked={exportFormat === 'json'}
                      onChange={() => setExportFormat('json')}
                      className="mr-2 text-blue-500 bg-gray-700 border-gray-600 focus:ring-blue-500"
                    />
                    JSON
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <button
                onClick={handleExport}
                disabled={exporting || !exportType}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {exporting ? 'Exporting...' : 'Export Report'}
              </button>
            </div>
          </div>

          {/* Report Types Info */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Available Report Types</h2>

            <div className="space-y-3">
              {Object.entries(reportTypes).map(([key, type]) => (
                <div key={key} className="p-3 bg-gray-700/50 border border-gray-600 rounded-lg">
                  <h3 className="font-medium text-white">{type.name}</h3>
                  <p className="text-sm text-gray-400">{type.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Scheduled Reports Tab */}
      {activeTab === 'scheduled' && canManageScheduled && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-white">Scheduled Reports</h2>
            <button
              onClick={() => {
                resetScheduleForm()
                setEditingReport(null)
                setShowScheduleModal(true)
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Add Schedule
            </button>
          </div>

          {scheduledReports.length === 0 ? (
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 text-center text-gray-400">
              No scheduled reports configured. Click "Add Schedule" to create one.
            </div>
          ) : (
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-700/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Schedule</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Recipients</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Last Run</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {scheduledReports.map((report) => (
                    <tr key={report.id} className="hover:bg-gray-700/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-white">
                        {report.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                        {reportTypes[report.report_type]?.name || report.report_type}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                        {getScheduleDescription(report)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400 max-w-xs truncate">
                        {report.email_recipients || 'None'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          report.is_enabled
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-gray-600 text-gray-400'
                        }`}>
                          {report.is_enabled ? 'Active' : 'Paused'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                        {report.last_run ? new Date(report.last_run).toLocaleString() : 'Never'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm space-x-2">
                        <button
                          onClick={() => handleRunNow(report.id)}
                          className="text-green-400 hover:text-green-300 transition-colors"
                        >
                          Run Now
                        </button>
                        <button
                          onClick={() => openEditModal(report)}
                          className="text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggle(report.id)}
                          className="text-gray-400 hover:text-gray-300 transition-colors"
                        >
                          {report.is_enabled ? 'Pause' : 'Enable'}
                        </button>
                        <button
                          onClick={() => handleDeleteSchedule(report.id)}
                          className="text-red-400 hover:text-red-300 transition-colors"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 w-full max-w-lg mx-4">
            <h2 className="text-xl font-bold text-white mb-4">
              {editingReport ? 'Edit Scheduled Report' : 'Create Scheduled Report'}
            </h2>
            <form onSubmit={editingReport ? handleUpdateSchedule : handleCreateSchedule} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  value={scheduleForm.name}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, name: e.target.value })}
                  required
                  placeholder="Weekly Performance Report"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Report Type</label>
                <select
                  value={scheduleForm.report_type}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, report_type: e.target.value })}
                  required
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a report type</option>
                  {Object.entries(reportTypes).map(([key, type]) => (
                    <option key={key} value={key}>{type.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Schedule</label>
                <select
                  value={scheduleForm.schedule}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, schedule: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              {scheduleForm.schedule === 'weekly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Day of Week</label>
                  <select
                    value={scheduleForm.day_of_week}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, day_of_week: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                  >
                    {DAY_NAMES.map((day, index) => (
                      <option key={index} value={index}>{day}</option>
                    ))}
                  </select>
                </div>
              )}

              {scheduleForm.schedule === 'monthly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Day of Month</label>
                  <select
                    value={scheduleForm.day_of_month}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, day_of_month: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                  >
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Hour (24h)</label>
                <select
                  value={scheduleForm.hour}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, hour: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                >
                  {Array.from({ length: 24 }, (_, i) => i).map((hour) => (
                    <option key={hour} value={hour}>{hour.toString().padStart(2, '0')}:00</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Email Recipients</label>
                <input
                  type="text"
                  value={scheduleForm.email_recipients}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, email_recipients: e.target.value })}
                  placeholder="manager@example.com, owner@example.com"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Comma-separated email addresses</p>
              </div>

              <label className="flex items-center space-x-2 text-gray-300">
                <input
                  type="checkbox"
                  checked={scheduleForm.is_enabled}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, is_enabled: e.target.checked })}
                  className="h-4 w-4 text-blue-500 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm">Enable this scheduled report</span>
              </label>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowScheduleModal(false)
                    setEditingReport(null)
                    resetScheduleForm()
                  }}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {editingReport ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
