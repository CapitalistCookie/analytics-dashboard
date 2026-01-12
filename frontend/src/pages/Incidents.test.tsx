import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '../test/utils'
import Incidents from './Incidents'

describe('Incidents Page', () => {
  it('renders incidents page', async () => {
    render(<Incidents />)

    // Should render the page with some content
    await waitFor(() => {
      expect(screen.getByText('Log Incident')).toBeInTheDocument()
    })
  })

  it('displays Log Incident button', async () => {
    render(<Incidents />)

    await waitFor(() => {
      expect(screen.getByText('Log Incident')).toBeInTheDocument()
    })
  })

  it('displays incident list after loading', async () => {
    render(<Incidents />)

    await waitFor(() => {
      expect(screen.getByText(/Customer Complaint/i)).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  it('opens create incident modal when clicking Log Incident', async () => {
    const { user } = render(<Incidents />)

    await waitFor(() => {
      expect(screen.getByText('Log Incident')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Log Incident'))

    await waitFor(() => {
      expect(screen.getByText(/Log New Incident/i)).toBeInTheDocument()
    })
  })
})
