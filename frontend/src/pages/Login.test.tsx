import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, clearAuthState } from '../test/utils'
import Login from './Login'

describe('Login Page', () => {
  beforeEach(() => {
    clearAuthState()
  })

  it('renders login form by default', () => {
    render(<Login />)

    expect(screen.getByText('Restaurant Analytics')).toBeInTheDocument()
    expect(screen.getByText('Sign in to your account')).toBeInTheDocument()
    expect(screen.getByLabelText(/Username or Email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sign In/i })).toBeInTheDocument()
  })

  it('shows register form when clicking "Create one"', async () => {
    const { user } = render(<Login />)

    await user.click(screen.getByText('Create one'))

    expect(screen.getByText('Create your account')).toBeInTheDocument()
    expect(screen.getByLabelText(/Email \(optional\)/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Confirm Password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Create Account/i })).toBeInTheDocument()
  })

  it('switches back to login form', async () => {
    const { user } = render(<Login />)

    // Switch to register
    await user.click(screen.getByText('Create one'))
    expect(screen.getByText('Create your account')).toBeInTheDocument()

    // Switch back to login
    await user.click(screen.getByText('Sign in'))
    expect(screen.getByText('Sign in to your account')).toBeInTheDocument()
  })

  it('shows error for empty username', async () => {
    const { user } = render(<Login />)

    const submitButton = screen.getByRole('button', { name: /Sign In/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('Username and password are required')).toBeInTheDocument()
    })
  })

  it('shows error for empty password', async () => {
    const { user } = render(<Login />)

    await user.type(screen.getByLabelText(/Username or Email/i), 'testuser')
    await user.click(screen.getByRole('button', { name: /Sign In/i }))

    await waitFor(() => {
      expect(screen.getByText('Username and password are required')).toBeInTheDocument()
    })
  })

  it('allows typing in username field', async () => {
    const { user } = render(<Login />)

    const usernameInput = screen.getByLabelText(/Username or Email/i)
    await user.type(usernameInput, 'testuser')

    expect(usernameInput).toHaveValue('testuser')
  })

  it('allows typing in password field', async () => {
    const { user } = render(<Login />)

    const passwordInput = screen.getByLabelText(/Password/i)
    await user.type(passwordInput, 'testpassword')

    expect(passwordInput).toHaveValue('testpassword')
  })

  it('has password field with type password', () => {
    render(<Login />)

    const passwordInput = screen.getByLabelText(/Password/i)
    expect(passwordInput).toHaveAttribute('type', 'password')
  })

  it('renders logo icon', () => {
    render(<Login />)

    // Should have the analytics icon
    const svgElements = document.querySelectorAll('svg')
    expect(svgElements.length).toBeGreaterThan(0)
  })
})

describe('Login Page - Registration', () => {
  beforeEach(() => {
    clearAuthState()
  })

  it('shows email field in register mode', async () => {
    const { user } = render(<Login />)

    await user.click(screen.getByText('Create one'))

    expect(screen.getByLabelText(/Email \(optional\)/i)).toBeInTheDocument()
  })

  it('shows confirm password field in register mode', async () => {
    const { user } = render(<Login />)

    await user.click(screen.getByText('Create one'))

    expect(screen.getByLabelText(/Confirm Password/i)).toBeInTheDocument()
  })

  it('shows error when passwords do not match', async () => {
    const { user } = render(<Login />)

    await user.click(screen.getByText('Create one'))

    await user.type(screen.getByLabelText(/Username or Email/i), 'newuser')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.type(screen.getByLabelText(/Confirm Password/i), 'different')

    await user.click(screen.getByRole('button', { name: /Create Account/i }))

    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
    })
  })

  it('shows error when password is too short', async () => {
    const { user } = render(<Login />)

    await user.click(screen.getByText('Create one'))

    await user.type(screen.getByLabelText(/Username or Email/i), 'newuser')
    await user.type(screen.getByLabelText('Password'), '123')
    await user.type(screen.getByLabelText(/Confirm Password/i), '123')

    await user.click(screen.getByRole('button', { name: /Create Account/i }))

    await waitFor(() => {
      expect(screen.getByText('Password must be at least 6 characters')).toBeInTheDocument()
    })
  })

  it('allows typing in email field', async () => {
    const { user } = render(<Login />)

    await user.click(screen.getByText('Create one'))

    const emailInput = screen.getByLabelText(/Email \(optional\)/i)
    await user.type(emailInput, 'test@example.com')

    expect(emailInput).toHaveValue('test@example.com')
  })

  it('clears error when switching modes', async () => {
    const { user } = render(<Login />)

    // Trigger an error
    await user.click(screen.getByRole('button', { name: /Sign In/i }))
    await waitFor(() => {
      expect(screen.getByText('Username and password are required')).toBeInTheDocument()
    })

    // Switch to register mode
    await user.click(screen.getByText('Create one'))

    // Error should be cleared
    expect(screen.queryByText('Username and password are required')).not.toBeInTheDocument()
  })
})

describe('Login Page - Form Validation', () => {
  beforeEach(() => {
    clearAuthState()
  })

  it('validates required fields before submission', async () => {
    const { user } = render(<Login />)

    await user.click(screen.getByRole('button', { name: /Sign In/i }))

    await waitFor(() => {
      expect(screen.getByText('Username and password are required')).toBeInTheDocument()
    })
  })

  it('trims whitespace from username', async () => {
    const { user } = render(<Login />)

    await user.type(screen.getByLabelText(/Username or Email/i), '   ')
    await user.type(screen.getByLabelText(/Password/i), 'password')
    await user.click(screen.getByRole('button', { name: /Sign In/i }))

    await waitFor(() => {
      expect(screen.getByText('Username and password are required')).toBeInTheDocument()
    })
  })

  it('trims whitespace from password', async () => {
    const { user } = render(<Login />)

    await user.type(screen.getByLabelText(/Username or Email/i), 'testuser')
    await user.type(screen.getByLabelText(/Password/i), '   ')
    await user.click(screen.getByRole('button', { name: /Sign In/i }))

    await waitFor(() => {
      expect(screen.getByText('Username and password are required')).toBeInTheDocument()
    })
  })
})

describe('Login Page - Successful Login', () => {
  beforeEach(() => {
    clearAuthState()
  })

  it('submits form with valid credentials', async () => {
    const { user } = render(<Login />)

    await user.type(screen.getByLabelText(/Username or Email/i), 'admin')
    await user.type(screen.getByLabelText(/Password/i), 'password')
    await user.click(screen.getByRole('button', { name: /Sign In/i }))

    // After successful login, there should be no error shown
    await waitFor(() => {
      expect(screen.queryByText(/Invalid credentials/i)).not.toBeInTheDocument()
    })
  })
})
