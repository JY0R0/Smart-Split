import React, { useEffect, useState } from 'react'
import apiClient from '../services/apiClient'

export default function Settlements() {
  const [settlements, setSettlements] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadSettlements() {
      try {
        setLoading(true)
        const { data: groupsPayload } = await apiClient.get('/groups')
        const groups = groupsPayload.groups || []

        const requests = groups.map(async (group) => {
          try {
            const { data } = await apiClient.get(`/groups/${group.id}/balances`)
            return (data.settlements || []).map((s) => ({
              ...s,
              groupName: group.name,
            }))
          } catch {
            return []
          }
        })

        const all = await Promise.all(requests)
        setSettlements(all.flat())
      } catch {
        setSettlements([])
      } finally {
        setLoading(false)
      }
    }

    loadSettlements()
  }, [])

  return (
    <section className="mx-auto flex max-w-7xl flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200/60 bg-white/80 p-5 shadow-sm backdrop-blur-sm">
        <div className="space-y-1">
          <p className="section-kicker">Balances</p>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Settlements</h1>
          <p className="max-w-2xl text-sm text-slate-500">See who owes whom and close the loop with a polished, readable summary.</p>
        </div>
      </div>

      {/* Settlements list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-slate-200 border-t-teal-600" />
        </div>
      ) : settlements.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/50 py-16">
          <span className="text-4xl">🤝</span>
          <p className="text-sm font-medium text-slate-500">No settlements needed — all balances are settled!</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white/90 shadow-sm">
          {settlements.map((item, index) => (
            <div
              className={`flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-slate-50/80 md:flex-row md:items-center md:justify-between ${
                index < settlements.length - 1 ? 'border-b border-slate-100' : ''
              }`}
              key={`${item.fromUserId}-${item.toUserId}-${item.amount}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-red-50 text-sm font-bold text-red-600">
                  {(item.fromName || 'U').charAt(0)}
                </span>
                <strong className="text-sm text-slate-900">{item.fromName}</strong>
                <span className="text-xs font-medium text-slate-400">owes</span>
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-sm font-bold text-emerald-600">
                  {(item.toName || 'U').charAt(0)}
                </span>
                <strong className="text-sm text-slate-900">{item.toName}</strong>
                {item.groupName && (
                  <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                    {item.groupName}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <strong className="text-base font-bold text-slate-900">
                  ₹{Number(item.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </strong>
                <span className="status pending">Pending</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
