import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import apiClient from '../services/apiClient'

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const googleTokenClientRef = useRef(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleLogin(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const payload = await login({ email, password })
      const target = payload?.user?.role === 'admin' ? '/admin' : '/dashboard'
      navigate(target, { replace: true })
    } catch (loginError) {
      setError(loginError?.response?.data?.message || loginError.message || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleSignIn(idToken) {
    setGoogleLoading(true)
    setError('')
    try {
      const { data: payload } = await apiClient.post('/auth/google/callback', { idToken })
      login.__saveSession(payload)
      const target = payload?.user?.role === 'admin' ? '/admin' : '/dashboard'
      navigate(target, { replace: true })
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Google sign-in failed.')
    } finally {
      setGoogleLoading(false)
    }
  }

  async function handleGooglePopupClick() {
    const tokenClient = googleTokenClientRef.current
    if (!tokenClient) {
      setError('Google Sign-In is not ready yet. Please try again in a moment.')
      return
    }

    setGoogleLoading(true)
    setError('')
    try {
      tokenClient.requestAccessToken()
    } catch (err) {
      setGoogleLoading(false)
      setError(err?.message || 'Google Sign-In failed to start.')
    }
  }

  // Initialize Google OAuth popup flow (poll until SDK loads)
  useEffect(() => {
    let mounted = true
    let attempts = 0
    const maxAttempts = 20
    const intervalMs = 500

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
    if (!clientId) {
      console.warn('VITE_GOOGLE_CLIENT_ID is not set')
      return
    }

    function tryInit() {
      if (!mounted) return
      if (window.google && window.google.accounts && window.google.accounts.oauth2) {
        try {
          googleTokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: 'openid email profile',
            callback: async (response) => {
              if (!response?.access_token) {
                setGoogleLoading(false)
                setError('Google did not return an access token.')
                return
              }

              try {
                const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                  headers: {
                    Authorization: `Bearer ${response.access_token}`,
                  },
                })

                if (!profileResponse.ok) {
                  throw new Error('Unable to read Google profile.')
                }

                const profile = await profileResponse.json()
                const { data: payload } = await apiClient.post('/auth/google/callback', { profile })
                login.__saveSession(payload)
                const target = payload?.user?.role === 'admin' ? '/admin' : '/dashboard'
                navigate(target, { replace: true })
              } catch (err) {
                setError(err?.response?.data?.message || err.message || 'Google sign-in failed.')
              } finally {
                setGoogleLoading(false)
              }
            },
          })
        } catch (err) {
          console.error('Failed to initialize Google Sign-In', err)
        }
        return
      }

      attempts += 1
      if (attempts < maxAttempts) {
        setTimeout(tryInit, intervalMs)
      } else {
        console.warn('Google Sign-In SDK not available after polling')
      }
    }

    tryInit()

    return () => {
      mounted = false
      googleTokenClientRef.current = null
    }
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--bg) px-4 py-12">
      {/* Decorative gradient blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-teal-400/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-indigo-400/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-linear-to-br from-teal-600 to-emerald-400 text-xl font-bold text-white shadow-lg shadow-teal-500/25">
            S
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Sign In</h1>
          <p className="mt-1 text-sm text-slate-500">Welcome back to Smart Split</p>
        </div>

        {/* Card */}
        <div className="rounded-3xl border border-slate-200/60 bg-white/90 p-6 shadow-xl shadow-slate-200/50 backdrop-blur-lg sm:p-8">

          {/* Google Sign-In Button */}
          <div className="mb-6">
            <button
              type="button"
              onClick={handleGooglePopupClick}
              disabled={googleLoading}
              className="btn btn-secondary w-full py-3 text-base"
            >
              {googleLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-400/40 border-t-slate-700" />
                  Opening Google…
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-xs font-black text-red-500 shadow-sm">
                    G
                  </span>
                  Continue with Google
                </span>
              )}
            </button>
          </div>

          {/* Divider */}
          <div className="mb-6 flex items-center gap-4">
            <div className="flex-1 border-t border-slate-200" />
            <span className="text-xs font-medium text-slate-400">OR</span>
            <div className="flex-1 border-t border-slate-200" />
          </div>

          {/* Email + Password Form */}
          <form onSubmit={handleLogin} className="grid gap-5">
            <label htmlFor="login-email" className="grid gap-1.5">
              <span className="text-sm font-semibold text-slate-700">Email</span>
              <input
                id="login-email"
                type="email"
                className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-100"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>

            <label htmlFor="login-password" className="grid gap-1.5">
              <span className="text-sm font-semibold text-slate-700">Password</span>
              <input
                id="login-password"
                type="password"
                className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-100"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </label>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary w-full py-3 text-base" disabled={loading || googleLoading}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Signing in…
                </span>
              ) : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 border-t border-slate-100 pt-5 text-center">
            <p className="text-sm text-slate-500">
              Don't have an account?{' '}
              <Link className="font-semibold text-teal-700 transition hover:text-teal-900" to="/register">
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
