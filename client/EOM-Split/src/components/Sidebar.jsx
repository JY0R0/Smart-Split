import React from 'react'
import { NavLink } from 'react-router-dom'

const items = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/groups', label: 'Groups', icon: '👥' },
  { to: '/expenses', label: 'Expenses', icon: '💰' },
  { to: '/settlements', label: 'Settlements', icon: '🤝' },
  { to: '/profile', label: 'Profile', icon: '👤' },
]

export default function Sidebar({ open, onClose }) {
  return (
    <>
      {/* Backdrop overlay for mobile */}
      <div
        className={`fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm transition-opacity duration-300 md:hidden ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-slate-200/60 bg-white/90 backdrop-blur-xl transition-transform duration-300 md:static md:z-auto md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ height: '100vh', position: 'sticky', top: 0 }}
      >
        {/* Brand header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-200/60 px-5 py-5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-400 text-sm font-bold text-white shadow-lg shadow-teal-500/25">
              S
            </span>
            <div>
              <strong className="block text-sm font-bold text-slate-900">Smart Split</strong>
              <small className="block text-xs text-slate-400">Expense Intelligence</small>
            </div>
          </div>

          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-sm text-slate-500 transition hover:bg-slate-50 md:hidden"
            onClick={onClose}
            aria-label="Close navigation"
          >
            ✕
          </button>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="grid gap-1">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-r from-teal-50 to-emerald-50 text-teal-800 shadow-sm shadow-teal-100'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`
                }
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-200/60 px-5 py-4">
          <p className="text-xs text-slate-400">© 2026 Smart Split</p>
        </div>
      </aside>
    </>
  )
}
