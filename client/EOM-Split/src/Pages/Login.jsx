import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      await login({ email, password })
      navigate('/dashboard', { replace: true })
    } catch (loginError) {
      setError(loginError?.response?.data?.message || loginError.message || 'Unable to log in.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 py-12">
      {/* Decorative gradient blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-teal-400/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-indigo-400/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-400 text-xl font-bold text-white shadow-lg shadow-teal-500/25">
            S
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to Smart Split to manage your expenses</p>
        </div>

        {/* Card */}
        <div className="rounded-3xl border border-slate-200/60 bg-white/90 p-6 shadow-xl shadow-slate-200/50 backdrop-blur-lg sm:p-8">
          <form onSubmit={handleSubmit} className="grid gap-5">
            <label htmlFor="login-email" className="grid gap-1.5">
              <span className="text-sm font-semibold text-slate-700">Email</span>
              <input
                id="login-email"
                type="email"
                className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-100"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
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
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="current-password"
              />
            </label>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary w-full py-3 text-base"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Signing in…
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 border-t border-slate-100 pt-5 text-center">
            <p className="text-sm text-slate-500">
              New here?{' '}
              <Link className="font-semibold text-teal-700 transition hover:text-teal-900" to="/register">
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
