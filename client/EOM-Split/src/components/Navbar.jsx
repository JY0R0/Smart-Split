import React from 'react'

export default function Navbar({ user, onLogout, onMenuClick }) {
  const initials = (user?.name || 'U').charAt(0).toUpperCase()

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/60 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-6">
        {/* Left: menu button + title */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 md:hidden"
            aria-label="Open navigation"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-teal-700">Smart Split</p>
            <h1 className="text-base font-bold text-slate-900 md:text-lg">Expense Intelligence</h1>
          </div>
        </div>

        {/* Right: user info + logout */}
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-3 rounded-2xl border border-slate-200/60 bg-slate-50/80 px-3 py-2 sm:flex">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-teal-600 to-emerald-400 text-sm font-bold text-white shadow-md shadow-teal-500/20">
              {initials}
            </span>
            <div className="leading-tight">
              <strong className="block text-sm font-semibold text-slate-900">{user?.name || 'Guest'}</strong>
              <small className="block text-xs text-slate-400">{user?.email || 'Signed in'}</small>
            </div>
          </div>

          <button
            type="button"
            className="rounded-xl border border-slate-200/60 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-red-50 hover:text-red-600 hover:border-red-200"
            onClick={onLogout}
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  )
}
