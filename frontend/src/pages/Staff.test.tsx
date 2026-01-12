import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '../test/utils'
import Staff from './Staff'

describe('Staff Page', () => {
  it('renders staff management heading', async () => {
    render(<Staff />)

    await waitFor(() => {
      expect(screen.getByText('Staff Management')).toBeInTheDocument()
    })
  })

  it('shows staff count', async () => {
    render(<Staff />)

    await waitFor(() => {
      // From mock data: 3 staff members
      expect(screen.getByText('3 staff members')).toBeInTheDocument()
    })
  })

  it('renders Add Staff Member button', async () => {
    render(<Staff />)

    await waitFor(() => {
      expect(screen.getByText('Add Staff Member')).toBeInTheDocument()
    })
  })

  it('displays staff table with columns', async () => {
    render(<Staff />)

    await waitFor(() => {
      expect(screen.getByText('Staff Member')).toBeInTheDocument()
      expect(screen.getByText('Role')).toBeInTheDocument()
      expect(screen.getByText('Face Training')).toBeInTheDocument()
      expect(screen.getByText('Status')).toBeInTheDocument()
      expect(screen.getByText('Actions')).toBeInTheDocument()
    })
  })

  it('displays staff member names', async () => {
    render(<Staff />)

    await waitFor(() => {
      expect(screen.getByText('John Smith')).toBeInTheDocument()
      expect(screen.getByText('Jane Doe')).toBeInTheDocument()
      expect(screen.getByText('Bob Wilson')).toBeInTheDocument()
    })
  })

  it('displays staff roles', async () => {
    render(<Staff />)

    await waitFor(() => {
      expect(screen.getByText('Server')).toBeInTheDocument()
      expect(screen.getByText('Manager')).toBeInTheDocument()
      expect(screen.getByText('Bartender')).toBeInTheDocument()
    })
  })

  it('displays badge IDs', async () => {
    render(<Staff />)

    await waitFor(() => {
      expect(screen.getByText('EMP001')).toBeInTheDocument()
      expect(screen.getByText('EMP002')).toBeInTheDocument()
      expect(screen.getByText('EMP003')).toBeInTheDocument()
    })
  })

  it('shows active/inactive status badges', async () => {
    render(<Staff />)

    await waitFor(() => {
      // From mock data: John and Jane are active, Bob is inactive
      const activeBadges = screen.getAllByText('Active')
      expect(activeBadges.length).toBe(2)
      expect(screen.getByText('Inactive')).toBeInTheDocument()
    })
  })

  it('shows staff details when clicking on a row', async () => {
    const { user } = render(<Staff />)

    await waitFor(() => {
      expect(screen.getByText('John Smith')).toBeInTheDocument()
    })

    await user.click(screen.getByText('John Smith'))

    await waitFor(() => {
      expect(screen.getByText('Staff Details')).toBeInTheDocument()
    })
  })

  it('displays edit button for each staff member', async () => {
    render(<Staff />)

    await waitFor(() => {
      const editButtons = screen.getAllByTitle('Edit')
      expect(editButtons.length).toBe(3)
    })
  })
})
