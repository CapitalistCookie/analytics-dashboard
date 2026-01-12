import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  getStaffScorecard,
  getLeaderboard,
  getTeamSummary,
  getStaffBadges,
  StaffScorecard as ScorecardType,
  LeaderboardEntry,
  TeamSummary,
  BadgeInfo,
} from '../api/client'

type Period = 'week' | 'month'

export default function Scorecards() {
  const { staffId } = useParams<{ staffId: string }>()
  const navigate = useNavigate()
  const [period, setPeriod] = useState<Period>('week')
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [teamSummary, setTeamSummary] = useState<TeamSummary | null>(null)
  const [selectedScorecard, setSelectedScorecard] = useState<ScorecardType | null>(null)
  const [staffBadges, setStaffBadges] = useState<BadgeInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [scorecardLoading, setScorecardLoading] = useState(false)

  useEffect(() => {
    loadData()
  }, [period])

  useEffect(() => {
    if (staffId) {
      loadScorecard(parseInt(staffId))
    } else {
      setSelectedScorecard(null)
    }
  }, [staffId, period])

  const loadData = async () => {
    try {
      setLoading(true)
      const [leaderboardRes, teamRes] = await Promise.all([
        getLeaderboard({ period, limit: 10 }),
        getTeamSummary(period),
      ])
      setLeaderboard(leaderboardRes.data)
      setTeamSummary(teamRes.data)
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadScorecard = async (id: number) => {
    try {
      setScorecardLoading(true)
      const [scorecardRes, badgesRes] = await Promise.all([
        getStaffScorecard(id, period),
        getStaffBadges(id),
      ])
      setSelectedScorecard(scorecardRes.data)
      setStaffBadges(badgesRes.data)
    } catch (error) {
      console.error('Failed to load scorecard:', error)
    } finally {
      setScorecardLoading(false)
    }
  }

  const handleStaffClick = (id: number) => {
    navigate(`/scorecards/${id}`)
  }

  const getBadgeIcon = (badge: string) => {
    const icons: Record<string, string> = {
      'Speed Star': 'M13 10V3L4 14h7v7l9-11h-7z',
      'Customer Favorite': 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
      'Team Player': 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
      'Early Bird': 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z',
      'Night Owl': 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z',
      'Perfect Attendance': 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
      'Top Seller': 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z',
      'Zone Master': 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7',
      'Quick Responder': 'M13 10V3L4 14h7v7l9-11h-7z',
      '5-Star Service': 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
    }
    return icons[badge] || 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z'
  }

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return { icon: 'M5 10l7-7m0 0l7 7m-7-7v18', color: 'text-green-400' }
      case 'down': return { icon: 'M19 14l-7 7m0 0l-7-7m7 7V3', color: 'text-red-400' }
      default: return { icon: 'M5 12h14', color: 'text-gray-400' }
    }
  }

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'improving': return 'text-green-400'
      case 'declining': return 'text-red-400'
      default: return 'text-gray-400'
    }
  }

  const renderLeaderboard = () => (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Leaderboard</h2>
        <span className="text-sm text-gray-400">This {period}</span>
      </div>
      <div className="space-y-3">
        {leaderboard.map((entry) => {
          const trend = getTrendIcon(entry.trend)
          return (
            <div
              key={entry.staff_id}
              onClick={() => handleStaffClick(entry.staff_id)}
              className="flex items-center gap-4 p-3 bg-gray-700/50 rounded-lg hover:bg-gray-700 cursor-pointer transition-colors"
            >
              {/* Rank */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                entry.rank === 1 ? 'bg-yellow-500 text-yellow-900' :
                entry.rank === 2 ? 'bg-gray-400 text-gray-900' :
                entry.rank === 3 ? 'bg-amber-600 text-amber-900' :
                'bg-gray-600 text-gray-300'
              }`}>
                {entry.rank}
              </div>

              {/* Avatar */}
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-medium">
                {entry.name.charAt(0)}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white truncate">{entry.name}</span>
                  <svg className={`w-4 h-4 ${trend.color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={trend.icon} />
                  </svg>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <span className="capitalize">{entry.role}</span>
                  {entry.streak_days > 0 && (
                    <span className="text-orange-400 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
                      </svg>
                      {entry.streak_days}
                    </span>
                  )}
                </div>
              </div>

              {/* Score */}
              <div className="text-right">
                <div className="text-lg font-bold text-white">{entry.score.toFixed(0)}</div>
                <div className="text-xs text-gray-400">score</div>
              </div>

              {/* Badges */}
              <div className="flex -space-x-1">
                {entry.badges.slice(0, 3).map((badge, i) => (
                  <div
                    key={i}
                    className="w-6 h-6 bg-blue-500/20 rounded-full flex items-center justify-center border border-gray-600"
                    title={badge}
                  >
                    <svg className="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={getBadgeIcon(badge)} />
                    </svg>
                  </div>
                ))}
                {entry.badges.length > 3 && (
                  <div className="w-6 h-6 bg-gray-600 rounded-full flex items-center justify-center text-xs text-gray-300 border border-gray-500">
                    +{entry.badges.length - 3}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const renderTeamSummary = () => {
    if (!teamSummary) return null

    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Active Staff</p>
          <p className="text-2xl font-bold text-white">{teamSummary.active_staff}/{teamSummary.total_staff}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Avg Response</p>
          <p className="text-2xl font-bold text-white">{teamSummary.avg_response_time}s</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Tables Served</p>
          <p className="text-2xl font-bold text-white">{teamSummary.total_tables_served}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Badges Earned</p>
          <p className="text-2xl font-bold text-white">{teamSummary.badges_earned_this_period}</p>
        </div>
      </div>
    )
  }

  const renderTopPerformers = () => {
    if (!teamSummary) return null

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gradient-to-r from-yellow-500/20 to-amber-500/20 rounded-lg p-4 border border-yellow-500/30">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-yellow-500/30 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            <div>
              <p className="text-yellow-400 text-sm font-medium">Top Performer</p>
              <p className="text-white font-bold">{teamSummary.top_performer.name}</p>
              <p className="text-gray-400 text-sm">Score: {teamSummary.top_performer.score.toFixed(1)}</p>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-lg p-4 border border-green-500/30">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-500/30 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div>
              <p className="text-green-400 text-sm font-medium">Most Improved</p>
              <p className="text-white font-bold">{teamSummary.most_improved.name}</p>
              <p className="text-gray-400 text-sm">+{teamSummary.most_improved.improvement_percent.toFixed(1)}%</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderScorecard = () => {
    if (scorecardLoading) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      )
    }

    if (!selectedScorecard) return null

    return (
      <div className="space-y-6">
        {/* Back button */}
        <button
          onClick={() => navigate('/scorecards')}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Leaderboard
        </button>

        {/* Profile Header */}
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-3xl font-bold text-white">
              {selectedScorecard.name.charAt(0)}
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white">{selectedScorecard.name}</h2>
              <p className="text-gray-400 capitalize">{selectedScorecard.role}</p>
              <div className="flex items-center gap-4 mt-2">
                <span className="text-sm text-gray-400">
                  Rank: <span className="text-white font-medium">#{selectedScorecard.rank}</span> of {selectedScorecard.total_staff}
                </span>
                {selectedScorecard.streak_days > 0 && (
                  <span className="flex items-center gap-1 text-orange-400">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
                    </svg>
                    {selectedScorecard.streak_days} day streak
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {staffBadges.slice(0, 5).map((badge) => (
                <div
                  key={badge.id}
                  className="flex items-center gap-2 px-3 py-1 bg-blue-500/20 rounded-full border border-blue-500/30"
                  title={badge.description}
                >
                  <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={getBadgeIcon(badge.name)} />
                  </svg>
                  <span className="text-sm text-blue-400">{badge.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Current Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Response Time</p>
            <p className="text-2xl font-bold text-white">{selectedScorecard.current_metrics.avg_response_time}s</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Tables/Hour</p>
            <p className="text-2xl font-bold text-white">{selectedScorecard.current_metrics.tables_served_per_hour}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Floor Time</p>
            <p className="text-2xl font-bold text-white">{selectedScorecard.current_metrics.floor_time_percent}%</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Idle Time</p>
            <p className="text-2xl font-bold text-white">{selectedScorecard.current_metrics.idle_time_percent}%</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Interactions</p>
            <p className="text-2xl font-bold text-white">{selectedScorecard.current_metrics.customer_interactions}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Zones Covered</p>
            <p className="text-2xl font-bold text-white">{selectedScorecard.current_metrics.zones_covered.length}</p>
          </div>
        </div>

        {/* Trends */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Performance Trends</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {selectedScorecard.trends.map((trend) => (
              <div key={trend.metric} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">{trend.metric}</span>
                  <span className={`text-sm font-medium ${getTrendColor(trend.trend)}`}>
                    {trend.change_percent >= 0 ? '+' : ''}{trend.change_percent}%
                  </span>
                </div>
                <div className="h-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trend.data_points}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="date" tick={false} axisLine={false} />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                        labelStyle={{ color: '#9ca3af' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={trend.trend === 'improving' ? '#10b981' : trend.trend === 'declining' ? '#ef4444' : '#6b7280'}
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Team Comparisons */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Comparison to Team Average</h3>
          <div className="space-y-4">
            {selectedScorecard.team_comparisons.map((comp) => (
              <div key={comp.metric} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">{comp.metric}</span>
                  <span className="text-white">
                    {comp.staff_value} (Team: {comp.team_average})
                  </span>
                </div>
                <div className="relative h-4 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="absolute h-full bg-blue-500/30 rounded-full"
                    style={{ width: `${comp.percentile}%` }}
                  />
                  <div
                    className="absolute h-full w-1 bg-white"
                    style={{ left: `${comp.percentile}%` }}
                  />
                </div>
                <div className="text-xs text-gray-500">
                  {comp.percentile}th percentile
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Weekly Summaries */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Weekly Summaries</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                  <th className="pb-3 font-medium">Week</th>
                  <th className="pb-3 font-medium text-center">Hours</th>
                  <th className="pb-3 font-medium text-center">Tables</th>
                  <th className="pb-3 font-medium text-center">Customers</th>
                  <th className="pb-3 font-medium text-center">Response</th>
                  <th className="pb-3 font-medium text-center">Floor %</th>
                </tr>
              </thead>
              <tbody className="text-gray-300">
                {selectedScorecard.weekly_summaries.map((week, i) => (
                  <tr key={i} className="border-b border-gray-700/50">
                    <td className="py-3 text-white">
                      {new Date(week.week_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} -{' '}
                      {new Date(week.week_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="py-3 text-center">{week.total_hours}h</td>
                    <td className="py-3 text-center">{week.tables_served}</td>
                    <td className="py-3 text-center">{week.customers_served}</td>
                    <td className="py-3 text-center">{week.avg_response_time}s</td>
                    <td className="py-3 text-center">{week.floor_time_percent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Zones Covered */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Zones Covered</h3>
          <div className="flex flex-wrap gap-2">
            {selectedScorecard.current_metrics.zones_covered.map((zone) => (
              <span key={zone} className="px-3 py-1 bg-gray-700 text-gray-300 rounded-full text-sm">
                {zone}
              </span>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Staff Scorecards</h1>
          <p className="text-gray-400 mt-1">Individual performance metrics and team leaderboard</p>
        </div>
        {!staffId && (
          <div className="flex gap-2">
            <button
              onClick={() => setPeriod('week')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                period === 'week'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              This Week
            </button>
            <button
              onClick={() => setPeriod('month')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                period === 'month'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              This Month
            </button>
          </div>
        )}
      </div>

      {staffId ? (
        renderScorecard()
      ) : (
        <>
          {/* Team Summary */}
          {renderTeamSummary()}

          {/* Top Performers */}
          {renderTopPerformers()}

          {/* Leaderboard */}
          {renderLeaderboard()}
        </>
      )}
    </div>
  )
}
