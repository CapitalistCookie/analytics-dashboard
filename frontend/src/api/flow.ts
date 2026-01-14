/**
 * Flow Analysis API Client
 *
 * Provides endpoints for:
 * - Bottleneck detection
 * - Transition analysis
 * - Common path analysis
 * - Traffic heatmaps
 * - Staffing recommendations
 * - Flow efficiency scoring
 */

import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

// Types
export interface BottleneckData {
  zone: string
  visits: number
  avg_dwell_minutes: number
  bottleneck_score: number
  severity: 'low' | 'medium' | 'high'
}

export interface TransitionMatrix {
  matrix: Record<string, Record<string, number>>
  total_transitions: number
  period_hours: number
}

export interface CommonPath {
  path: string
  count: number
  zones: string[]
}

export interface HeatmapPoint {
  zone: string
  hour: number
  count: number
}

export interface HeatmapData {
  data: HeatmapPoint[]
  zones: string[]
  period_days: number
}

export interface StaffingRecommendation {
  zone: string
  peak_hours: number[]
  avg_peak_traffic: number
  priority: number
  recommendation: string
}

export interface FlowScoreFactors {
  avg_bottleneck_score: number
  high_severity_zones: number
  total_zones_analyzed: number
}

export interface FlowScore {
  score: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  factors: FlowScoreFactors
  period_hours: number
}

export interface FlowSummary {
  score: FlowScore
  bottlenecks: BottleneckData[]
  top_paths: CommonPath[]
  staffing: StaffingRecommendation[]
}

// API Functions
export const getFlowSummary = () =>
  api.get<FlowSummary>('/flow/summary')

export const getBottlenecks = (hours = 24) =>
  api.get<BottleneckData[]>(`/flow/bottlenecks?hours=${hours}`)

export const getTransitions = (hours = 24) =>
  api.get<TransitionMatrix>(`/flow/transitions?hours=${hours}`)

export const getCommonPaths = (hours = 24, minCount = 2) =>
  api.get<CommonPath[]>(`/flow/paths?hours=${hours}&min_count=${minCount}`)

export const getHeatmap = (days = 7) =>
  api.get<HeatmapData>(`/flow/heatmap?days=${days}`)

export const getStaffingRecommendations = (hours = 168) =>
  api.get<StaffingRecommendation[]>(`/flow/staffing?hours=${hours}`)

export const getFlowScore = (hours = 24) =>
  api.get<FlowScore>(`/flow/score?hours=${hours}`)

export const getAdjacencyMap = () =>
  api.get<Record<string, string[]>>('/flow/adjacency')
