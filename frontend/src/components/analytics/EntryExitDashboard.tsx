import OccupancyCard from './OccupancyCard'
import HourlyTrafficChart from './HourlyTrafficChart'
import TrafficStats from './TrafficStats'

export default function EntryExitDashboard() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white flex items-center gap-2">
        <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        Entry/Exit Analytics
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Occupancy Card - takes 1 column */}
        <OccupancyCard />

        {/* Traffic Stats - takes 2 columns on large screens */}
        <div className="lg:col-span-2">
          <TrafficStats />
        </div>
      </div>

      {/* Hourly Chart - full width */}
      <HourlyTrafficChart />
    </div>
  )
}
