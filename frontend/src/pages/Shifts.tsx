import { useState, useEffect } from 'react'
import {
  getCurrentShift,
  getShiftHistory,
  getShiftSummary,
  generateShiftSummary,
  emailShiftSummary,
  ShiftSummary,
  ShiftSummaryList,
  StaffShiftStats,
} from '../api/client'

type ShiftType = 'morning' | 'afternoon' | 'evening'

export default function Shifts() {
  const [currentShift, setCurrentShift] = useState<ShiftSummary | null>(null)
  const [shiftHistory, setShiftHistory] = useState<ShiftSummaryList[]>([])
  const [selectedShift, setSelectedShift] = useState<ShiftSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current')
  const [filterType, setFilterType] = useState<ShiftType | ''>('')
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailRecipients, setEmailRecipients] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    loadCurrentShift()
  }, [])

  useEffect(() => {
    if (activeTab === 'history') {
      loadShiftHistory()
    }
  }, [activeTab, filterType])

  const loadCurrentShift = async () => {
    try {
      setLoading(true)
      const response = await getCurrentShift()
      setCurrentShift(response.data)
    } catch (error) {
      console.error('Failed to load current shift:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadShiftHistory = async () => {
    try {
      setHistoryLoading(true)
      const params: { days?: number; shift_type?: string } = { days: 30 }
      if (filterType) {
        params.shift_type = filterType
      }
      const response = await getShiftHistory(params)
      setShiftHistory(response.data)
    } catch (error) {
      console.error('Failed to load shift history:', error)
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleViewShift = async (id: number) => {
    try {
      const response = await getShiftSummary(id)
      setSelectedShift(response.data)
    } catch (error) {
      console.error('Failed to load shift:', error)
    }
  }

  const handleGenerateReport = async () => {
    if (!currentShift) return
    try {
      setGenerating(true)
      const response = await generateShiftSummary({
        shift_date: currentShift.shift_date,
        shift_type: currentShift.shift_type,
      })
      setCurrentShift(response.data)
      alert('Shift summary saved successfully!')
    } catch (error) {
      console.error('Failed to generate report:', error)
      alert('Failed to save shift summary')
    } finally {
      setGenerating(false)
    }
  }

  const handleEmailSummary = async () => {
    const shiftToEmail = selectedShift || currentShift
    if (!shiftToEmail) return

    const recipients = emailRecipients.split(',').map(e => e.trim()).filter(e => e)
    if (recipients.length === 0) {
      alert('Please enter at least one email address')
      return
    }

    try {
      setEmailSending(true)
      await emailShiftSummary(shiftToEmail.id || 0, recipients)
      setShowEmailModal(false)
      setEmailRecipients('')
      alert('Shift summary sent successfully!')
    } catch (error) {
      console.error('Failed to send email:', error)
      alert('Failed to send email')
    } finally {
      setEmailSending(false)
    }
  }

  const formatShiftType = (type: string) => {
    return type.charAt(0).toUpperCase() + type.slice(1)
  }

  const getShiftTypeColor = (type: string) => {
    switch (type) {
      case 'morning': return 'bg-yellow-500/20 text-yellow-400'
      case 'afternoon': return 'bg-orange-500/20 text-orange-400'
      case 'evening': return 'bg-purple-500/20 text-purple-400'
      default: return 'bg-gray-500/20 text-gray-400'
    }
  }

  const renderMetricCard = (label: string, value: string | number, icon: string, change?: number) => (
    <div className="bg-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400 text-sm">{label}</span>
        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
        </svg>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {change !== undefined && (
        <div className={`text-sm mt-1 ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {change >= 0 ? '+' : ''}{change.toFixed(1)}% vs last week
        </div>
      )}
    </div>
  )

  const renderStaffTable = (staff: StaffShiftStats[]) => (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
            <th className="pb-3 font-medium">Staff</th>
            <th className="pb-3 font-medium">Role</th>
            <th className="pb-3 font-medium text-center">Tables</th>
            <th className="pb-3 font-medium text-center">Customers</th>
            <th className="pb-3 font-medium text-center">Floor Time</th>
            <th className="pb-3 font-medium text-center">Response</th>
          </tr>
        </thead>
        <tbody className="text-gray-300">
          {staff.map((s) => (
            <tr key={s.staff_id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
              <td className="py-3 font-medium text-white">{s.name}</td>
              <td className="py-3 capitalize">{s.role}</td>
              <td className="py-3 text-center">{s.tables_served}</td>
              <td className="py-3 text-center">{s.customers_served}</td>
              <td className="py-3 text-center">
                <div className="flex items-center justify-center gap-2">
                  <div className="w-16 h-2 bg-gray-600 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${(s.floor_time_minutes / (s.floor_time_minutes + s.idle_time_minutes)) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm">{Math.round((s.floor_time_minutes / (s.floor_time_minutes + s.idle_time_minutes)) * 100)}%</span>
                </div>
              </td>
              <td className="py-3 text-center">{s.response_time_avg}s</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const renderCurrentShift = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      )
    }

    if (!currentShift) {
      return (
        <div className="text-center text-gray-400 py-12">
          No active shift data available
        </div>
      )
    }

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getShiftTypeColor(currentShift.shift_type)}`}>
                {formatShiftType(currentShift.shift_type)} Shift
              </span>
              <span className="text-gray-400">{currentShift.start_time} - {currentShift.end_time}</span>
            </div>
            <h2 className="text-xl font-bold text-white mt-2">
              {new Date(currentShift.shift_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </h2>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowEmailModal(true)}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Email
            </button>
            <button
              onClick={handleGenerateReport}
              disabled={generating}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {generating ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )}
              Save Report
            </button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {renderMetricCard('Total Customers', currentShift.metrics.total_customers, 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', currentShift.comparison?.total_customers_change)}
          {renderMetricCard('Peak Hour', currentShift.metrics.peak_hour, 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z')}
          {renderMetricCard('Peak Occupancy', `${currentShift.metrics.peak_occupancy}%`, 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6')}
          {renderMetricCard('Avg Wait Time', `${currentShift.metrics.avg_wait_time} min`, 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', currentShift.comparison?.avg_wait_time_change)}
          {renderMetricCard('Table Turnovers', currentShift.metrics.table_turnovers, 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15', currentShift.comparison?.table_turnovers_change)}
          {renderMetricCard('Incidents', currentShift.metrics.incidents_count, 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z')}
        </div>

        {/* Comparison Card */}
        {currentShift.comparison && (
          <div className={`p-4 rounded-lg border ${currentShift.comparison.is_improvement ? 'bg-green-500/10 border-green-500/30' : 'bg-yellow-500/10 border-yellow-500/30'}`}>
            <div className="flex items-center gap-2 mb-2">
              <svg className={`w-5 h-5 ${currentShift.comparison.is_improvement ? 'text-green-400' : 'text-yellow-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={currentShift.comparison.is_improvement ? 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' : 'M13 17h8m0 0V9m0 8l-8-8-4 4-6-6'} />
              </svg>
              <span className={`font-medium ${currentShift.comparison.is_improvement ? 'text-green-400' : 'text-yellow-400'}`}>
                Comparison to {currentShift.comparison.previous_date}
              </span>
            </div>
            <p className="text-gray-300 text-sm">
              {currentShift.comparison.is_improvement
                ? 'This shift is performing better than the same shift last week!'
                : 'There may be room for improvement compared to last week.'}
            </p>
          </div>
        )}

        {/* Staff Performance */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Staff on Shift ({currentShift.staff_on_shift.length})</h3>
          {renderStaffTable(currentShift.staff_on_shift)}
        </div>

        {/* Revenue Estimate */}
        <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-lg p-6 border border-green-500/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-400 text-sm font-medium">Estimated Revenue</p>
              <p className="text-3xl font-bold text-white mt-1">${currentShift.metrics.revenue_estimate.toLocaleString()}</p>
            </div>
            <svg className="w-12 h-12 text-green-400/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>
    )
  }

  const renderHistory = () => (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex items-center gap-4">
        <label className="text-gray-400 text-sm">Filter by:</label>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as ShiftType | '')}
          className="bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:outline-none focus:border-blue-500"
        >
          <option value="">All Shifts</option>
          <option value="morning">Morning</option>
          <option value="afternoon">Afternoon</option>
          <option value="evening">Evening</option>
        </select>
      </div>

      {historyLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      ) : shiftHistory.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          No shift summaries found
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-400 text-sm bg-gray-700/50">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Shift</th>
                <th className="px-4 py-3 font-medium text-center">Customers</th>
                <th className="px-4 py-3 font-medium text-center">Staff</th>
                <th className="px-4 py-3 font-medium text-center">Avg Wait</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              {shiftHistory.map((shift) => (
                <tr key={`${shift.id}-${shift.shift_date}-${shift.shift_type}`} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                  <td className="px-4 py-3">
                    {new Date(shift.shift_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getShiftTypeColor(shift.shift_type)}`}>
                      {formatShiftType(shift.shift_type)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">{shift.total_customers}</td>
                  <td className="px-4 py-3 text-center">{shift.staff_count}</td>
                  <td className="px-4 py-3 text-center">{shift.avg_wait_time} min</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleViewShift(shift.id)}
                      className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Shift Summaries</h1>
          <p className="text-gray-400 mt-1">End-of-shift reports and performance tracking</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-700">
        <div className="flex gap-4">
          <button
            onClick={() => { setActiveTab('current'); setSelectedShift(null) }}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              activeTab === 'current'
                ? 'text-blue-400 border-blue-400'
                : 'text-gray-400 border-transparent hover:text-white'
            }`}
          >
            Current Shift
          </button>
          <button
            onClick={() => { setActiveTab('history'); setSelectedShift(null) }}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'text-blue-400 border-blue-400'
                : 'text-gray-400 border-transparent hover:text-white'
            }`}
          >
            Past Shifts
          </button>
        </div>
      </div>

      {/* Content */}
      {selectedShift ? (
        <div>
          <button
            onClick={() => setSelectedShift(null)}
            className="flex items-center gap-2 text-gray-400 hover:text-white mb-4"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to History
          </button>
          {renderCurrentShift()}
        </div>
      ) : activeTab === 'current' ? (
        renderCurrentShift()
      ) : (
        renderHistory()
      )}

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-white mb-4">Email Shift Summary</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Recipients (comma-separated)
                </label>
                <input
                  type="text"
                  value={emailRecipients}
                  onChange={(e) => setEmailRecipients(e.target.value)}
                  placeholder="manager@restaurant.com, owner@restaurant.com"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowEmailModal(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEmailSummary}
                  disabled={emailSending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {emailSending ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  )}
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
