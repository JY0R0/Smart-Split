import React, { useEffect, useState, useCallback } from 'react'
import apiClient from '../services/apiClient'
import { useAuth } from '../context/AuthContext'

export default function Settlements() {
  const { user } = useAuth()
  const [settlements, setSettlements] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedKey, setExpandedKey] = useState(null)
  const [settlingKey, setSettlingKey] = useState(null)
  const [error, setError] = useState('')

  const loadSettlements = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const { data } = await apiClient.get('/user/settlements')
      setSettlements(data.settlements || [])
    } catch {
      setSettlements([])
      setError('Failed to load settlements.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettlements()
  }, [loadSettlements])

  function getKey(s) {
    return `${s.groupId}-${s.otherUserId}`
  }

  function toggleExpand(key) {
    setExpandedKey((prev) => (prev === key ? null : key))
  }

  async function handleSettle(settlement) {
    const key = getKey(settlement)
    const directionLabel =
      settlement.direction === 'you_owe'
        ? `You owe ${settlement.otherUserName} ₹${settlement.totalAmount.toFixed(2)}`
        : `${settlement.otherUserName} owes you ₹${settlement.totalAmount.toFixed(2)}`

    const confirmed = window.confirm(
      `Mark as settled?\n\n${directionLabel}\nGroup: ${settlement.groupName}\n\nThis will record the payment as complete.`
    )

    if (!confirmed) return

    setSettlingKey(key)
    try {
      await apiClient.post(`/groups/${settlement.groupId}/settle`, {
        withUserId: settlement.otherUserId,
      })
      loadSettlements()
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to record settlement.')
    } finally {
      setSettlingKey(null)
    }
  }

  const youOwe = settlements.filter((s) => s.direction === 'you_owe')
  const theyOwe = settlements.filter((s) => s.direction === 'they_owe')

  const totalYouOwe = youOwe.reduce((sum, s) => sum + s.totalAmount, 0)
  const totalTheyOwe = theyOwe.reduce((sum, s) => sum + s.totalAmount, 0)

  return (
    <section className="mx-auto flex max-w-7xl flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200/60 bg-white/80 p-5 shadow-sm backdrop-blur-sm">
        <div className="space-y-1">
          <p className="section-kicker">Balances</p>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Settlements</h1>
          <p className="max-w-2xl text-sm text-slate-500">
            Your personal balance summary — settle up when payments are made.
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-slate-200 border-t-teal-600" />
        </div>
      ) : settlements.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/50 py-16">
          <span className="text-5xl">🤝</span>
          <div className="text-center">
            <p className="text-base font-semibold text-slate-700">All settled up!</p>
            <p className="mt-1 text-sm text-slate-400">No outstanding balances with anyone.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {/* You Owe section */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-sm">🔴</span>
                You Owe
              </h2>
              {totalYouOwe > 0 && (
                <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-bold text-red-600">
                  ₹{totalYouOwe.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>

            {youOwe.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/50 px-5 py-8 text-center">
                <p className="text-sm text-slate-400">You don't owe anyone — nice! 🎉</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {youOwe.map((s) => (
                  <SettlementCard
                    key={getKey(s)}
                    settlement={s}
                    expanded={expandedKey === getKey(s)}
                    settling={settlingKey === getKey(s)}
                    currentUserName={user?.name || 'You'}
                    onToggle={() => toggleExpand(getKey(s))}
                    onSettle={() => handleSettle(s)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* They Owe You section */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-sm">🟢</span>
                You Are Owed
              </h2>
              {totalTheyOwe > 0 && (
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-600">
                  ₹{totalTheyOwe.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>

            {theyOwe.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/50 px-5 py-8 text-center">
                <p className="text-sm text-slate-400">Nobody owes you right now.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {theyOwe.map((s) => (
                  <SettlementCard
                    key={getKey(s)}
                    settlement={s}
                    expanded={expandedKey === getKey(s)}
                    settling={settlingKey === getKey(s)}
                    currentUserName={user?.name || 'You'}
                    onToggle={() => toggleExpand(getKey(s))}
                    onSettle={() => handleSettle(s)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Net summary */}
      {!loading && settlements.length > 0 && (
        <div className="rounded-2xl border border-slate-200/60 bg-white/80 p-5 shadow-sm backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-center gap-6 text-center">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Net Balance</p>
              <p className={`mt-1 text-2xl font-bold ${
                totalTheyOwe - totalYouOwe >= 0 ? 'text-emerald-600' : 'text-red-600'
              }`}>
                {totalTheyOwe - totalYouOwe >= 0 ? '+' : '−'}₹
                {Math.abs(totalTheyOwe - totalYouOwe).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {totalTheyOwe - totalYouOwe > 0
                  ? 'Overall, others owe you'
                  : totalTheyOwe - totalYouOwe < 0
                    ? 'Overall, you owe others'
                    : 'You are all squared up'}
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

/* ── Settlement Card Component ── */

function SettlementCard({ settlement, expanded, settling, currentUserName, onToggle, onSettle }) {
  const s = settlement
  const isYouOwe = s.direction === 'you_owe'
  const accentColor = isYouOwe ? 'red' : 'emerald'

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white/90 shadow-sm transition-shadow hover:shadow-md">
      {/* Collapsed header — always visible */}
      <div
        className="flex cursor-pointer items-center gap-3 px-5 py-4 transition-colors hover:bg-slate-50/80"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle() }}
      >
        {/* Avatar */}
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-${accentColor}-50 text-sm font-bold text-${accentColor}-600`}>
          {(s.otherUserName || 'U').charAt(0).toUpperCase()}
        </span>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <strong className="truncate text-sm text-slate-900">{s.otherUserName}</strong>
            <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
              {s.groupName}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            {isYouOwe
              ? `You owe ${s.otherUserName}`
              : `${s.otherUserName} owes you`}
            {' · '}
            {s.expenses.length} {s.expenses.length === 1 ? 'expense' : 'expenses'}
          </p>
        </div>

        {/* Amount + chevron */}
        <div className="flex items-center gap-3">
          <strong className={`text-lg font-bold ${isYouOwe ? 'text-red-600' : 'text-emerald-600'}`}>
            {isYouOwe ? '−' : '+'}₹{s.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </strong>
          <svg
            className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-4">
          {/* Per-expense breakdown */}
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Expense Breakdown
          </h4>
          <div className="space-y-2">
            {s.expenses.map((exp) => (
              <div
                key={exp.id}
                className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{exp.title}</p>
                  <p className="text-xs text-slate-400">
                    Total ₹{exp.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    {' · Paid by '}
                    {exp.paidByUserId === s.otherUserId ? s.otherUserName : currentUserName}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <div className="text-xs text-slate-500">
                    <span className="block">Your share: ₹{exp.yourShare.toFixed(2)}</span>
                    <span className="block">{s.otherUserName}'s share: ₹{exp.theirShare.toFixed(2)}</span>
                  </div>
                  <span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold ${
                    exp.netEffect > 0
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-red-50 text-red-600'
                  }`}>
                    {exp.netEffect > 0 ? '+' : '−'}₹{Math.abs(exp.netEffect).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Net total summary */}
          <div className="mt-3 flex items-center justify-between rounded-xl bg-white px-4 py-3 border border-slate-200">
            <span className="text-sm font-semibold text-slate-700">Net Total</span>
            <strong className={`text-base font-bold ${isYouOwe ? 'text-red-600' : 'text-emerald-600'}`}>
              {isYouOwe ? '−' : '+'}₹{s.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </strong>
          </div>

          {/* Settle Up button */}
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className="btn btn-primary"
              disabled={settling}
              onClick={(e) => {
                e.stopPropagation()
                onSettle()
              }}
            >
              {settling ? 'Recording…' : '✓ Settle Up'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
