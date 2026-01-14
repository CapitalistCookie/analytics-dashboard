import { useState, useEffect } from 'react'
import {
  getStaffDashboard,
  type StaffDashboard,
  type StaffEfficiency,
  type StaffPosition,
  type CoverageGap
} from '../api/client'

interface StaffAnalyticsProps {
  refreshInterval?: number
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-400'
  if (score >= 60) return 'text-yellow-400'
  if (score >= 40) return 'text-orange-400'
  return 'text-red-400'
}

function getScoreBgColor(score: number): string {
  if (score >= 80) return 'bg-green-500/20'
  if (score >= 60) return 'bg-yellow-500/20'
  if (score >= 40) return 'bg-orange-500/20'
  return 'bg-red-500/20'
}

export default function StaffAnalytics({ refreshInterval = 30000 }: StaffAnalyticsProps) {
  const [dashboard, setDashboard] = useState<StaffDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await getStaffDashboard()
        setDashboard(res.data)
        setError(null)
      } catch (err) {
        console.error('Failed to fetch staff analytics:', err)
        setError('Unable to load staff analytics')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, refreshInterval)
    return () => clearInterval(interval)
  }, [refreshInterval])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-gray-800 rounded-lg p-6 animate-pulse">
          <div className="h-6 bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !dashboard) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-300 mb-3">Staff Analytics</h3>
        <p className="text-gray-500">{error || 'No staff analytics data available'}</p>
      </div>
    )
  }

  const { summary, coverage, efficiency, positions, service_times } = dashboard

  // Calculate average efficiency
  const avgEfficiency = efficiency.length > 0
    ? Math.round(efficiency.reduce((a, b) => a + b.efficiency_score, 0) / efficiency.length)
    : 0

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-3xl font-bold text-blue-400">
            {summary.total_staff_detected}
          </div>
          <div className="text-gray-400 text-sm">Staff Detected (24h)</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-3xl font-bold text-green-400">
            {positions.length}
          </div>
          <div className="text-gray-400 text-sm">Currently Active</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className={`text-3xl font-bold ${getScoreColor(coverage.overall_score)}`}>
            {coverage.overall_score}%
          </div>
          <div className="text-gray-400 text-sm">Coverage Score</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className={`text-3xl font-bold ${getScoreColor(avgEfficiency)}`}>
            {avgEfficiency || 'N/A'}
          </div>
          <div className="text-gray-400 text-sm">Avg Efficiency</div>
        </div>
      </div>

      {/* Real-time Staff Positions */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">
            Current Staff Positions
          </h3>
          <span className="flex items-center gap-1 text-xs text-green-400">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            Live
          </span>
        </div>

        {positions.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {positions.map((staff: StaffPosition) => (
              <div key={staff.person_id} className="bg-gray-700 rounded-lg p-4">
                <div className="text-white font-bold truncate">
                  {staff.staff_name || staff.display_id}
                </div>
                <div className="text-blue-400 capitalize">
                  {staff.current_zone?.replace(/_/g, ' ') || 'Unknown'}
                </div>
                <div className="text-gray-400 text-sm capitalize">
                  {staff.current_action || 'No action detected'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-gray-500 text-center py-8">
            No active staff detected in the last 5 minutes
          </div>
        )}
      </div>

      {/* Zone Coverage */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Zone Coverage (Last 8 Hours)
        </h3>

        <div className="flex items-center gap-6 mb-6">
          <div className={`p-4 rounded-lg ${getScoreBgColor(coverage.overall_score)}`}>
            <div className={`text-4xl font-bold ${getScoreColor(coverage.overall_score)}`}>
              {coverage.overall_score}%
            </div>
            <div className="text-gray-400 text-sm">Overall Score</div>
          </div>
          <div className="flex-1">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {Object.entries(coverage.zone_scores || {}).map(([zone, score]) => (
                <div key={zone} className="bg-gray-700 rounded-lg p-3">
                  <div className="text-white text-sm capitalize truncate">
                    {zone.replace(/_/g, ' ')}
                  </div>
                  <div className={`text-xl font-bold ${getScoreColor(score)}`}>
                    {score}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {coverage.coverage_gaps && coverage.coverage_gaps.length > 0 && (
          <div className="border-t border-gray-700 pt-4">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-yellow-400 font-medium">Coverage Gaps</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {coverage.coverage_gaps.slice(0, 12).map((gap: CoverageGap, i: number) => (
                <span
                  key={i}
                  className={`px-3 py-1 rounded-full text-sm text-white ${
                    gap.severity === 'high' ? 'bg-red-600' : 'bg-yellow-600'
                  }`}
                >
                  {gap.zone.replace(/_/g, ' ')} @ {gap.hour}:00
                </span>
              ))}
              {coverage.coverage_gaps.length > 12 && (
                <span className="px-3 py-1 rounded-full text-sm text-gray-400 bg-gray-700">
                  +{coverage.coverage_gaps.length - 12} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Staff Efficiency Rankings */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Staff Efficiency Rankings
        </h3>

        {efficiency.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700 text-sm">
                  <th className="pb-3 pr-4">Rank</th>
                  <th className="pb-3 pr-4">Staff Member</th>
                  <th className="pb-3 pr-4">Efficiency</th>
                  <th className="pb-3 pr-4">Activity Rate</th>
                  <th className="pb-3 pr-4">Active Time</th>
                  <th className="pb-3 pr-4">Mobility</th>
                </tr>
              </thead>
              <tbody>
                {efficiency.map((staff: StaffEfficiency, i: number) => (
                  <tr key={staff.person_id} className="border-b border-gray-700/50">
                    <td className="py-3 pr-4">
                      <span className="flex items-center gap-2">
                        {i === 0 && <span className="text-yellow-400">1st</span>}
                        {i === 1 && <span className="text-gray-400">2nd</span>}
                        {i === 2 && <span className="text-orange-400">3rd</span>}
                        {i > 2 && <span className="text-gray-500">{i + 1}th</span>}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="text-white font-medium">
                        {staff.staff_name || staff.display_id}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`font-bold ${getScoreColor(staff.efficiency_score)}`}>
                        {staff.efficiency_score}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-gray-300">
                      {staff.activity_rate}%
                    </td>
                    <td className="py-3 pr-4 text-gray-300">
                      {staff.active_time_minutes} min
                    </td>
                    <td className="py-3 pr-4 text-gray-300">
                      {staff.zone_transitions} moves
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-gray-500 text-center py-8">
            No staff efficiency data available
          </div>
        )}
      </div>

      {/* Service Times */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Average Customer Dwell Times by Zone
        </h3>
        <p className="text-gray-500 text-sm mb-4">
          Estimated from customer time spent in service zones (includes wait + service time)
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(service_times.service_zones || {}).map(([zone, data]) => (
            <div key={zone} className="bg-gray-700 rounded-lg p-4">
              <div className="text-gray-400 text-sm capitalize mb-1">
                {zone.replace(/_/g, ' ')}
              </div>
              <div className="text-2xl font-bold text-white">
                {data.avg_dwell_minutes !== null
                  ? `${data.avg_dwell_minutes} min`
                  : 'N/A'}
              </div>
              <div className="text-gray-500 text-xs">
                {data.sample_size} samples
              </div>
              {data.staff_present_count > 0 && (
                <div className="text-green-400 text-xs mt-1">
                  {data.staff_present_count} staff present
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Staff Activity Breakdown */}
      {summary.staff && summary.staff.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            24-Hour Staff Activity Details
          </h3>

          <div className="space-y-4">
            {summary.staff.slice(0, 5).map((staff) => (
              <div key={staff.person_id} className="bg-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-white font-medium">
                    {staff.staff_name || staff.display_id}
                  </div>
                  <div className="text-gray-400 text-sm">
                    {staff.total_time_minutes} min tracked
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-2">
                  {staff.zones_visited.map((zone) => (
                    <span
                      key={zone}
                      className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-400 capitalize"
                    >
                      {zone.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>

                {Object.keys(staff.action_breakdown).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(staff.action_breakdown).map(([action, minutes]) => (
                      <span
                        key={action}
                        className="px-2 py-1 rounded text-xs bg-gray-600 text-gray-300 capitalize"
                      >
                        {action}: {minutes}m
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
