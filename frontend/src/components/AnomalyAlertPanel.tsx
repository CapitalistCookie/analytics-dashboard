/**
 * AnomalyAlertPanel - Displays real-time anomaly alerts
 *
 * Shows security alerts for:
 * - Loitering: Person in zone too long
 * - Restricted Area: Non-staff in staff-only zones
 * - Unusual Hours: Activity during closed hours
 * - Crowd Density: Zone overcrowding
 * - Rapid Exit: Suspicious quick exits
 */

import { useState } from 'react'
import { AnomalyAlertData } from '../hooks/useDashboardWebSocket'

interface AnomalyAlertPanelProps {
  anomalies: AnomalyAlertData[]
  onDismiss: (index: number) => void
  onClearAll: () => void
}

const SEVERITY_STYLES: Record<string, { bg: string; border: string; icon: string }> = {
  low: {
    bg: 'bg-blue-900/90',
    border: 'border-blue-500',
    icon: 'text-blue-400',
  },
  medium: {
    bg: 'bg-yellow-900/90',
    border: 'border-yellow-500',
    icon: 'text-yellow-400',
  },
  high: {
    bg: 'bg-orange-900/90',
    border: 'border-orange-500',
    icon: 'text-orange-400',
  },
  critical: {
    bg: 'bg-red-900/90 animate-pulse',
    border: 'border-red-500',
    icon: 'text-red-400',
  },
}

const ANOMALY_ICONS: Record<string, string> = {
  loitering: '⏱',
  restricted_area: '🚫',
  unusual_hours: '🌙',
  crowd_density: '👥',
  rapid_exit: '🏃',
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatAnomalyType(type: string): string {
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function AnomalyAlertPanel({
  anomalies,
  onDismiss,
  onClearAll,
}: AnomalyAlertPanelProps) {
  const [isMinimized, setIsMinimized] = useState(false)

  if (anomalies.length === 0) {
    return null
  }

  const visibleAnomalies = anomalies.slice(0, 5)
  const hiddenCount = anomalies.length - visibleAnomalies.length

  return (
    <div className="fixed top-4 right-4 z-50 w-96">
      {/* Header */}
      <div className="flex items-center justify-between bg-gray-800 rounded-t-lg px-4 py-2 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-red-500 animate-pulse">●</span>
          <span className="text-white font-medium">
            Security Alerts ({anomalies.length})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="text-gray-400 hover:text-white p-1"
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? '▼' : '▲'}
          </button>
          <button
            onClick={onClearAll}
            className="text-gray-400 hover:text-white p-1"
            title="Clear all"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Alerts */}
      {!isMinimized && (
        <div className="space-y-2 bg-gray-900/95 p-2 rounded-b-lg max-h-[60vh] overflow-y-auto">
          {visibleAnomalies.map((alert, index) => {
            const styles = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.medium
            const icon = ANOMALY_ICONS[alert.type] || '⚠'

            return (
              <div
                key={`${alert.timestamp}-${index}`}
                className={`${styles.bg} ${styles.border} border rounded-lg p-3 shadow-lg`}
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{icon}</span>
                      <span className={`font-bold text-sm uppercase ${styles.icon}`}>
                        {formatAnomalyType(alert.type)}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          alert.severity === 'critical'
                            ? 'bg-red-600 text-white'
                            : alert.severity === 'high'
                            ? 'bg-orange-600 text-white'
                            : alert.severity === 'medium'
                            ? 'bg-yellow-600 text-black'
                            : 'bg-blue-600 text-white'
                        }`}
                      >
                        {alert.severity.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-white text-sm">{alert.message}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                      <span>{formatTimestamp(alert.timestamp)}</span>
                      {alert.zone && <span>Zone: {alert.zone}</span>}
                      {alert.camera_id && <span>Cam: {alert.camera_id}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => onDismiss(index)}
                    className="text-gray-400 hover:text-white p-1 flex-shrink-0"
                    title="Dismiss"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          })}

          {hiddenCount > 0 && (
            <div className="text-center text-gray-400 text-sm py-2">
              +{hiddenCount} more alerts
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default AnomalyAlertPanel
