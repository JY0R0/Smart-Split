import React, { useEffect, useMemo, useState } from 'react'
import apiClient from '../services/apiClient'

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function AdminDashboard({ user, onLogout }) {
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadOverview() {
      try {
        setLoading(true)
        setError('')
        const { data } = await apiClient.get('/admin/overview')
        setOverview(data)
      } catch (requestError) {
        setError(requestError?.response?.data?.message || requestError.message || 'Failed to load admin overview.')
      } finally {
        setLoading(false)
      }
    }

    loadOverview()
  }, [])

  const stats = useMemo(() => {
    if (!overview?.summary) {
      return []
    }

    return [
      { label: 'Total Users', value: overview.summary.userCount },
      { label: 'Admins', value: overview.summary.adminCount },
      { label: 'Groups', value: overview.summary.groupCount },
      { label: 'Expenses', value: overview.summary.expenseCount },
      { label: 'Settlements', value: overview.summary.settlementCount },
      { label: 'Expense Volume', value: formatCurrency(overview.summary.totalExpenseAmount) },
    ]
  }, [overview])

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 md:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl shadow-slate-950/60">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Admin Control</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-white">Smart Split Admin Console</h1>
              <p className="mt-2 text-sm text-slate-300">View all users and complete platform activity from one dashboard.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg border border-cyan-700/60 bg-cyan-900/40 px-3 py-1 text-xs font-semibold text-cyan-200">
                {user?.name || 'Admin'}
              </span>
              <button
                type="button"
                onClick={onLogout}
                className="rounded-lg border border-rose-700/50 bg-rose-900/30 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-800/50"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        {loading && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center text-slate-300">
            Loading admin data...
          </section>
        )}

        {error && (
          <section className="rounded-2xl border border-rose-700/60 bg-rose-900/20 p-4 text-sm text-rose-200">
            {error}
          </section>
        )}

        {!loading && !error && overview && (
          <>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {stats.map((stat) => (
                <article key={stat.label} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-400">{stat.label}</p>
                  <p className="mt-2 text-2xl font-bold text-white">{stat.value}</p>
                </article>
              ))}
            </section>

            <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <h2 className="mb-3 text-lg font-bold text-white">Users</h2>
                <div className="max-h-96 overflow-auto rounded-lg border border-slate-800">
                  <table className="w-full min-w-130 text-left text-sm">
                    <thead className="bg-slate-900 text-xs uppercase tracking-widest text-slate-400">
                      <tr>
                        <th className="px-3 py-2">ID</th>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Email</th>
                        <th className="px-3 py-2">Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.users.map((item) => (
                        <tr key={item.id} className="border-t border-slate-800">
                          <td className="px-3 py-2">{item.id}</td>
                          <td className="px-3 py-2">{item.name}</td>
                          <td className="px-3 py-2">{item.email}</td>
                          <td className="px-3 py-2">{item.role}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <h2 className="mb-3 text-lg font-bold text-white">Groups</h2>
                <div className="max-h-96 overflow-auto rounded-lg border border-slate-800">
                  <table className="w-full min-w-115 text-left text-sm">
                    <thead className="bg-slate-900 text-xs uppercase tracking-widest text-slate-400">
                      <tr>
                        <th className="px-3 py-2">ID</th>
                        <th className="px-3 py-2">Group</th>
                        <th className="px-3 py-2">Creator</th>
                        <th className="px-3 py-2">Members</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.groups.map((item) => (
                        <tr key={item.id} className="border-t border-slate-800">
                          <td className="px-3 py-2">{item.id}</td>
                          <td className="px-3 py-2">{item.name}</td>
                          <td className="px-3 py-2">{item.createdByName}</td>
                          <td className="px-3 py-2">{item.memberCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <h2 className="mb-3 text-lg font-bold text-white">Expenses</h2>
                <div className="max-h-96 overflow-auto rounded-lg border border-slate-800">
                  <table className="w-full min-w-140 text-left text-sm">
                    <thead className="bg-slate-900 text-xs uppercase tracking-widest text-slate-400">
                      <tr>
                        <th className="px-3 py-2">ID</th>
                        <th className="px-3 py-2">Title</th>
                        <th className="px-3 py-2">Group</th>
                        <th className="px-3 py-2">Paid By</th>
                        <th className="px-3 py-2">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.expenses.map((item) => (
                        <tr key={item.id} className="border-t border-slate-800">
                          <td className="px-3 py-2">{item.id}</td>
                          <td className="px-3 py-2">{item.title}</td>
                          <td className="px-3 py-2">{item.groupName}</td>
                          <td className="px-3 py-2">{item.paidByName}</td>
                          <td className="px-3 py-2">{formatCurrency(item.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <h2 className="mb-3 text-lg font-bold text-white">Settlements</h2>
                <div className="max-h-96 overflow-auto rounded-lg border border-slate-800">
                  <table className="w-full min-w-140 text-left text-sm">
                    <thead className="bg-slate-900 text-xs uppercase tracking-widest text-slate-400">
                      <tr>
                        <th className="px-3 py-2">ID</th>
                        <th className="px-3 py-2">Group</th>
                        <th className="px-3 py-2">Payer</th>
                        <th className="px-3 py-2">Receiver</th>
                        <th className="px-3 py-2">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.settlements.map((item) => (
                        <tr key={item.id} className="border-t border-slate-800">
                          <td className="px-3 py-2">{item.id}</td>
                          <td className="px-3 py-2">{item.groupName || 'N/A'}</td>
                          <td className="px-3 py-2">{item.payerName}</td>
                          <td className="px-3 py-2">{item.receiverName}</td>
                          <td className="px-3 py-2">{formatCurrency(item.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
