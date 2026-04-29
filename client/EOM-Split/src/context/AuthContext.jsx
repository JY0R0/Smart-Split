import React, { createContext, useContext, useMemo, useState } from 'react'
import { clearSession, getStoredUser, getToken, saveSession } from '../services/authStorage'
import apiClient from '../services/apiClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getStoredUser())
  const [token, setToken] = useState(getToken())

  const isAuthenticated = Boolean(token)

  async function login({ email, password }) {
    const { data: payload } = await apiClient.post('/auth/login', { email, password })

    saveSession({ token: payload.token, user: payload.user })
    setToken(payload.token)
    setUser(payload.user)

    return payload
  }

  async function register({ name, email, password }) {
    const { data: payload } = await apiClient.post('/auth/register', {
      name,
      email,
      password,
    })

    saveSession({ token: payload.token, user: payload.user })
    setToken(payload.token)
    setUser(payload.user)

    return payload
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
