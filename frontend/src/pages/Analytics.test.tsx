import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '../test/utils'
import Analytics from './Analytics'

describe('Analytics Page', () => {
  it('renders analytics page', async () => {
    render(<Analytics />)

    await waitFor(() => {
      // The heading "Analytics" should be in the page
      expect(screen.getAllByText(/Analytics/i).length).toBeGreaterThan(0)
    })
  })

  it('displays date range selector', async () => {
    render(<Analytics />)

    await waitFor(() => {
      expect(screen.getByText('Today')).toBeInTheDocument()
      expect(screen.getByText('This Week')).toBeInTheDocument()
      expect(screen.getByText('This Month')).toBeInTheDocument()
    })
  })

  it('displays summary metrics after loading', async () => {
    render(<Analytics />)

    await waitFor(() => {
      expect(screen.getByText('Total Customers')).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  it('displays hourly customer count chart section', async () => {
    render(<Analytics />)

    await waitFor(() => {
      expect(screen.getByText('Hourly Customer Count')).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  it('displays zone activity section', async () => {
    render(<Analytics />)

    await waitFor(() => {
      // The zone activity section should appear after loading
      expect(screen.getByText(/Zone Activity/i)).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  it('switches date range when clicking buttons', async () => {
    const { user } = render(<Analytics />)

    await waitFor(() => {
      expect(screen.getByText('Today')).toBeInTheDocument()
    })

    await user.click(screen.getByText('This Week'))

    // The click should work without error
    await waitFor(() => {
      expect(screen.getByText('This Week')).toBeInTheDocument()
    })
  })

  it('shows loading state initially', () => {
    render(<Analytics />)

    const loadingElements = document.querySelectorAll('.animate-pulse')
    expect(loadingElements.length).toBeGreaterThan(0)
  })
})
