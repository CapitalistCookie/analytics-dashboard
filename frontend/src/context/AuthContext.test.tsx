import { describe, it, expect, beforeEach } from 'vitest'
import { renderWithAuth, screen, waitFor, clearAuthState } from '../test/utils'
import { useAuth } from './AuthContext'

// Test component that uses the auth context
function TestComponent() {
  const { user, isAuthenticated, isLoading, error } = useAuth()

  return (
    <div>
      <div data-testid="loading">{isLoading ? 'Loading...' : 'Not loading'}</div>
      <div data-testid="authenticated">{isAuthenticated ? 'Authenticated' : 'Not authenticated'}</div>
      <div data-testid="user">{user?.username || 'No user'}</div>
      <div data-testid="error">{error || 'No error'}</div>
    </div>
  )
}

describe('AuthContext', () => {
  beforeEach(() => {
    clearAuthState()
  })

  it('provides auth context to children', async () => {
    renderWithAuth(<TestComponent />)

    // Should render without error
    expect(screen.getByTestId('loading')).toBeInTheDocument()
    expect(screen.getByTestId('authenticated')).toBeInTheDocument()
    expect(screen.getByTestId('user')).toBeInTheDocument()
    expect(screen.getByTestId('error')).toBeInTheDocument()
  })

  it('shows unauthenticated state by default', async () => {
    renderWithAuth(<TestComponent />)

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('Not authenticated')
    }, { timeout: 5000 })
  })

  it('shows no error by default', async () => {
    renderWithAuth(<TestComponent />)

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('No error')
    })
  })
})
