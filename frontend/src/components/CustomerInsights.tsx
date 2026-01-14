import { useState, useEffect } from 'react'
import {
  getInsightsDashboard,
  type InsightsDashboard,
  type CustomerProfile,
  type ChurnRiskCustomer,
  type LoyaltyTier
} from '../api/client'

interface CustomerInsightsProps {
  refreshInterval?: number
}

const TIER_COLORS: Record<LoyaltyTier, string> = {
  new: 'bg-gray-500',
  occasional: 'bg-blue-500',
  regular: 'bg-green-500',
  vip: 'bg-yellow-500',
}

const TIER_ICONS: Record<LoyaltyTier, string> = {
  new: '🆕',
  occasional: '👤',
  regular: '⭐',
  vip: '👑',
}

function SummaryCard({ title, value, icon, color = 'text-white' }: {
  title: string
  value: string | number
  icon: string
  color?: string
}) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center gap-2 text-gray-400 mb-2">
        <span>{icon}</span>
        <span className="text-sm">{title}</span>
      </div>
      <div className={`text-2xl md:text-3xl font-bold ${color}`}>{value}</div>
    </div>
  )
}

export default function CustomerInsights({ refreshInterval = 60000 }: CustomerInsightsProps) {
  const [dashboard, setDashboard] = useState<InsightsDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await getInsightsDashboard()
        setDashboard(res.data)
        setError(null)
      } catch (err) {
        console.error('Failed to fetch customer insights:', err)
        setError('Unable to load customer insights')
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
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-gray-800 rounded-lg p-4 animate-pulse">
              <div className="h-4 bg-gray-700 rounded w-1/2 mb-2"></div>
              <div className="h-8 bg-gray-700 rounded w-1/3"></div>
            </div>
          ))}
        </div>
        <div className="bg-gray-800 rounded-lg p-6 animate-pulse">
          <div className="h-6 bg-gray-700 rounded w-1/4 mb-4"></div>
          <div className="h-32 bg-gray-700 rounded"></div>
        </div>
      </div>
    )
  }

  if (error || !dashboard) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-300 mb-3">Customer Insights</h3>
        <p className="text-gray-500">{error || 'No customer insights data available'}</p>
      </div>
    )
  }

  const { summary, top_customers, retention, churn_risk, frequency } = dashboard

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          title="Total Customers"
          value={summary.total_customers}
          icon="👥"
        />
        <SummaryCard
          title="VIP Customers"
          value={summary.vip_count}
          icon="👑"
          color="text-yellow-400"
        />
        <SummaryCard
          title="Avg Visits"
          value={summary.avg_visits_per_customer}
          icon="🔄"
        />
        <SummaryCard
          title="Return Rate (7d)"
          value={`${summary.returning_rate_7d}%`}
          icon="📈"
          color="text-green-400"
        />
      </div>

      {/* Loyalty Tier Distribution */}
      <div className="bg-gray-800 rounded-lg p-4 md:p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Loyalty Distribution</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(Object.entries(summary.tier_distribution) as [LoyaltyTier, number][]).map(([tier, count]) => (
            <div key={tier} className="text-center">
              <div className={`${TIER_COLORS[tier]} rounded-lg p-4 mb-2`}>
                <span className="text-2xl md:text-3xl">{TIER_ICONS[tier]}</span>
                <div className="text-2xl md:text-3xl font-bold text-white">{count}</div>
              </div>
              <div className="text-gray-400 capitalize text-sm md:text-base">{tier}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Retention Analysis */}
      <div className="bg-gray-800 rounded-lg p-4 md:p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Retention Analysis</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(retention).map(([period, data]) => (
            <div key={period} className="bg-gray-700 rounded-lg p-4">
              <div className="text-gray-400 mb-2 text-sm">Last {period}</div>
              <div className="text-3xl md:text-4xl font-bold text-white">{data.retention_rate}%</div>
              <div className="text-sm text-gray-400 mt-1">
                {data.returning_visitors} / {data.total_visitors} returning
              </div>
              <div className="mt-2 flex gap-2">
                <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded">
                  {data.returning_visitors} return
                </span>
                <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
                  {data.new_visitors} new
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Customers */}
      <div className="bg-gray-800 rounded-lg p-4 md:p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Top Customers</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[600px]">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700 text-sm">
                <th className="pb-3 pr-4">Customer</th>
                <th className="pb-3 pr-4">Tier</th>
                <th className="pb-3 pr-4">Visits</th>
                <th className="pb-3 pr-4">Points</th>
                <th className="pb-3 pr-4">Favorite Zone</th>
                <th className="pb-3 pr-4">Last Visit</th>
              </tr>
            </thead>
            <tbody>
              {top_customers.map((customer: CustomerProfile, i: number) => (
                <tr key={customer.profile_id} className="border-b border-gray-700/50">
                  <td className="py-3 pr-4 text-white">
                    {customer.profile_id}
                    {i < 3 && <span className="ml-2">{['🥇', '🥈', '🥉'][i]}</span>}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`${TIER_COLORS[customer.loyalty_tier]} px-2 py-1 rounded text-white text-sm inline-flex items-center gap-1`}>
                      {TIER_ICONS[customer.loyalty_tier]} {customer.loyalty_tier}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-gray-300">{customer.total_visits}</td>
                  <td className="py-3 pr-4 text-yellow-400">{customer.loyalty_points}</td>
                  <td className="py-3 pr-4 text-gray-300 capitalize">
                    {customer.favorite_zone?.replace(/_/g, ' ') || '-'}
                  </td>
                  <td className="py-3 pr-4 text-gray-400">
                    {customer.days_since_last_visit !== null
                      ? `${customer.days_since_last_visit}d ago`
                      : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {top_customers.length === 0 && (
          <div className="text-gray-500 text-center py-8">
            No customer data available yet
          </div>
        )}
      </div>

      {/* Visit Frequency */}
      <div className="bg-gray-800 rounded-lg p-4 md:p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Visit Frequency (Last {frequency.period_days} Days)
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(frequency.frequency_distribution).map(([bucket, count]) => {
            const displayBucket = bucket.replace(/_/g, ' ').replace('-', '-')
            return (
              <div key={bucket} className="bg-gray-700 rounded-lg p-4 text-center">
                <div className="text-2xl md:text-3xl font-bold text-white">{count}</div>
                <div className="text-gray-400 text-sm capitalize">{displayBucket}</div>
              </div>
            )
          })}
        </div>
        <div className="mt-4 text-center text-gray-400 text-sm">
          {frequency.total_active_customers} active customers in this period
        </div>
      </div>

      {/* Churn Risk */}
      {churn_risk.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4 md:p-6 border-l-4 border-red-500">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span className="text-red-400">⚠️</span>
            Churn Risk ({churn_risk.length} customers)
          </h3>
          <p className="text-gray-400 mb-4 text-sm">
            Regular/VIP customers who haven't visited in 30+ days
          </p>
          <div className="space-y-2">
            {churn_risk.map((customer: ChurnRiskCustomer) => (
              <div
                key={customer.profile_id}
                className="flex flex-col sm:flex-row sm:items-center justify-between bg-gray-700 rounded-lg p-3 gap-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium">{customer.profile_id}</span>
                  <span className={`${TIER_COLORS[customer.loyalty_tier]} px-2 py-0.5 rounded text-xs text-white`}>
                    {TIER_ICONS[customer.loyalty_tier]} {customer.loyalty_tier}
                  </span>
                  <span className="text-gray-400 text-sm">
                    ({customer.total_visits} visits)
                  </span>
                </div>
                <div className="text-red-400 text-sm">
                  {customer.days_since_visit} days since visit
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Additional Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-gray-400 text-sm mb-1">Active This Week</div>
          <div className="text-2xl font-bold text-blue-400">{summary.recent_visitors_7d}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-gray-400 text-sm mb-1">Regular Customers</div>
          <div className="text-2xl font-bold text-green-400">{summary.regular_count}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-gray-400 text-sm mb-1">Avg Dwell Time</div>
          <div className="text-2xl font-bold text-white">
            {summary.avg_dwell_minutes > 0 ? `${summary.avg_dwell_minutes}m` : 'N/A'}
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-gray-400 text-sm mb-1">Avg Visits/Customer</div>
          <div className="text-2xl font-bold text-white">{summary.avg_visits_per_customer}</div>
        </div>
      </div>
    </div>
  )
}
