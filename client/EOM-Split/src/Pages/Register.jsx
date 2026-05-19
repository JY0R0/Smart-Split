import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import OtpInput from '../components/OtpInput'
import apiClient from '../services/apiClient'

const STEPS = { FORM: 'form', VERIFY: 'verify' }

export default function Register() {
  const navigate = useNavigate()
  const { register } = useAuth()

  const [step, setStep] = useState(STEPS.FORM)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [userId, setUserId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resendMsg, setResendMsg] = useState('')
  const [resendCooldown, setResendCooldown] = useState(false)

  // Step 1 — submit name/email/password via AuthContext.register (/initiate)
  async function handleInitiate(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await register({ name, email, password })
      setUserId(data.userId)
      setStep(STEPS.VERIFY)
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Unable to send verification code.')
    } finally {
      setLoading(false)
    }
  }

  // Step 2 — verify OTP to activate account
  async function handleVerify(event) {
    event.preventDefault()
    if (otp.length < 6) { setError('Please enter the full 6-digit code.'); return }
    setLoading(true)
    setError('')
    try {
      const { data: payload } = await apiClient.post('/auth/register/verify', { userId, otp })
      register.__saveSession(payload)
      const target = payload?.user?.role === 'admin' ? '/admin' : '/dashboard'
      navigate(target, { replace: true })
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Verification failed.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setResendMsg('')
    setError('')
    setResendCooldown(true)
    try {
      const { data } = await apiClient.post('/auth/resend-otp', { userId, purpose: 'register' })
      setResendMsg(data.message)
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to resend code.')
    }
    setTimeout(() => setResendCooldown(false), 60000)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 py-12">
      {/* Decorative blobs */}
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
          {step === STEPS.FORM ? (
            <>
              <h1 className="text-2xl font-bold text-slate-900">Create your account</h1>
              <p className="mt-1 text-sm text-slate-500">Join Smart Split and start tracking expenses</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-slate-900">Verify your email</h1>
              <p className="mt-1 text-sm text-slate-500">
                We sent a 6-digit code to <span className="font-semibold text-teal-700">{email}</span>
              </p>
            </>
          )}
        </div>

        {/* Card */}
        <div className="rounded-3xl border border-slate-200/60 bg-white/90 p-6 shadow-xl shadow-slate-200/50 backdrop-blur-lg sm:p-8">

          {/* ── Step 1: Registration form ── */}
          {step === STEPS.FORM && (
            <form onSubmit={handleInitiate} className="grid gap-5">
              <label htmlFor="register-name" className="grid gap-1.5">
                <span className="text-sm font-semibold text-slate-700">Name</span>
                <input
                  id="register-name"
                  type="text"
                  className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-100"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
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
                  onChange={(e) => setEmail(e.target.value)}
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
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </label>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {error}
                </div>
              )}

              <button type="submit" className="btn btn-primary w-full py-3 text-base" disabled={loading}>
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Sending code…
                  </span>
                ) : 'Continue'}
              </button>
            </form>
          )}

          {/* ── Step 2: OTP verification ── */}
          {step === STEPS.VERIFY && (
            <form onSubmit={handleVerify} className="grid gap-6">
              <div className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 text-center text-sm text-teal-800">
                Check your inbox — the code expires in <strong>10 minutes</strong>.
              </div>

              <OtpInput length={6} value={otp} onChange={setOtp} disabled={loading} />

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 text-center">
                  {error}
                </div>
              )}
              {resendMsg && (
                <p className="text-center text-sm font-medium text-teal-700">{resendMsg}</p>
              )}

              <button
                type="submit"
                className="btn btn-primary w-full py-3 text-base"
                disabled={loading || otp.length < 6}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Verifying…
                  </span>
                ) : 'Verify & Create Account'}
              </button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  className="text-slate-500 hover:text-slate-700 transition"
                  onClick={() => { setStep(STEPS.FORM); setError(''); setOtp('') }}
                >
                  ← Back
                </button>
                <button
                  type="button"
                  className="font-semibold text-teal-700 hover:text-teal-900 transition disabled:opacity-40"
                  disabled={resendCooldown}
                  onClick={handleResend}
                >
                  {resendCooldown ? 'Resend in 60s' : 'Resend code'}
                </button>
              </div>
            </form>
          )}

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
