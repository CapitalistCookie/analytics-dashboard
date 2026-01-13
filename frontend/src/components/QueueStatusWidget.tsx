import { useState, useEffect } from 'react'
import { getQueueStatus, getQueueAlerts, type QueueStatus, type QueueAlert } from '../api/client'

interface QueueStatusWidgetProps {
  zone?: string
  refreshInterval?: number
}

export default function QueueStatusWidget({ zone = 'entrance', refreshInterval = 5000 }: QueueStatusWidgetProps) {
  const [status, setStatus] = useState<QueueStatus | null>(null)
  const [alerts, setAlerts] = useState<QueueAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statusRes, alertsRes] = await Promise.all([
          getQueueStatus(zone),
          getQueueAlerts()
        ])
        setStatus(statusRes.data)
        setAlerts(alertsRes.data)
        setError(null)
      } catch (err) {
        console.error('Failed to fetch queue status:', err)
        setError('Unable to load queue data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, refreshInterval)
    return () => clearInterval(interval)
  }, [zone, refreshInterval])

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 md:p-6 animate-pulse h-40">
        <div className="h-4 bg-gray-700 rounded w-1/3 mb-4"></div>
        <div className="h-8 bg-gray-700 rounded w-1/2"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 md:p-6">
        <h3 className="text-base md:text-lg font-semibold text-gray-300 mb-3">Queue Status</h3>
        <p className="text-gray-500 text-sm">{error}</p>
      </div>
    )
  }

  const hasAlert = alerts.length > 0
  const criticalAlert = alerts.find(a => a.severity === 'critical')

  return (
    <div className={`bg-gray-800 rounded-lg p-4 md:p-6 ${criticalAlert ? 'ring-2 ring-red-500' : hasAlert ? 'ring-2 ring-yellow-500' : ''}`}>
      <div className="flex items-center justify-between mb-3 md:mb-4">
        <h3 className="text-base md:text-lg font-semibold text-gray-300">
          Entrance Queue
        </h3>
        {hasAlert && (
          <span className={`px-2 py-1 text-xs rounded-full ${criticalAlert ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
            {criticalAlert ? 'High Wait' : 'Queue Building'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 md:gap-4 mb-4">
        <div className="text-center">
          <p className={`text-2xl md:text-4xl font-bold ${status?.queue_length && status.queue_length >= 5 ? 'text-red-400' : status?.queue_length && status.queue_length >= 3 ? 'text-yellow-400' : 'text-white'}`}>
            {status?.queue_length ?? 0}
          </p>
          <p className="text-xs md:text-sm text-gray-400">Waiting</p>
        </div>
        <div className="text-center">
          <p className="text-2xl md:text-4xl font-bold text-blue-400">
            {status?.avg_wait_formatted ?? '0s'}
          </p>
          <p className="text-xs md:text-sm text-gray-400">Avg Wait</p>
        </div>
        <div className="text-center">
          <p className={`text-2xl md:text-4xl font-bold ${status?.max_wait_seconds && status.max_wait_seconds >= 300 ? 'text-red-400' : status?.max_wait_seconds && status.max_wait_seconds >= 120 ? 'text-yellow-400' : 'text-green-400'}`}>
            {status?.max_wait_formatted ?? '0s'}
          </p>
          <p className="text-xs md:text-sm text-gray-400">Max Wait</p>
        </div>
      </div>

      {/* Show people in queue */}
      {status?.people && status.people.length > 0 && (
        <div className="border-t border-gray-700 pt-3">
          <p className="text-xs text-gray-500 mb-2">Currently waiting:</p>
          <div className="flex flex-wrap gap-2">
            {status.people.slice(0, 5).map((person) => (
              <span
                key={person.person_id}
                className={`px-2 py-1 text-xs rounded-full ${person.wait_seconds >= 300 ? 'bg-red-500/20 text-red-400' : person.wait_seconds >= 120 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-700 text-gray-300'}`}
              >
                {person.display_id} - {person.wait_formatted}
              </span>
            ))}
            {status.people.length > 5 && (
              <span className="px-2 py-1 text-xs rounded-full bg-gray-700 text-gray-400">
                +{status.people.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Show alert message if any */}
      {criticalAlert && (
        <div className="mt-3 p-2 bg-red-500/10 rounded text-xs text-red-400">
          {criticalAlert.message}
        </div>
      )}
    </div>
  )
}
