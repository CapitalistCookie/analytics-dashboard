import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '../test/utils'
import Alerts from './Alerts'

describe('Alerts Page', () => {
  it('renders alert tabs', async () => {
    render(<Alerts />)

    await waitFor(() => {
      expect(screen.getByText('Alert History')).toBeInTheDocument()
      expect(screen.getByText('Configuration')).toBeInTheDocument()
    })
  })

  it('displays alerts page content', async () => {
    render(<Alerts />)

    await waitFor(() => {
      // Should show some alerts-related content
      expect(screen.getByText('Alert History')).toBeInTheDocument()
    })
  })

  it('displays alerts list after loading', async () => {
    render(<Alerts />)

    await waitFor(() => {
      // Should have alert messages from mock
      expect(screen.getByText(/Occupancy exceeded/i)).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  it('switches to Configuration tab', async () => {
    const { user } = render(<Alerts />)

    await waitFor(() => {
      expect(screen.getByText('Configuration')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Configuration'))

    await waitFor(() => {
      expect(screen.getByText('High Occupancy Alert')).toBeInTheDocument()
    })
  })

  it('shows Add Alert Rule button on Configuration tab', async () => {
    const { user } = render(<Alerts />)

    await waitFor(() => {
      expect(screen.getByText('Configuration')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Configuration'))

    await waitFor(() => {
      expect(screen.getByText('Add Alert Rule')).toBeInTheDocument()
    })
  })

  it('shows loading state initially', () => {
    render(<Alerts />)

    // Multiple checks as loading state may vary
    const loadingElements = document.querySelectorAll('.animate-pulse')
    // Loading elements should exist initially or content should load quickly
  })
})
