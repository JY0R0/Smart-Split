import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import OtpInput from '../components/OtpInput'
import apiClient from '../services/apiClient'

const STEPS = { EMAIL: 'email', OTP: 'otp' }

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [step, setStep] = useState(STEPS.EMAIL)
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [userId, setUserId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resendMsg, setResendMsg] = useState('')
  const [resendCooldown, setResendCooldown] = useState(false)

  async function handleInitiate(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data } = await apiClient.post('/auth/passwordless/initiate', { email })
      setUserId(data.userId)
      setStep(STEPS.OTP)
    } catch (loginError) {
      setError(loginError?.response?.data?.message || loginError.message || 'Unable to send code.')
    } finally {
      setLoading(false)
    }
  }

  async function handleOtpVerify(event) {
    event.preventDefault()
    if (otp.length < 6) { setError('Please enter the full 6-digit code.'); return }
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
    setError('')
    try {
      const { data: payload } = await apiClient.post('/auth/login/verify', { userId, otp })
      login.__saveSession(payload)
      const target = payload?.user?.role === 'admin' ? '/admin' : '/dashboard'
      navigate(target, { replace: true })
    } catch (err) {
      setError(err?.response?.data?.message || 'Verification failed.')
    } finally {
      setLoading(false)
    }
      if (password && password.trim().length > 0) {
        // Password login flow
        const payload = await login({ email, password })
        if (payload?.mfaRequired) {
          setUserId(payload.userId)
          setStep(STEPS.OTP)
          return
        }
        const target = payload?.user?.role === 'admin' ? '/admin' : '/dashboard'
        navigate(target, { replace: true })
        return
      }

      // Passwordless flow
      const { data } = await apiClient.post('/auth/passwordless/initiate', { email })
      setUserId(data.userId)
      setStep(STEPS.OTP)
    setResendMsg('')
    setError('')
    setResendCooldown(true)
    try {
      const { data } = await apiClient.post('/auth/resend-otp', { userId, purpose: 'login' })
      setResendMsg(data.message)
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to resend code.')
    }
    setTimeout(() => setResendCooldown(false), 60000)
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
          {step === STEPS.EMAIL ? (
            <>
              <h1 className="text-2xl font-bold text-slate-900">Sign in with email code</h1>
              <p className="mt-1 text-sm text-slate-500">We will send a 6-digit OTP to your email</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-slate-900">Check your email</h1>
              <p className="mt-1 text-sm text-slate-500">
                Enter the 6-digit code sent to <span className="font-semibold text-teal-700">{email}</span>
              </p>
            </>
          )}
        </div>

        {/* Card */}
        <div className="rounded-3xl border border-slate-200/60 bg-white/90 p-6 shadow-xl shadow-slate-200/50 backdrop-blur-lg sm:p-8">

          {/* ── Step 1: Email ── */}
          {step === STEPS.EMAIL && (
            <form onSubmit={handleInitiate} className="grid gap-5">
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
                ) : 'Send OTP'}
              </button>
            </form>
          )}

          {/* ── Step 2: OTP ── */}
          {step === STEPS.OTP && (
            <form onSubmit={handleOtpVerify} className="grid gap-6">
              <div className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 text-center text-sm text-teal-800">
                Use the code we sent to your inbox. It expires in <strong>10 minutes</strong>.
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
                ) : 'Verify & Sign In'}
              </button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  className="text-slate-500 hover:text-slate-700 transition"
                  onClick={() => { setStep(STEPS.EMAIL); setError(''); setOtp('') }}
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
