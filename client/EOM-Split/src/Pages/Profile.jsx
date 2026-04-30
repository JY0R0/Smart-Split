import React from 'react'
import { useAuth } from '../context/AuthContext'

export default function Profile() {
  const { user } = useAuth()
  const initials = (user?.name || 'U').charAt(0).toUpperCase()

  return (
    <section className="mx-auto flex max-w-7xl flex-col gap-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200/60 bg-white/80 p-5 shadow-sm backdrop-blur-sm">
        <div className="space-y-1">
          <p className="section-kicker">Account</p>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Profile</h1>
          <p className="max-w-2xl text-sm text-slate-500">Review your account details and keep your split history tidy.</p>
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

          <article className="profile-card">
            <div className="flex items-center gap-3 mb-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-50 text-base">📊</span>
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
