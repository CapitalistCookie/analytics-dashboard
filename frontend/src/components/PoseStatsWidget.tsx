import { useState, useEffect } from 'react'
import { getPoseStats, type PoseStats } from '../api/client'

interface PoseStatsWidgetProps {
  refreshInterval?: number
}

export default function PoseStatsWidget({ refreshInterval = 10000 }: PoseStatsWidgetProps) {
  const [stats, setStats] = useState<PoseStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await getPoseStats()
        setStats(res.data)
        setError(null)
      } catch (err) {
        console.error('Failed to fetch pose stats:', err)
        setError('Unable to load pose data')
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
      <div className="bg-gray-800 rounded-lg p-4 md:p-6 animate-pulse h-32">
        <div className="h-4 bg-gray-700 rounded w-1/3 mb-4"></div>
        <div className="h-8 bg-gray-700 rounded w-1/2"></div>
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 md:p-6">
        <h3 className="text-base md:text-lg font-semibold text-gray-300 mb-3">Pose Detection</h3>
        <p className="text-gray-500 text-sm">{error || 'No data available'}</p>
      </div>
    )
  }

  const seatedPercent = stats.total_active > 0
    ? Math.round((stats.seated / stats.total_active) * 100)
    : 0
  const standingPercent = stats.total_active > 0
    ? Math.round((stats.standing / stats.total_active) * 100)
    : 0

  return (
    <div className="bg-gray-800 rounded-lg p-4 md:p-6">
      <div className="flex items-center justify-between mb-3 md:mb-4">
        <h3 className="text-base md:text-lg font-semibold text-gray-300">
          Customer Poses
        </h3>
        <span className="text-xs text-gray-500">
          {stats.total_active} tracked
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 md:gap-4">
        {/* Seated */}
        <div className="text-center">
          <div className="flex items-center justify-center mb-1">
            <svg className="w-6 h-6 md:w-8 md:h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          <p className="text-2xl md:text-3xl font-bold text-blue-400">{stats.seated}</p>
          <p className="text-xs text-gray-400">Seated</p>
          <p className="text-xs text-gray-500">{seatedPercent}%</p>
        </div>

        {/* Standing */}
        <div className="text-center">
          <div className="flex items-center justify-center mb-1">
            <svg className="w-6 h-6 md:w-8 md:h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <p className="text-2xl md:text-3xl font-bold text-green-400">{stats.standing}</p>
          <p className="text-xs text-gray-400">Standing</p>
          <p className="text-xs text-gray-500">{standingPercent}%</p>
        </div>

        {/* Unknown */}
        <div className="text-center">
          <div className="flex items-center justify-center mb-1">
            <svg className="w-6 h-6 md:w-8 md:h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-2xl md:text-3xl font-bold text-gray-400">{stats.unknown}</p>
          <p className="text-xs text-gray-400">Unknown</p>
        </div>
      </div>

      {/* Breakdown by zone if available */}
      {(Object.keys(stats.seated_by_zone).length > 0 || Object.keys(stats.standing_by_zone).length > 0) && (
        <div className="mt-4 pt-3 border-t border-gray-700">
          <p className="text-xs text-gray-500 mb-2">By Zone:</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.seated_by_zone).map(([zone, count]) => (
              <span key={`seated-${zone}`} className="px-2 py-1 text-xs rounded-full bg-blue-500/20 text-blue-400">
                {zone}: {count} seated
              </span>
            ))}
            {Object.entries(stats.standing_by_zone).map(([zone, count]) => (
              <span key={`standing-${zone}`} className="px-2 py-1 text-xs rounded-full bg-green-500/20 text-green-400">
                {zone}: {count} standing
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
