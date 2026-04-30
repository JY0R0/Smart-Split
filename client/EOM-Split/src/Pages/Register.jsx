import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Register() {
  const navigate = useNavigate()
  const { register } = useAuth()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      await register({ name, email, password })
      navigate('/dashboard', { replace: true })
    } catch (registerError) {
      setError(registerError?.response?.data?.message || registerError.message || 'Unable to register.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 py-12">
      {/* Decorative gradient blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-amber-400/8 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-400 text-xl font-bold text-white shadow-lg shadow-teal-500/25">
            S
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Create your account</h1>
          <p className="mt-1 text-sm text-slate-500">Join Smart Split and start tracking expenses</p>
        </div>

        {/* Card */}
        <div className="rounded-3xl border border-slate-200/60 bg-white/90 p-6 shadow-xl shadow-slate-200/50 backdrop-blur-lg sm:p-8">
          <form onSubmit={handleSubmit} className="grid gap-5">
            <label htmlFor="register-name" className="grid gap-1.5">
              <span className="text-sm font-semibold text-slate-700">Name</span>
              <input
                id="register-name"
                type="text"
                className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-100"
                placeholder="Your name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoComplete="name"
              />
            </label>

            <label htmlFor="register-email" className="grid gap-1.5">
              <span className="text-sm font-semibold text-slate-700">Email</span>
              <input
                id="register-email"
                type="email"
                className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-100"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
              />
            </label>

            <label htmlFor="register-password" className="grid gap-1.5">
              <span className="text-sm font-semibold text-slate-700">Password</span>
              <input
                id="register-password"
                type="password"
                className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-100"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="new-password"
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
                  Creating account…
                </span>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          <div className="mt-6 border-t border-slate-100 pt-5 text-center">
            <p className="text-sm text-slate-500">
              Already have an account?{' '}
              <Link className="font-semibold text-teal-700 transition hover:text-teal-900" to="/login">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
