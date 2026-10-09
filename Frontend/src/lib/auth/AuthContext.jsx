import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { dashboardPathForRole } from '../constants/roles'
import { useRouter } from '../router/RouterContext'
import { findDemoAccount } from '../../mocks/demoAccounts'
import { loadSession, saveSession } from './storage'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const { navigate } = useRouter()
  const [user, setUser] = useState(() => loadSession()?.user ?? null)
  const [authNotice, setAuthNotice] = useState(null)

  const login = useCallback(
    async ({ email, password }) => {
      setAuthNotice(null)
      const account = findDemoAccount(email, password)
      if (!account) {
        return {
          ok: false,
          message:
            'Invalid credentials (mock). Use a demo account from the login page.',
        }
      }
      const sessionUser = {
        id: account.id,
        email: account.email,
        fullName: account.fullName,
        role: account.role,
        patientId: account.patientId ?? null,
      }
      saveSession({ user: sessionUser, mock: true })
      setUser(sessionUser)
      navigate(dashboardPathForRole(sessionUser.role), { replace: true })
      return { ok: true }
    },
    [navigate],
  )

  const logout = useCallback(() => {
    saveSession(null)
    setUser(null)
    navigate('/login', { replace: true })
  }, [navigate])

  const register = useCallback(async (_payload) => {
    setAuthNotice(
      'Registration UI only — `/api/auth/register` is not verified on this branch.',
    )
    return {
      ok: false,
      message:
        'Registration is not connected to the backend yet. Use demo login accounts.',
    }
  }, [])

  const requestPasswordReset = useCallback(async () => {
    return {
      ok: true,
      message:
        'If an account exists, reset instructions would be sent (mock — `/api/auth/forgot-password` unverified).',
    }
  }, [])

  const resetPassword = useCallback(async () => {
    return {
      ok: true,
      message:
        'Password reset submitted (mock — `/api/auth/reset-password` unverified).',
    }
  }, [])

  const setPassword = useCallback(async () => {
    return {
      ok: true,
      message:
        'Password set submitted (mock — `/api/auth/set-password` unverified).',
    }
  }, [])

  const confirmEmail = useCallback(async () => {
    return {
      ok: true,
      message:
        'Email confirmation simulated (mock — `/api/auth/confirm-email` unverified).',
    }
  }, [])

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      login,
      logout,
      register,
      requestPasswordReset,
      resetPassword,
      setPassword,
      confirmEmail,
      authNotice,
      setAuthNotice,
      isMockAuth: true,
    }),
    [
      user,
      login,
      logout,
      register,
      requestPasswordReset,
      resetPassword,
      setPassword,
      confirmEmail,
      authNotice,
    ],
  )

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
