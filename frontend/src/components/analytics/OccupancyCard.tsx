import { useCurrentOccupancy } from '../../hooks/useEntryExit'

interface OccupancyCardProps {
  refreshInterval?: number
}

export default function OccupancyCard({ refreshInterval = 5000 }: OccupancyCardProps) {
  const { data, loading, error } = useCurrentOccupancy(refreshInterval)

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 animate-pulse">
        <div className="h-6 w-40 bg-gray-700 rounded mb-6 mx-auto"></div>
        <div className="h-20 w-24 bg-gray-700 rounded mb-6 mx-auto"></div>
        <div className="flex justify-center gap-8">
          <div className="h-8 w-20 bg-gray-700 rounded"></div>
          <div className="h-8 w-20 bg-gray-700 rounded"></div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 text-center">
        <h3 className="text-lg font-semibold text-gray-300 mb-4">Current Occupancy</h3>
        <p className="text-gray-500">{error || 'No data available'}</p>
      </div>
    )
  }

  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return '--:--'
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const netChangeColor = data.net_change > 0
    ? 'text-green-400'
    : data.net_change < 0
      ? 'text-red-400'
      : 'text-gray-400'

  const netChangeSign = data.net_change > 0 ? '+' : ''

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-gray-300 mb-2 text-center">
        Current Occupancy
      </h3>

      {/* Large occupancy number */}
      <div className="text-center mb-3">
        <p className="text-6xl md:text-7xl font-bold text-white">
          {data.current_occupancy}
        </p>
        <p className={`text-lg font-medium ${netChangeColor}`}>
          {netChangeSign}{data.net_change} today
        </p>
      </div>

      {/* Staff/Customer breakdown */}
      <div className="flex justify-center gap-6 mb-4">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <div>
            <p className="text-xl font-bold text-blue-400">{data.staff_count ?? 0}</p>
            <p className="text-xs text-gray-400">staff</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <div>
            <p className="text-xl font-bold text-purple-400">{data.customer_count ?? 0}</p>
            <p className="text-xs text-gray-400">customers</p>
          </div>
        </div>
      </div>

      {/* Entry/Exit counts */}
      <div className="flex justify-center gap-8 mb-4">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
          <div>
            <p className="text-2xl font-bold text-green-400">{data.entries_today}</p>
            <p className="text-xs text-gray-400">entries</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
          <div>
            <p className="text-2xl font-bold text-red-400">{data.exits_today}</p>
            <p className="text-xs text-gray-400">exits</p>
          </div>
        </div>
      </div>

      {/* Last updated timestamp */}
      <div className="text-center text-xs text-gray-500">
        Updated: {formatTime(data.timestamp)}
      </div>
    </div>
  )
}
