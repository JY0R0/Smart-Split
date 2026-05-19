import React, { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import apiClient from '../services/apiClient'

export default function Profile() {
  const { user } = useAuth()
  const initials = (user?.name || 'U').charAt(0).toUpperCase()

  const [mfaEnabled, setMfaEnabled] = useState(false)
  const [mfaLoading, setMfaLoading] = useState(false)
  const [mfaMsg, setMfaMsg] = useState('')

  useEffect(() => {
    apiClient.get('/auth/mfa')
      .then(({ data }) => setMfaEnabled(data.mfaEnabled))
      .catch(() => {})
  }, [])

  async function toggleMfa() {
    setMfaLoading(true)
    setMfaMsg('')
    try {
      const { data } = await apiClient.patch('/auth/mfa', { enabled: !mfaEnabled })
      setMfaEnabled(data.mfaEnabled)
      setMfaMsg(data.message)
    } catch (err) {
      setMfaMsg(err?.response?.data?.message || 'Failed to update 2FA setting.')
    } finally {
      setMfaLoading(false)
    }
  }

  return (
    <section className="mx-auto flex max-w-7xl flex-col gap-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200/60 bg-white/80 p-5 shadow-sm backdrop-blur-sm">
        <div className="space-y-1">
          <p className="section-kicker">Account</p>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Profile</h1>
          <p className="max-w-2xl text-sm text-slate-500">Review your account details and manage security settings.</p>
        </div>
      </div>

      {/* Profile card */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <article className="profile-card flex flex-col items-center gap-4 py-8 lg:col-span-1">
          <div className="grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-400 text-3xl font-bold text-white shadow-xl shadow-teal-500/20">
            {initials}
          </div>
          <div className="text-center">
            <h3 className="text-lg font-bold text-slate-900">{user?.name || 'User'}</h3>
            <p className="text-sm text-slate-400">{user?.email || 'No email'}</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Active Member</span>
        </article>

        <div className="grid gap-4 lg:col-span-2">
          {/* Personal details */}
          <article className="profile-card">
            <div className="flex items-center gap-3 mb-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-50 text-base">📋</span>
              <h3 className="text-base font-bold text-slate-900">Personal Details</h3>
            </div>
            <div className="grid gap-3">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-sm text-slate-500">Full Name</span>
                <strong className="text-sm text-slate-900">{user?.name || '—'}</strong>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-sm text-slate-500">Email</span>
                <strong className="text-sm text-slate-900">{user?.email || '—'}</strong>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-sm text-slate-500">User ID</span>
                <strong className="text-sm text-slate-900">#{user?.id || '—'}</strong>
              </div>
            </div>
          </article>

          {/* Two-Factor Authentication */}
          <article className="profile-card">
            <div className="flex items-center gap-3 mb-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-50 text-base">🔐</span>
              <h3 className="text-base font-bold text-slate-900">Two-Factor Authentication</h3>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              When enabled, you'll be sent a one-time code to your email every time you log in for extra security.
            </p>

            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {mfaEnabled ? '2FA is active' : '2FA is inactive'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {mfaEnabled ? 'Email verification required at every login.' : 'Only your password is required to log in.'}
                </p>
              </div>
              {/* Toggle switch */}
              <button
                id="mfa-toggle"
                type="button"
                role="switch"
                aria-checked={mfaEnabled}
                disabled={mfaLoading}
                onClick={toggleMfa}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-teal-100 disabled:opacity-50 ${
                  mfaEnabled ? 'bg-teal-500' : 'bg-slate-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-md transition-transform duration-200 ${
                    mfaEnabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {mfaMsg && (
              <p className={`mt-3 text-sm font-medium ${mfaEnabled ? 'text-teal-700' : 'text-slate-500'}`}>
                {mfaMsg}
              </p>
            )}
          </article>

          {/* Activity */}
          <article className="profile-card">
            <div className="flex items-center gap-3 mb-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-base">📊</span>
              <h3 className="text-base font-bold text-slate-900">Activity</h3>
            </div>
            <p className="text-sm text-slate-500">
              Recent settlements, shared groups, and open balances are tracked automatically across your groups.
            </p>
          </article>
        </div>
      </div>
    </section>
  )
}
