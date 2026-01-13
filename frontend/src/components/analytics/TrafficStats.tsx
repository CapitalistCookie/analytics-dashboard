import { useHourlyTraffic, useDetectorStats } from '../../hooks/useEntryExit'
import type { EntryExitHour } from '../../api/client'

export default function TrafficStats() {
  const { data: hourlyData, loading: hourlyLoading } = useHourlyTraffic()
  const { data: statsData, loading: statsLoading } = useDetectorStats()

  const loading = hourlyLoading || statsLoading

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-gray-800 rounded-lg p-4 h-20"></div>
        ))}
      </div>
    )
  }

  // Calculate peak hour from hourly data
  let peakHour = '--'
  let peakCount = 0
  if (hourlyData?.hours) {
    const maxEntry = hourlyData.hours.reduce((max: { entries: number; hour_label: string }, h: EntryExitHour) =>
      h.entries > max.entries ? h : max,
      { entries: 0, hour_label: '--' }
    )
    if (maxEntry.entries > 0) {
      peakHour = maxEntry.hour_label
      peakCount = maxEntry.entries
    }
  }

  // Determine busiest period
  let busiestPeriod = '--'
  if (hourlyData?.hours) {
    const periods = {
      'Morning (6-11)': 0,
      'Lunch (11-14)': 0,
      'Afternoon (14-17)': 0,
      'Dinner (17-21)': 0,
      'Late Night (21-2)': 0,
    }

    hourlyData.hours.forEach((h: EntryExitHour) => {
      const hour = parseInt(h.hour.split(':')[0])
      if (hour >= 6 && hour < 11) periods['Morning (6-11)'] += h.entries
      else if (hour >= 11 && hour < 14) periods['Lunch (11-14)'] += h.entries
      else if (hour >= 14 && hour < 17) periods['Afternoon (14-17)'] += h.entries
      else if (hour >= 17 && hour < 21) periods['Dinner (17-21)'] += h.entries
      else periods['Late Night (21-2)'] += h.entries
    })

    const maxPeriod = Object.entries(periods).reduce((max, [period, count]) =>
      count > max[1] ? [period, count] : max,
      ['--', 0]
    )
    if (maxPeriod[1] > 0) {
      busiestPeriod = maxPeriod[0]
    }
  }

  const totalVisitors = hourlyData?.total_entries || 0
  const activeDetectors = statsData?.active_detectors || 0
  const totalDetectors = statsData?.total_detectors || 0

  const stats = [
    {
      label: 'Peak Hour',
      value: peakHour,
      subValue: peakCount > 0 ? `${peakCount} entries` : null,
      icon: (
        <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      label: 'Total Visitors',
      value: totalVisitors.toString(),
      subValue: 'today',
      icon: (
        <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      label: 'Busiest Period',
      value: busiestPeriod.split(' ')[0] || '--',
      subValue: busiestPeriod.includes('(') ? busiestPeriod.match(/\(([^)]+)\)/)?.[1] : null,
      icon: (
        <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: 'Detectors',
      value: `${activeDetectors}/${totalDetectors}`,
      subValue: 'active',
      icon: (
        <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-gray-800 rounded-lg p-4 flex items-center gap-3"
        >
          <div className="p-2 bg-gray-700/50 rounded-lg">{stat.icon}</div>
          <div>
            <p className="text-xs text-gray-400">{stat.label}</p>
            <p className="text-xl font-bold text-white">{stat.value}</p>
            {stat.subValue && (
              <p className="text-xs text-gray-500">{stat.subValue}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
