import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useHourlyTraffic } from '../../hooks/useEntryExit'
import type { EntryExitHour } from '../../api/client'

interface HourlyTrafficChartProps {
  date?: string
}

export default function HourlyTrafficChart({ date }: HourlyTrafficChartProps) {
  const { data, loading, error } = useHourlyTraffic(date)

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 animate-pulse">
        <div className="h-6 w-48 bg-gray-700 rounded mb-4"></div>
        <div className="h-64 bg-gray-700 rounded"></div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-300 mb-4">Hourly Traffic</h3>
        <div className="h-64 flex items-center justify-center text-gray-500">
          {error || 'No data available'}
        </div>
      </div>
    )
  }

  // Filter to typical restaurant hours (6 AM - 2 AM next day)
  // and only show hours with activity or within business hours
  const chartData = data.hours
    .filter((h: EntryExitHour) => {
      const hour = parseInt(h.hour.split(':')[0])
      // Show 6 AM to midnight, plus 12 AM to 2 AM
      return (hour >= 6 && hour <= 23) || (hour >= 0 && hour <= 2)
    })
    .map((h: EntryExitHour) => ({
      hour: h.hour_label,
      entries: h.entries,
      exits: h.exits,
      net: h.net,
    }))

  // If no data in chart, show empty state
  if (chartData.length === 0 || chartData.every((d: { entries: number; exits: number }) => d.entries === 0 && d.exits === 0)) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-300 mb-4">Hourly Traffic</h3>
        <div className="h-64 flex items-center justify-center text-gray-500">
          No traffic data recorded yet
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-300">Hourly Traffic</h3>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-400">
            Total: <span className="text-green-400 font-medium">{data.total_entries}</span> in,{' '}
            <span className="text-red-400 font-medium">{data.total_exits}</span> out
          </span>
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="hour"
              stroke="#9CA3AF"
              fontSize={10}
              tick={{ fontSize: 10 }}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="#9CA3AF"
              fontSize={10}
              tick={{ fontSize: 10 }}
              width={30}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1F2937',
                border: 'none',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              labelStyle={{ color: '#9CA3AF' }}
              formatter={(value, name) => {
                const label = name === 'entries' ? 'Entries' : 'Exits'
                return [value ?? 0, label]
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: '12px' }}
              formatter={(value) => (
                <span className="text-gray-400 capitalize">{value}</span>
              )}
            />
            <Bar
              dataKey="entries"
              name="entries"
              fill="#22C55E"
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />
            <Bar
              dataKey="exits"
              name="exits"
              fill="#EF4444"
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
