import { useState, useEffect, useCallback } from 'react'
import {
  getActivityFeed,
  getActivityStats,
  getUnreadSummary,
  type ActivityItem,
  type ActivityFeed,
  type ActivityStats,
  type UnreadSummary
} from '../api/client'

const TYPE_COLORS: Record<string, string> = {
  incident: 'border-l-red-500 bg-red-900/10',
  note: 'border-l-blue-500 bg-blue-900/10',
  alert: 'border-l-yellow-500 bg-yellow-900/10'
}

const TYPE_ICONS: Record<string, string> = {
  incident: '⚠️',
  note: '📝',
  alert: '🔔'
}

const TYPE_BADGES: Record<string, string> = {
  incident: 'bg-red-500/20 text-red-400',
  note: 'bg-blue-500/20 text-blue-400',
  alert: 'bg-yellow-500/20 text-yellow-400'
}

const SEVERITY_COLORS: Record<string, string> = {
  low: 'text-blue-400',
  medium: 'text-yellow-400',
  high: 'text-orange-400',
  critical: 'text-red-400',
  info: 'text-blue-400',
  warning: 'text-yellow-400'
}

export default function Activity() {
  const [feed, setFeed] = useState<ActivityFeed | null>(null)
  const [stats, setStats] = useState<ActivityStats | null>(null)
  const [unreadSummary, setUnreadSummary] = useState<UnreadSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [severityFilter, setSeverityFilter] = useState<string>('')
  const [hoursFilter, setHoursFilter] = useState<number>(24)
  const [includeAcknowledged, setIncludeAcknowledged] = useState(true)

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(true)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [feedRes, statsRes, unreadRes] = await Promise.all([
        getActivityFeed({
          types: typeFilter || undefined,
          severity: severityFilter || undefined,
          hours: hoursFilter,
          include_acknowledged: includeAcknowledged,
          limit: 100
        }),
        getActivityStats(hoursFilter),
        getUnreadSummary()
      ])
      setFeed(feedRes.data)
      setStats(statsRes.data)
      setUnreadSummary(unreadRes.data)
      setError(null)
    } catch (err) {
      setError('Failed to load activity feed')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [typeFilter, severityFilter, hoursFilter, includeAcknowledged])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [autoRefresh, loadData])

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return date.toLocaleDateString()
  }

  const formatFullDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString()
  }

  // Group items by date
  const groupedItems: Record<string, ActivityItem[]> = {}
  feed?.items.forEach(item => {
    const date = new Date(item.created_at).toLocaleDateString()
    if (!groupedItems[date]) {
      groupedItems[date] = []
    }
    groupedItems[date].push(item)
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Activity Feed</h1>
          <p className="text-gray-400">Combined timeline of incidents, notes, and alerts</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded bg-gray-700 border-gray-600"
            />
            Auto-refresh
          </label>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Unread Summary */}
      {unreadSummary && unreadSummary.total_unread > 0 && (
        <div className={`rounded-lg p-4 border ${
          unreadSummary.has_critical
            ? 'bg-red-900/30 border-red-700'
            : 'bg-blue-900/30 border-blue-700'
        }`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{unreadSummary.has_critical ? '🚨' : '📬'}</span>
            <div>
              <p className="text-white font-medium">
                {unreadSummary.total_unread} unread items
              </p>
              <div className="flex flex-wrap gap-3 text-sm text-gray-300">
                {unreadSummary.open_incidents > 0 && (
                  <span className="text-red-400">
                    {unreadSummary.open_incidents} open incidents
                    {unreadSummary.critical_incidents > 0 && ` (${unreadSummary.critical_incidents} critical)`}
                  </span>
                )}
                {unreadSummary.unread_notes > 0 && (
                  <span className="text-blue-400">{unreadSummary.unread_notes} unread notes</span>
                )}
                {unreadSummary.unacknowledged_alerts > 0 && (
                  <span className="text-yellow-400">
                    {unreadSummary.unacknowledged_alerts} alerts
                    {unreadSummary.critical_alerts > 0 && ` (${unreadSummary.critical_alerts} critical)`}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Total Activity</p>
            <p className="text-2xl font-bold text-white">{stats.total}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Incidents</p>
            <p className="text-2xl font-bold text-red-400">{stats.incidents}</p>
            {stats.unread_incidents > 0 && (
              <p className="text-xs text-red-300">{stats.unread_incidents} open</p>
            )}
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Notes</p>
            <p className="text-2xl font-bold text-blue-400">{stats.notes}</p>
            {stats.unread_notes > 0 && (
              <p className="text-xs text-blue-300">{stats.unread_notes} unread</p>
            )}
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Alerts</p>
            <p className="text-2xl font-bold text-yellow-400">{stats.alerts}</p>
            {stats.unacknowledged_alerts > 0 && (
              <p className="text-xs text-yellow-300">{stats.unacknowledged_alerts} unacknowledged</p>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 bg-gray-800 p-4 rounded-lg border border-gray-700">
        <div className="flex gap-2">
          <button
            onClick={() => setTypeFilter('')}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              typeFilter === ''
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setTypeFilter('incident')}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              typeFilter === 'incident'
                ? 'bg-red-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            ⚠️ Incidents
          </button>
          <button
            onClick={() => setTypeFilter('note')}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              typeFilter === 'note'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            📝 Notes
          </button>
          <button
            onClick={() => setTypeFilter('alert')}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              typeFilter === 'alert'
                ? 'bg-yellow-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            🔔 Alerts
          </button>
        </div>
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
          value={hoursFilter}
          onChange={(e) => setHoursFilter(parseInt(e.target.value))}
          className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-300 text-sm"
        >
          <option value="6">Last 6 hours</option>
          <option value="12">Last 12 hours</option>
          <option value="24">Last 24 hours</option>
          <option value="48">Last 48 hours</option>
          <option value="168">Last 7 days</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={includeAcknowledged}
            onChange={(e) => setIncludeAcknowledged(e.target.checked)}
            className="rounded bg-gray-700 border-gray-600"
          />
          Show acknowledged
        </label>
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
        /* Timeline */
        <div className="space-y-6">
          {Object.keys(groupedItems).length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              No activity found
            </div>
          ) : (
            Object.entries(groupedItems).map(([date, items]) => (
              <div key={date}>
                <h3 className="text-sm font-medium text-gray-400 mb-3 sticky top-0 bg-gray-900 py-2">
                  {date === new Date().toLocaleDateString() ? 'Today' : date}
                </h3>
                <div className="space-y-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className={`bg-gray-800 rounded-lg border border-gray-700 border-l-4 ${TYPE_COLORS[item.type]} p-4`}
                    >
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span className="text-xl">{TYPE_ICONS[item.type]}</span>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className={`px-2 py-0.5 text-xs rounded-full ${TYPE_BADGES[item.type]}`}>
                                {item.type}
                              </span>
                              {item.severity && (
                                <span className={`text-xs ${SEVERITY_COLORS[item.severity] || 'text-gray-400'}`}>
                                  {item.severity}
                                </span>
                              )}
                              {item.category && (
                                <span className="px-2 py-0.5 text-xs rounded-full bg-gray-700 text-gray-300">
                                  {item.category}
                                </span>
                              )}
                              {item.is_pinned && (
                                <span className="text-yellow-400 text-xs">📌 Pinned</span>
                              )}
                              {!item.is_acknowledged && (
                                <span className="text-blue-400 text-xs">● New</span>
                              )}
                            </div>
                            <h4 className="font-medium text-white">{item.title}</h4>
                            {item.description && (
                              <p className="text-sm text-gray-400 mt-1">
                                {item.description.length > 150
                                  ? `${item.description.substring(0, 150)}...`
                                  : item.description}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                              <span title={formatFullDate(item.created_at)}>
                                {formatTime(item.created_at)}
                              </span>
                              {item.created_by && (
                                <span>by {item.created_by}</span>
                              )}
                              {item.status && (
                                <span className={
                                  item.status === 'resolved' ? 'text-green-400' :
                                  item.status === 'investigating' ? 'text-yellow-400' :
                                  'text-red-400'
                                }>
                                  {item.status}
                                </span>
                              )}
                              {/* Metadata */}
                              {item.metadata.camera_id ? (
                                <span>📷 {String(item.metadata.camera_id)}</span>
                              ) : null}
                              {item.metadata.location ? (
                                <span>📍 {String(item.metadata.location)}</span>
                              ) : null}
                              {item.metadata.zone_name ? (
                                <span>{String(item.metadata.zone_name)}</span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          {item.metadata.snapshot_url ? (
                            <a
                              href={String(item.metadata.snapshot_url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300"
                            >
                              View
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}

          {/* Load More */}
          {feed?.has_more && (
            <div className="text-center py-4">
              <p className="text-gray-400 text-sm">
                Showing {feed.items.length} of {feed.total} items
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
