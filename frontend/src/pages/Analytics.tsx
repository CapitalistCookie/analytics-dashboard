import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts'
import {
  getHourlyTraffic,
  getZoneTraffic,
  getTrafficByCamera,
  getDwellByZone,
  getDwellDistribution,
  getHeatmapData,
  getCurrentOccupancy,
  getOccupancyHistoryV2,
  getAnalyticsSummaryV2,
  exportAnalyticsCsv,
  type HourlyCount,
  type ZoneTraffic,
  type CameraTraffic,
  type DwellByZone,
  type DwellDistribution,
  type HeatmapCell,
  type CurrentOccupancy,
  type OccupancyPoint,
  type AnalyticsSummaryV2
} from '../api/client'
import ZoneHeatMap from '../components/ZoneHeatMap'
import PoseStatsWidget from '../components/PoseStatsWidget'
import FlowAnalytics from '../components/FlowAnalytics'
import ActionAnalytics from '../components/ActionAnalytics'
import StaffAnalytics from '../components/StaffAnalytics'
import CustomerInsights from '../components/CustomerInsights'

// View tabs
type AnalyticsView = 'traffic' | 'flow' | 'actions' | 'staff' | 'customers'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']
const HEATMAP_COLORS = ['#1f2937', '#1e3a5f', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd']

// Date range presets
type DatePreset = 'today' | 'yesterday' | 'last7' | 'last30' | 'custom'

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function getDateFromPreset(preset: DatePreset): { start: string; end: string } {
  const today = new Date()
  const todayStr = formatDate(today)

  switch (preset) {
    case 'today':
      return { start: todayStr, end: todayStr }
    case 'yesterday': {
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayStr = formatDate(yesterday)
      return { start: yesterdayStr, end: yesterdayStr }
    }
    case 'last7': {
      const weekAgo = new Date(today)
      weekAgo.setDate(weekAgo.getDate() - 6)
      return { start: formatDate(weekAgo), end: todayStr }
    }
    case 'last30': {
      const monthAgo = new Date(today)
      monthAgo.setDate(monthAgo.getDate() - 29)
      return { start: formatDate(monthAgo), end: todayStr }
    }
    default:
      return { start: todayStr, end: todayStr }
  }
}

export default function Analytics() {
  const [datePreset, setDatePreset] = useState<DatePreset>('today')
  const [selectedDate] = useState<string>(formatDate(new Date()))
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [activeView, setActiveView] = useState<AnalyticsView>('traffic')

  // Data states
  const [hourlyTraffic, setHourlyTraffic] = useState<HourlyCount[]>([])
  const [zoneTraffic, setZoneTraffic] = useState<ZoneTraffic[]>([])
  const [cameraTraffic, setCameraTraffic] = useState<CameraTraffic[]>([])
  const [dwellByZone, setDwellByZone] = useState<DwellByZone[]>([])
  const [dwellDistribution, setDwellDistribution] = useState<DwellDistribution[]>([])
  const [heatmapData, setHeatmapData] = useState<HeatmapCell[]>([])
  const [occupancy, setOccupancy] = useState<CurrentOccupancy | null>(null)
  const [occupancyHistory, setOccupancyHistory] = useState<OccupancyPoint[]>([])
  const [summary, setSummary] = useState<AnalyticsSummaryV2 | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const { end } = getDateFromPreset(datePreset)
      const targetDate = datePreset === 'custom' ? selectedDate : end

      const [
        hourlyRes,
        zoneRes,
        cameraRes,
        dwellZoneRes,
        dwellDistRes,
        heatmapRes,
        occupancyRes,
        historyRes,
        summaryRes
      ] = await Promise.all([
        getHourlyTraffic(targetDate),
        getZoneTraffic(targetDate),
        getTrafficByCamera(targetDate),
        getDwellByZone(targetDate),
        getDwellDistribution(targetDate),
        getHeatmapData(7),
        getCurrentOccupancy(),
        getOccupancyHistoryV2(targetDate),
        getAnalyticsSummaryV2(targetDate)
      ])

      setHourlyTraffic(hourlyRes.data)
      setZoneTraffic(zoneRes.data)
      setCameraTraffic(cameraRes.data)
      setDwellByZone(dwellZoneRes.data)
      setDwellDistribution(dwellDistRes.data)
      setHeatmapData(heatmapRes.data)
      setOccupancy(occupancyRes.data)
      setOccupancyHistory(historyRes.data)
      setSummary(summaryRes.data)
    } catch (err) {
      console.error('Failed to fetch analytics:', err)
    } finally {
      setLoading(false)
    }
  }, [datePreset, selectedDate])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Refresh occupancy every 30 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await getCurrentOccupancy()
        setOccupancy(res.data)
      } catch (err) {
        console.error('Failed to refresh occupancy:', err)
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [])

  const handleExport = async () => {
    setExporting(true)
    try {
      const { end } = getDateFromPreset(datePreset)
      const targetDate = datePreset === 'custom' ? selectedDate : end
      const response = await exportAnalyticsCsv(targetDate)

      // Create download link
      const blob = new Blob([response.data], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `detections_${targetDate}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export:', err)
    } finally {
      setExporting(false)
    }
  }

  const presetLabels: Record<DatePreset, string> = {
    today: 'Today',
    yesterday: 'Yesterday',
    last7: 'Last 7 Days',
    last30: 'Last 30 Days',
    custom: 'Custom'
  }

  if (loading) {
    return (
      <div className="space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-xl md:text-2xl font-bold text-white">Analytics</h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-4 md:p-6 h-60 md:h-80 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header with view tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-white">Analytics</h2>
          {/* View tabs */}
          <div className="flex bg-gray-700 rounded-lg p-1 mt-2">
            <button
              onClick={() => setActiveView('traffic')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeView === 'traffic'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Traffic Analytics
            </button>
            <button
              onClick={() => setActiveView('flow')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeView === 'flow'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Flow Analysis
            </button>
            <button
              onClick={() => setActiveView('actions')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeView === 'actions'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Actions
            </button>
            <button
              onClick={() => setActiveView('staff')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeView === 'staff'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Staff
            </button>
            <button
              onClick={() => setActiveView('customers')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeView === 'customers'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Customers
            </button>
          </div>
        </div>
        {activeView === 'traffic' && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Date preset buttons */}
            <div className="flex bg-gray-800 rounded-lg p-1">
              {(['today', 'yesterday', 'last7', 'last30'] as DatePreset[]).map((preset) => (
                <button
                  key={preset}
                  onClick={() => setDatePreset(preset)}
                  className={`px-2 md:px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    datePreset === preset
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {presetLabels[preset]}
                </button>
              ))}
            </div>

            {/* Export button */}
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg text-xs font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
        )}
      </div>

      {/* Flow Analysis View */}
      {activeView === 'flow' && <FlowAnalytics />}

      {/* Action Analytics View */}
      {activeView === 'actions' && <ActionAnalytics />}

      {/* Staff Analytics View */}
      {activeView === 'staff' && <StaffAnalytics />}

      {/* Customer Insights View */}
      {activeView === 'customers' && <CustomerInsights />}

      {/* Traffic Analytics View */}
      {activeView === 'traffic' && (
        <>
          {/* Summary Cards */}
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
          <SummaryCard
            label="Total Detections"
            value={summary.total_detections.toLocaleString()}
            trend={summary.vs_yesterday_percent}
            icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
          />
          <SummaryCard
            label="Unique Visitors"
            value={summary.total_visitors.toLocaleString()}
            icon="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
          />
          <SummaryCard
            label="Avg Dwell Time"
            value={`${summary.avg_dwell_minutes.toFixed(1)} min`}
            icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
          <SummaryCard
            label="Peak Hour"
            value={summary.peak_hour}
            subValue={`${summary.peak_hour_count} people`}
            icon="M13 10V3L4 14h7v7l9-11h-7z"
          />
          <SummaryCard
            label="Busiest Zone"
            value={summary.busiest_zone}
            icon="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
          />
          <SummaryCard
            label="Current Occupancy"
            value={occupancy?.total.toString() || '0'}
            subValue="people now"
            isLive
            icon="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Hourly Traffic Chart */}
        <div className="bg-gray-800 rounded-lg p-4 md:p-6">
          <h3 className="text-base md:text-lg font-semibold text-white mb-3 md:mb-4">Hourly Traffic</h3>
          <div className="h-48 md:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyTraffic} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="hour"
                  stroke="#9ca3af"
                  fontSize={10}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => v.split(':')[0]}
                  interval={2}
                />
                <YAxis stroke="#9ca3af" fontSize={10} tick={{ fontSize: 10 }} width={30} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', fontSize: '12px' }}
                  labelStyle={{ color: '#fff' }}
                />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Bar dataKey="customers" name="Customers" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                <Bar dataKey="staff" name="Staff" fill="#10b981" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Occupancy Timeline */}
        <div className="bg-gray-800 rounded-lg p-4 md:p-6">
          <h3 className="text-base md:text-lg font-semibold text-white mb-3 md:mb-4">Occupancy Timeline</h3>
          <div className="h-48 md:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={occupancyHistory} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="timestamp"
                  stroke="#9ca3af"
                  fontSize={10}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => {
                    const date = new Date(v)
                    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
                  }}
                  interval="preserveStartEnd"
                />
                <YAxis stroke="#9ca3af" fontSize={10} tick={{ fontSize: 10 }} width={30} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', fontSize: '12px' }}
                  labelStyle={{ color: '#fff' }}
                  labelFormatter={(v) => new Date(v).toLocaleTimeString()}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="Occupancy"
                  stroke="#8b5cf6"
                  fill="#8b5cf680"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Zone Activity */}
        <div className="bg-gray-800 rounded-lg p-4 md:p-6">
          <h3 className="text-base md:text-lg font-semibold text-white mb-3 md:mb-4">Zone Activity</h3>
          <div className="grid grid-cols-2 gap-2 md:gap-3">
            {zoneTraffic.slice(0, 8).map((zone) => (
              <div key={zone.zone} className="relative">
                <div
                  className="p-3 md:p-4 rounded-lg text-center"
                  style={{
                    backgroundColor: `rgba(${
                      zone.activity > 70 ? '239, 68, 68' :
                      zone.activity > 50 ? '245, 158, 11' :
                      zone.activity > 30 ? '16, 185, 129' :
                      '59, 130, 246'
                    }, ${0.2 + (zone.activity / 100) * 0.6})`
                  }}
                >
                  <p className="text-white font-medium text-xs md:text-sm truncate">{zone.zone.replace(/_/g, ' ')}</p>
                  <p className="text-xl md:text-2xl font-bold text-white mt-1">{zone.count}</p>
                  <p className="text-[10px] text-gray-300">{zone.percentage}%</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-2 md:gap-4 mt-3 md:mt-4 text-[10px] md:text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 md:w-3 md:h-3 rounded bg-blue-500/50" /> Low
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 md:w-3 md:h-3 rounded bg-green-500/50" /> Medium
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 md:w-3 md:h-3 rounded bg-yellow-500/50" /> High
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 md:w-3 md:h-3 rounded bg-red-500/50" /> Very High
            </span>
          </div>
        </div>

        {/* Camera Traffic Distribution */}
        <div className="bg-gray-800 rounded-lg p-4 md:p-6">
          <h3 className="text-base md:text-lg font-semibold text-white mb-3 md:mb-4">Traffic by Camera</h3>
          <div className="h-48 md:h-64 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={cameraTraffic.slice(0, 8).map(item => ({ ...item, name: item.camera }))}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="count"
                  nameKey="name"
                  label={({ name, payload }) => `${name}: ${payload.percentage}%`}
                  labelLine={{ stroke: '#9ca3af', strokeWidth: 1 }}
                >
                  {cameraTraffic.slice(0, 8).map((entry, index) => (
                    <Cell key={entry.camera} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', fontSize: '12px' }}
                  formatter={(value) => [Number(value).toLocaleString(), 'Detections']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Dwell Time by Zone */}
        <div className="bg-gray-800 rounded-lg p-4 md:p-6">
          <h3 className="text-base md:text-lg font-semibold text-white mb-3 md:mb-4">Average Dwell Time by Zone</h3>
          <div className="h-48 md:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dwellByZone.slice(0, 8)}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" stroke="#9ca3af" fontSize={10} unit=" min" />
                <YAxis
                  type="category"
                  dataKey="zone"
                  stroke="#9ca3af"
                  fontSize={10}
                  width={80}
                  tickFormatter={(v) => v.replace(/_/g, ' ')}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', fontSize: '12px' }}
                  formatter={(value) => [`${Number(value).toFixed(1)} min`, 'Avg Dwell']}
                />
                <Bar dataKey="avg_dwell_minutes" name="Avg Dwell" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Dwell Time Distribution */}
        <div className="bg-gray-800 rounded-lg p-4 md:p-6">
          <h3 className="text-base md:text-lg font-semibold text-white mb-3 md:mb-4">Dwell Time Distribution</h3>
          <div className="h-48 md:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dwellDistribution} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="bucket" stroke="#9ca3af" fontSize={9} tick={{ fontSize: 9 }} />
                <YAxis stroke="#9ca3af" fontSize={10} tick={{ fontSize: 10 }} width={35} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', fontSize: '12px' }}
                  formatter={(value, name) => [
                    name === 'count' ? value : `${value}%`,
                    name === 'count' ? 'Events' : 'Percentage'
                  ]}
                />
                <Bar dataKey="count" name="Events" fill="#ec4899" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Day/Hour Heatmap */}
        <div className="bg-gray-800 rounded-lg p-4 md:p-6 lg:col-span-2">
          <h3 className="text-base md:text-lg font-semibold text-white mb-3 md:mb-4">Weekly Activity Heatmap</h3>
          <DayHourHeatmap data={heatmapData} />
        </div>

        {/* Zone Floor Plan Heat Map */}
        <div className="lg:col-span-2">
          <ZoneHeatMap refreshInterval={15000} showLabels={true} />
        </div>

        {/* Pose Stats Widget */}
        <div className="lg:col-span-1">
          <PoseStatsWidget refreshInterval={10000} />
        </div>
      </div>
        </>
      )}
    </div>
  )
}

// Summary Card Component
function SummaryCard({
  label,
  value,
  trend,
  subValue,
  isLive,
  icon
}: {
  label: string
  value: string
  trend?: number
  subValue?: string
  isLive?: boolean
  icon: string
}) {
  return (
    <div className="bg-gray-800 rounded-lg p-3 md:p-4">
      <div className="flex items-start justify-between">
        <div className="p-1.5 md:p-2 bg-blue-600/20 rounded-lg flex-shrink-0">
          <svg className="w-4 h-4 md:w-5 md:h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
          </svg>
        </div>
        {isLive && (
          <span className="flex items-center gap-1 text-[10px] text-green-400">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            LIVE
          </span>
        )}
      </div>
      <div className="mt-2">
        <p className="text-lg md:text-xl font-bold text-white truncate">{value}</p>
        <div className="flex items-center gap-2">
          <p className="text-[10px] md:text-xs text-gray-400 truncate">{label}</p>
          {trend !== undefined && trend !== 0 && (
            <span className={`text-[10px] flex items-center ${trend > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
              <svg className={`w-3 h-3 ${trend < 0 ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </span>
          )}
        </div>
        {subValue && (
          <p className="text-[10px] text-gray-500">{subValue}</p>
        )}
      </div>
    </div>
  )
}

// Day/Hour Heatmap Component
function DayHourHeatmap({ data }: { data: HeatmapCell[] }) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const hours = Array.from({ length: 24 }, (_, i) => i)

  // Find max value for color scaling
  const maxCount = Math.max(...data.map(d => d.count), 1)

  // Create lookup map
  const dataMap = new Map<string, number>()
  data.forEach(d => {
    dataMap.set(`${d.day_index}-${d.hour}`, d.count)
  })

  const getColor = (count: number): string => {
    const intensity = count / maxCount
    if (intensity === 0) return '#1f2937'
    if (intensity < 0.2) return '#1e3a5f'
    if (intensity < 0.4) return '#1d4ed8'
    if (intensity < 0.6) return '#2563eb'
    if (intensity < 0.8) return '#3b82f6'
    return '#60a5fa'
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Hour labels */}
        <div className="flex ml-12 mb-1">
          {hours.map(hour => (
            <div key={hour} className="flex-1 text-center text-[9px] text-gray-500">
              {hour % 3 === 0 ? `${hour}` : ''}
            </div>
          ))}
        </div>

        {/* Grid */}
        {days.map((day, dayIndex) => (
          <div key={day} className="flex items-center mb-1">
            <div className="w-12 text-xs text-gray-400 pr-2 text-right">{day}</div>
            <div className="flex flex-1 gap-0.5">
              {hours.map(hour => {
                const count = dataMap.get(`${dayIndex}-${hour}`) || 0
                return (
                  <div
                    key={hour}
                    className="flex-1 h-5 rounded-sm transition-colors cursor-pointer hover:ring-1 hover:ring-white/50"
                    style={{ backgroundColor: getColor(count) }}
                    title={`${day} ${hour}:00 - ${count} detections`}
                  />
                )
              })}
            </div>
          </div>
        ))}

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-4 text-xs text-gray-400">
          <span>Less</span>
          <div className="flex gap-0.5">
            {HEATMAP_COLORS.map((color, i) => (
              <div key={i} className="w-4 h-4 rounded-sm" style={{ backgroundColor: color }} />
            ))}
          </div>
          <span>More</span>
        </div>
      </div>
    </div>
  )
}
