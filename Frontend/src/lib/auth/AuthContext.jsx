import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { dashboardPathForRole } from '../constants/roles'
import { findDemoAccount } from '../../mocks/demoAccounts'
import { loadSession, saveSession } from './storage'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const navigate = useNavigate()
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
            'Invalid credentials (demo). Use a demo account from the login page.',
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

  const register = useCallback(async () => {
    setAuthNotice(
      'Registration UI only — backend `/api/auth/register` is not connected on this branch.',
    )
    return {
      ok: false,
      message:
        'Registration is not connected to the backend yet. Use demo login accounts.',
    }
  }, [])

  const requestPasswordReset = useCallback(async () => ({
    ok: true,
    message:
      'If an account exists, reset instructions would be sent (demo — endpoint unverified).',
  }), [])

  const resetPassword = useCallback(async () => ({
    ok: true,
    message: 'Password reset submitted (demo — endpoint unverified).',
  }), [])

  const setPassword = useCallback(async () => ({
    ok: true,
    message: 'Password set submitted (demo — endpoint unverified).',
  }), [])

  const confirmEmail = useCallback(async () => ({
    ok: true,
    message: 'Email confirmation simulated (demo — endpoint unverified).',
  }), [])

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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
