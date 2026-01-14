import { useState, useEffect } from 'react'
import { getActionSummary, type ActionSummary } from '../api/client'

const ACTION_COLORS: Record<string, string> = {
  standing: 'bg-blue-500',
  sitting: 'bg-green-500',
  walking: 'bg-yellow-500',
  bending: 'bg-orange-500',
  reaching: 'bg-purple-500',
  unknown: 'bg-gray-500',
}

const ACTION_TEXT_COLORS: Record<string, string> = {
  standing: 'text-blue-400',
  sitting: 'text-green-400',
  walking: 'text-yellow-400',
  bending: 'text-orange-400',
  reaching: 'text-purple-400',
  unknown: 'text-gray-400',
}

const ACTION_BG_COLORS: Record<string, string> = {
  standing: 'bg-blue-500/20',
  sitting: 'bg-green-500/20',
  walking: 'bg-yellow-500/20',
  bending: 'bg-orange-500/20',
  reaching: 'bg-purple-500/20',
  unknown: 'bg-gray-500/20',
}

interface ActionAnalyticsProps {
  refreshInterval?: number
}

export default function ActionAnalytics({ refreshInterval = 30000 }: ActionAnalyticsProps) {
  const [data, setData] = useState<ActionSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hours, setHours] = useState(24)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await getActionSummary(hours)
        setData(res.data)
        setError(null)
      } catch (err) {
        console.error('Failed to fetch action data:', err)
        setError('Unable to load action data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, refreshInterval)
    return () => clearInterval(interval)
  }, [hours, refreshInterval])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-gray-800 rounded-lg p-6 animate-pulse">
          <div className="h-6 bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-24 bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-300 mb-3">Action Analytics</h3>
        <p className="text-gray-500">{error || 'No action data available'}</p>
      </div>
    )
  }

  const actions = data.stats?.actions || {}
  const zoneActions = data.zone_breakdown || {}
  const currentActions = data.current_actions || {}
  const insights = data.insights || {}

  return (
    <div className="space-y-6">
      {/* Time Range Selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Action Analytics</h2>
        <select
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="bg-gray-700 text-white rounded px-3 py-1 text-sm border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value={1}>Last Hour</option>
          <option value={4}>Last 4 Hours</option>
          <option value={8}>Last 8 Hours</option>
          <option value={24}>Last 24 Hours</option>
          <option value={48}>Last 48 Hours</option>
          <option value={168}>Last Week</option>
        </select>
      </div>

      {/* Action Summary Cards */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">
            Action Summary ({hours}h)
          </h3>
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            insights.activity_level === 'high' ? 'bg-green-500/20 text-green-400' :
            insights.activity_level === 'moderate' ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-gray-500/20 text-gray-400'
          }`}>
            {insights.activity_level?.toUpperCase() || 'N/A'} Activity
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Object.entries(actions).map(([action, data]) => (
            <div
              key={action}
              className={`${ACTION_BG_COLORS[action] || ACTION_BG_COLORS.unknown} rounded-lg p-4`}
            >
              <div className={`text-2xl font-bold ${ACTION_TEXT_COLORS[action] || ACTION_TEXT_COLORS.unknown}`}>
                {data.percentage?.toFixed(0) || 0}%
              </div>
              <div className="text-white font-medium capitalize">{action}</div>
              <div className="text-gray-400 text-sm">
                {data.total_minutes?.toFixed(0) || 0} min total
              </div>
              <div className="text-gray-500 text-xs">
                {data.count || 0} occurrences
              </div>
              {data.avg_duration_seconds > 0 && (
                <div className="text-gray-500 text-xs">
                  avg {data.avg_duration_seconds?.toFixed(0)}s each
                </div>
              )}
            </div>
          ))}
          {Object.keys(actions).length === 0 && (
            <div className="col-span-5 text-center text-gray-500 py-8">
              No action data recorded in this time period
            </div>
          )}
        </div>
      </div>

      {/* Actions by Zone */}
      {Object.keys(zoneActions).length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Actions by Zone
          </h3>
          <div className="space-y-4">
            {Object.entries(zoneActions).map(([zone, actionData]) => (
              <div key={zone} className="border-b border-gray-700 pb-4 last:border-b-0">
                <div className="text-white font-medium mb-2 capitalize">{zone}</div>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(actionData).map(([action, data]) => (
                    <span
                      key={action}
                      className={`${ACTION_BG_COLORS[action] || ACTION_BG_COLORS.unknown} ${ACTION_TEXT_COLORS[action] || ACTION_TEXT_COLORS.unknown} px-3 py-1 rounded-full text-sm`}
                    >
                      {action}: {data.count} ({data.total_minutes?.toFixed(0)}m)
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Current Actions (Real-time) */}
      {Object.keys(currentActions).length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Current Actions
            <span className="ml-2 text-xs text-green-400 font-normal">Live</span>
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(currentActions).map(([personId, info]) => (
              <div
                key={personId}
                className="bg-gray-700 rounded-lg p-3 flex items-center justify-between"
              >
                <div>
                  <div className="text-white font-medium">Person #{personId}</div>
                  <div className={`text-sm capitalize ${ACTION_TEXT_COLORS[info.action] || ACTION_TEXT_COLORS.unknown}`}>
                    {info.action}
                  </div>
                </div>
                <div className={`w-3 h-3 rounded-full ${ACTION_COLORS[info.action] || ACTION_COLORS.unknown}`}></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Insights */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Insights</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-700 rounded-lg p-4">
            <div className="text-gray-400 text-sm mb-1">Total Actions</div>
            <div className="text-2xl font-bold text-white">{insights.total_actions || 0}</div>
          </div>
          <div className="bg-gray-700 rounded-lg p-4">
            <div className="text-gray-400 text-sm mb-1">Activity Ratio</div>
            <div className="text-2xl font-bold text-white">
              {((insights.activity_ratio || 0) * 100).toFixed(0)}%
            </div>
            <div className="text-xs text-gray-500">Active vs Passive</div>
          </div>
          <div className="bg-gray-700 rounded-lg p-4">
            <div className="text-gray-400 text-sm mb-1">Time Distribution</div>
            <div className="flex gap-2 mt-1">
              <span className="text-green-400 text-sm">
                Sit: {insights.sitting_percentage?.toFixed(0) || 0}%
              </span>
              <span className="text-blue-400 text-sm">
                Stand: {insights.standing_percentage?.toFixed(0) || 0}%
              </span>
              <span className="text-yellow-400 text-sm">
                Walk: {insights.walking_percentage?.toFixed(0) || 0}%
              </span>
            </div>
          </div>
        </div>

        {/* Key Observations */}
        <div className="mt-4 pt-4 border-t border-gray-700">
          <h4 className="text-sm font-medium text-gray-400 mb-2">Key Observations</h4>
          <ul className="space-y-1 text-gray-300 text-sm">
            {insights.sitting_percentage > 50 && (
              <li>Most customers prefer to be seated ({insights.sitting_percentage?.toFixed(0)}% of time)</li>
            )}
            {insights.walking_percentage > 20 && (
              <li>High foot traffic detected ({insights.walking_percentage?.toFixed(0)}% of activity)</li>
            )}
            {insights.activity_level === 'high' && (
              <li>Above average customer activity levels</li>
            )}
            {insights.activity_level === 'low' && (
              <li>Below average customer activity - customers are mostly stationary</li>
            )}
            {Object.keys(actions).length === 0 && (
              <li className="text-gray-500">No action data available for analysis</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}
