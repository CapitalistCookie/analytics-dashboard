/**
 * FlowAnalytics - Flow optimization and bottleneck analysis dashboard
 *
 * Displays:
 * - Flow efficiency score (A-F grade)
 * - Bottleneck zones with severity
 * - Common journey paths
 * - Staffing recommendations
 * - Traffic heatmap by zone and hour
 */

import { useState, useEffect } from 'react'
import {
  getFlowSummary,
  getHeatmap,
  type FlowSummary,
  type HeatmapData,
  type BottleneckData,
  type StaffingRecommendation,
  type CommonPath,
} from '../api/flow'

function getGradeColor(grade: string): string {
  switch (grade) {
    case 'A':
      return 'text-green-500'
    case 'B':
      return 'text-blue-500'
    case 'C':
      return 'text-yellow-500'
    case 'D':
      return 'text-orange-500'
    default:
      return 'text-red-500'
  }
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'high':
      return 'bg-red-500 text-white'
    case 'medium':
      return 'bg-yellow-500 text-black'
    default:
      return 'bg-green-500 text-white'
  }
}

function formatHour(hour: number): string {
  if (hour === 0) return '12 AM'
  if (hour === 12) return '12 PM'
  return hour > 12 ? `${hour - 12} PM` : `${hour} AM`
}

interface FlowScoreCardProps {
  score: FlowSummary['score']
}

function FlowScoreCard({ score }: FlowScoreCardProps) {
  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Flow Efficiency</h3>
      <div className="flex items-center gap-6">
        <div
          className={`text-6xl font-bold ${getGradeColor(score.grade)}`}
        >
          {score.grade}
        </div>
        <div>
          <div className="text-3xl text-white">{score.score}/100</div>
          <div className="text-gray-400 text-sm mt-1">
            {score.factors.total_zones_analyzed} zones analyzed
          </div>
          {score.factors.high_severity_zones > 0 && (
            <div className="text-red-400 text-sm">
              {score.factors.high_severity_zones} high-severity bottleneck
              {score.factors.high_severity_zones > 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 text-xs text-gray-500">
        Based on last {score.period_hours} hours of data
      </div>
    </div>
  )
}

interface BottlenecksCardProps {
  bottlenecks: BottleneckData[]
}

function BottlenecksCard({ bottlenecks }: BottlenecksCardProps) {
  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Bottleneck Zones</h3>
      {bottlenecks.length === 0 ? (
        <div className="text-gray-400 text-center py-4">
          No bottlenecks detected
        </div>
      ) : (
        <div className="space-y-3">
          {bottlenecks.map((b) => (
            <div
              key={b.zone}
              className="flex items-center justify-between bg-gray-700/50 rounded-lg p-3"
            >
              <div>
                <span className="text-white font-medium capitalize">
                  {b.zone.replace('_', ' ')}
                </span>
                <div className="text-gray-400 text-sm">
                  {b.avg_dwell_minutes.toFixed(1)} min avg dwell &middot; {b.visits} visits
                </div>
              </div>
              <span
                className={`px-2 py-1 rounded text-xs font-medium ${getSeverityColor(
                  b.severity
                )}`}
              >
                {b.severity.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface CommonPathsCardProps {
  paths: CommonPath[]
}

function CommonPathsCard({ paths }: CommonPathsCardProps) {
  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Common Paths</h3>
      {paths.length === 0 ? (
        <div className="text-gray-400 text-center py-4">
          Not enough journey data yet
        </div>
      ) : (
        <div className="space-y-2">
          {paths.map((p, i) => (
            <div
              key={i}
              className="flex items-center justify-between bg-gray-700/50 rounded-lg p-3"
            >
              <span className="text-gray-300 font-mono text-sm truncate flex-1 mr-2">
                {p.zones.map((z, idx) => (
                  <span key={idx}>
                    <span className="capitalize">{z.replace('_', ' ')}</span>
                    {idx < p.zones.length - 1 && (
                      <span className="text-gray-500 mx-1">&rarr;</span>
                    )}
                  </span>
                ))}
              </span>
              <span className="text-blue-400 text-sm whitespace-nowrap">
                {p.count} visitor{p.count > 1 ? 's' : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface StaffingCardProps {
  staffing: StaffingRecommendation[]
}

function StaffingCard({ staffing }: StaffingCardProps) {
  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4">
        Staffing Recommendations
      </h3>
      {staffing.length === 0 ? (
        <div className="text-gray-400 text-center py-4">
          Not enough data for recommendations
        </div>
      ) : (
        <div className="space-y-3">
          {staffing.map((s) => (
            <div
              key={s.zone}
              className="border-l-4 border-blue-500 pl-4 py-2"
            >
              <div className="text-white font-medium capitalize">
                {s.zone.replace('_', ' ')}
                <span className="text-gray-500 text-xs ml-2">
                  Priority: {s.priority}
                </span>
              </div>
              <div className="text-gray-400 text-sm">{s.recommendation}</div>
              <div className="text-gray-500 text-xs mt-1">
                Peak hours: {s.peak_hours.map(formatHour).join(', ')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface HeatmapCardProps {
  heatmap: HeatmapData | null
  loading: boolean
}

function HeatmapCard({ heatmap, loading }: HeatmapCardProps) {
  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Traffic Heatmap</h3>
        <div className="animate-pulse h-48 bg-gray-700 rounded"></div>
      </div>
    )
  }

  if (!heatmap || heatmap.data.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Traffic Heatmap</h3>
        <div className="text-gray-400 text-center py-4">
          Not enough data for heatmap
        </div>
      </div>
    )
  }

  // Build heatmap grid
  const zones = heatmap.zones.sort()
  const hours = Array.from({ length: 24 }, (_, i) => i)

  // Get max count for color scaling
  const maxCount = Math.max(...heatmap.data.map((d) => d.count), 1)

  // Create lookup map
  const countMap = new Map<string, number>()
  heatmap.data.forEach((d) => {
    countMap.set(`${d.zone}-${d.hour}`, d.count)
  })

  const getHeatColor = (count: number): string => {
    if (count === 0) return 'bg-gray-700'
    const intensity = count / maxCount
    if (intensity > 0.75) return 'bg-red-600'
    if (intensity > 0.5) return 'bg-orange-500'
    if (intensity > 0.25) return 'bg-yellow-500'
    return 'bg-green-600'
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4">
        Traffic Heatmap (Last {heatmap.period_days} days)
      </h3>
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Hour labels */}
          <div className="flex mb-1">
            <div className="w-24 flex-shrink-0"></div>
            {hours.filter((_, i) => i % 2 === 0).map((h) => (
              <div
                key={h}
                className="w-6 text-xs text-gray-500 text-center"
                style={{ marginRight: '2px' }}
              >
                {h}
              </div>
            ))}
          </div>
          {/* Zone rows */}
          {zones.map((zone) => (
            <div key={zone} className="flex items-center mb-1">
              <div className="w-24 flex-shrink-0 text-xs text-gray-400 truncate capitalize pr-2">
                {zone.replace('_', ' ')}
              </div>
              <div className="flex gap-[2px]">
                {hours.map((hour) => {
                  const count = countMap.get(`${zone}-${hour}`) || 0
                  return (
                    <div
                      key={hour}
                      className={`w-3 h-4 rounded-sm ${getHeatColor(count)}`}
                      title={`${zone} at ${formatHour(hour)}: ${count} visits`}
                    />
                  )
                })}
              </div>
            </div>
          ))}
          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 text-xs text-gray-400">
            <span>Traffic:</span>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-gray-700 rounded-sm"></div>
              <span>None</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-green-600 rounded-sm"></div>
              <span>Low</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-yellow-500 rounded-sm"></div>
              <span>Medium</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-orange-500 rounded-sm"></div>
              <span>High</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-red-600 rounded-sm"></div>
              <span>Peak</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function FlowAnalytics() {
  const [summary, setSummary] = useState<FlowSummary | null>(null)
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [heatmapLoading, setHeatmapLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const [summaryRes, heatmapRes] = await Promise.all([
          getFlowSummary(),
          getHeatmap(7),
        ])
        setSummary(summaryRes.data)
        setHeatmap(heatmapRes.data)
        setError(null)
      } catch (err) {
        console.error('Failed to fetch flow data:', err)
        setError('Failed to load flow analysis data')
      } finally {
        setLoading(false)
        setHeatmapLoading(false)
      }
    }

    fetchData()

    // Refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-gray-800 rounded-lg p-6 animate-pulse h-48"
            ></div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-900/50 border border-red-500 rounded-lg p-6 text-center">
        <div className="text-red-400">{error}</div>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!summary) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Top row - Score and Bottlenecks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FlowScoreCard score={summary.score} />
        <BottlenecksCard bottlenecks={summary.bottlenecks} />
      </div>

      {/* Heatmap */}
      <HeatmapCard heatmap={heatmap} loading={heatmapLoading} />

      {/* Bottom row - Paths and Staffing */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <CommonPathsCard paths={summary.top_paths} />
        <StaffingCard staffing={summary.staffing} />
      </div>
    </div>
  )
}

export default FlowAnalytics
