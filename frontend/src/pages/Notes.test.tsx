import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '../test/utils'
import Notes from './Notes'

describe('Notes Page', () => {
  it('renders shift notes page', async () => {
    render(<Notes />)

    await waitFor(() => {
      expect(screen.getByText('Add Note')).toBeInTheDocument()
    })
  })

  it('displays Add Note button', async () => {
    render(<Notes />)

    await waitFor(() => {
      expect(screen.getByText('Add Note')).toBeInTheDocument()
    })
  })

  it('displays notes after loading', async () => {
    render(<Notes />)

    await waitFor(() => {
      expect(screen.getByText(/Table 8 requested no onions/i)).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  it('shows tab options', async () => {
    render(<Notes />)

    await waitFor(() => {
      expect(screen.getByText('Current Shift')).toBeInTheDocument()
      expect(screen.getByText('All Notes')).toBeInTheDocument()
    })
  })

  it('opens create note modal when clicking Add Note', async () => {
    const { user } = render(<Notes />)

    await waitFor(() => {
      expect(screen.getByText('Add Note')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Add Note'))

    await waitFor(() => {
      expect(screen.getByText(/Add Shift Note/i)).toBeInTheDocument()
    })
  })
})
