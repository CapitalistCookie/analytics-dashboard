import { useState, useEffect, useCallback } from 'react'
import {
  getEntryExitCurrent,
  getEntryExitHourly,
  getEntryExitStats,
  type EntryExitCurrent,
  type EntryExitHourly,
  type EntryExitStats,
} from '../api/client'

export function useCurrentOccupancy(refreshInterval = 5000) {
  const [data, setData] = useState<EntryExitCurrent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await getEntryExitCurrent()
      setData(res.data)
      setError(null)
    } catch (err) {
      console.error('Failed to fetch current occupancy:', err)
      setError('Failed to load occupancy data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()

    if (refreshInterval) {
      const interval = setInterval(fetchData, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [fetchData, refreshInterval])

  return { data, loading, error, refetch: fetchData }
}

export function useHourlyTraffic(date?: string) {
  const [data, setData] = useState<EntryExitHourly | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await getEntryExitHourly(date)
      setData(res.data)
      setError(null)
    } catch (err) {
      console.error('Failed to fetch hourly traffic:', err)
      setError('Failed to load hourly data')
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { data, loading, error, refetch: fetchData }
}

export function useDetectorStats(refreshInterval = 30000) {
  const [data, setData] = useState<EntryExitStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await getEntryExitStats()
      setData(res.data)
      setError(null)
    } catch (err) {
      console.error('Failed to fetch detector stats:', err)
      setError('Failed to load detector stats')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()

    if (refreshInterval) {
      const interval = setInterval(fetchData, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [fetchData, refreshInterval])

  return { data, loading, error, refetch: fetchData }
}
