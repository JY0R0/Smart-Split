import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { clearSession, getStoredUser, getToken, saveSession } from '../services/authStorage'
import apiClient from '../services/apiClient'

const AuthContext = createContext(null)

function withRole(user) {
  if (!user) {
    return null
  }

  return {
    ...user,
    role: user.role || 'user',
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(withRole(getStoredUser()))
  const [token, setToken] = useState(getToken())

  const isAuthenticated = Boolean(token)

  useEffect(() => {
    async function hydrateRole() {
      if (!token || !user || user.role) {
        return
      }

      try {
        const { data } = await apiClient.get('/protected')
        const nextUser = withRole({ ...user, role: data?.user?.role })
        saveSession({ token, user: nextUser })
        setUser(nextUser)
      } catch {
        // Keep existing session state if profile hydration fails.
      }
    }

    hydrateRole()
  }, [token, user])

  async function login({ email, password }) {
    const { data: payload } = await apiClient.post('/auth/login', { email, password })
    const nextUser = withRole(payload.user)

    saveSession({ token: payload.token, user: nextUser })
    setToken(payload.token)
    setUser(nextUser)

    return {
      ...payload,
      user: nextUser,
    }
  }

  async function register({ name, email, password }) {
    const { data: payload } = await apiClient.post('/auth/register', {
      name,
      email,
      password,
    })
    const nextUser = withRole(payload.user)

    saveSession({ token: payload.token, user: nextUser })
    setToken(payload.token)
    setUser(nextUser)

    return {
      ...payload,
      user: nextUser,
    }
  }

  function logout() {
    clearSession()
    setToken(null)
    setUser(null)
  }

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated,
      login,
      register,
      logout,
    }),
    [user, token, isAuthenticated]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return context
}
