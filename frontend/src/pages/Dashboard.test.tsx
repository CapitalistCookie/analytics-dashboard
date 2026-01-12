import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '../test/utils'
import Dashboard from './Dashboard'

describe('Dashboard', () => {
  it('renders all main sections', async () => {
    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.getByText('Current Occupancy')).toBeInTheDocument()
    }, { timeout: 5000 })

    expect(screen.getByText('System Stats')).toBeInTheDocument()
    expect(screen.getByText('Recent Detections')).toBeInTheDocument()
    expect(screen.getByText('Occupancy Trend (24h)')).toBeInTheDocument()
  })

  it('displays occupancy data', async () => {
    render(<Dashboard />)

    await waitFor(() => {
      // From mock data: total_count: 42
      expect(screen.getByText('42')).toBeInTheDocument()
    }, { timeout: 5000 })

    expect(screen.getByText('Total People')).toBeInTheDocument()
  })

  it('displays system stats section', async () => {
    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.getByText('Online Cameras')).toBeInTheDocument()
    }, { timeout: 5000 })

    expect(screen.getByText('Detections Today')).toBeInTheDocument()
    expect(screen.getByText('Avg Camera FPS')).toBeInTheDocument()
  })

  it('displays camera grid heading', async () => {
    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.getByText(/Camera Grid/)).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  it('displays recent detections section', async () => {
    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.getByText('Recent Detections')).toBeInTheDocument()
    })
  })

  it('shows loading state initially', () => {
    render(<Dashboard />)

    const loadingElements = document.querySelectorAll('.animate-pulse')
    expect(loadingElements.length).toBeGreaterThan(0)
  })
})
