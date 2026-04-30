import React, { useEffect, useMemo, useState } from 'react'
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js'
import { Pie, Line, Bar } from 'react-chartjs-2'
import apiClient from '../services/apiClient'
import ExpenseCard from '../components/ExpenseCard'
import GroupCard from '../components/GroupCard'
import Modal from '../components/Modal'

ChartJS.register(
  ArcElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend
)

const FALLBACK_EXPENSES = [
  { id: 1, title: 'Groceries', amount: 1200, groupId: 1, groupName: 'Home', createdAt: '2026-01-12' },
  { id: 2, title: 'Cab Ride', amount: 450, groupId: 1, groupName: 'Home', createdAt: '2026-02-10' },
  { id: 3, title: 'Trip Dinner', amount: 2400, groupId: 2, groupName: 'Travel', createdAt: '2026-03-18' },
  { id: 4, title: 'Movie Tickets', amount: 900, groupId: 3, groupName: 'Friends', createdAt: '2026-03-25' },
  { id: 5, title: 'Electric Bill', amount: 1800, groupId: 1, groupName: 'Home', createdAt: '2026-04-03' },
  { id: 6, title: 'Flight', amount: 6400, groupId: 2, groupName: 'Travel', createdAt: '2026-04-08' },
]

const COLORS = ['#0f766e', '#6366f1', '#2563eb', '#d97706', '#ec4899', '#0ea5e9']

function classifyCategory(title) {
  const value = (title || '').toLowerCase()
  if (value.includes('grocery') || value.includes('food') || value.includes('dinner')) return 'Food'
  if (value.includes('cab') || value.includes('fuel') || value.includes('flight') || value.includes('travel')) return 'Transport'
  if (value.includes('bill') || value.includes('rent') || value.includes('electric')) return 'Bills'
  if (value.includes('movie') || value.includes('party') || value.includes('game')) return 'Entertainment'
  return 'Other'
}

function toMonthKey(dateLike) {
  const date = dateLike ? new Date(dateLike) : new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${date.getFullYear()}-${month}`
}

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom',
      labels: {
        padding: 16,
        usePointStyle: true,
        pointStyleWidth: 8,
        font: { family: 'Inter', size: 12, weight: '500' },
      },
    },
  },
}

const lineOptions = {
  ...chartOptions,
  scales: {
    x: {
      grid: { display: false },
      ticks: { font: { family: 'Inter', size: 11 } },
    },
    y: {
      grid: { color: 'rgba(15, 23, 42, 0.04)' },
      ticks: { font: { family: 'Inter', size: 11 } },
    },
  },
}

const barOptions = {
  ...chartOptions,
  scales: {
    x: {
      grid: { display: false },
      ticks: { font: { family: 'Inter', size: 11 } },
    },
    y: {
      grid: { color: 'rgba(15, 23, 42, 0.04)' },
      ticks: { font: { family: 'Inter', size: 11 } },
    },
  },
}

export default function Dashboard() {
  const [expenses, setExpenses] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [usingFallback, setUsingFallback] = useState(false)

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true)
        setError('')

        const token = localStorage.getItem('token') || localStorage.getItem('authToken')
        if (!token) {
          setUsingFallback(true)
          setExpenses(FALLBACK_EXPENSES)
          return
        }

        const { data: groupsPayload } = await apiClient.get('/groups')
        const groups = groupsPayload.groups || []

        const expenseRequests = groups.map(async (group) => {
          try {
            const { data: payload } = await apiClient.get(`/groups/${group.id}/expenses`)
            return (payload.expenses || []).map((expense) => ({
              ...expense,
              groupName: group.name,
            }))
          } catch {
            return []
          }
        })

        const allExpenseGroups = await Promise.all(expenseRequests)
        const mergedExpenses = allExpenseGroups.flat()

        if (mergedExpenses.length === 0) {
          setUsingFallback(true)
          setExpenses(FALLBACK_EXPENSES)
          return
        }

        setUsingFallback(false)
        setExpenses(mergedExpenses)
      } catch (loadError) {
        setUsingFallback(true)
        setExpenses(FALLBACK_EXPENSES)
        setError(loadError.message || 'Failed to load dashboard data.')
      } finally {
        setLoading(false)
      }
    }

    loadDashboard()
  }, [])

  const summary = useMemo(() => {
    const totalSpent = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
    const groupsCount = new Set(expenses.map((expense) => expense.groupId)).size
    const categoriesCount = new Set(expenses.map((expense) => classifyCategory(expense.title))).size

    return {
      totalSpent: totalSpent.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      groupsCount,
      categoriesCount,
      expenseCount: expenses.length,
    }
  }, [expenses])

  const groupPieData = useMemo(() => {
    const totalsByGroup = expenses.reduce((acc, expense) => {
      const key = expense.groupName || `Group ${expense.groupId}`
      acc[key] = (acc[key] || 0) + Number(expense.amount || 0)
      return acc
    }, {})

    const labels = Object.keys(totalsByGroup)
    const values = Object.values(totalsByGroup)

    return {
      labels,
      datasets: [
        {
          label: 'Group Expenses',
          data: values,
          backgroundColor: labels.map((_, index) => COLORS[index % COLORS.length]),
          borderWidth: 0,
          hoverOffset: 6,
        },
      ],
    }
  }, [expenses])

  const monthlyTrendData = useMemo(() => {
    const totalsByMonth = expenses.reduce((acc, expense) => {
      const key = toMonthKey(expense.createdAt)
      acc[key] = (acc[key] || 0) + Number(expense.amount || 0)
      return acc
    }, {})

    const labels = Object.keys(totalsByMonth).sort()
    return {
      labels,
      datasets: [
        {
          label: 'Monthly Spend',
          data: labels.map((label) => totalsByMonth[label]),
          borderColor: '#0f766e',
          backgroundColor: 'rgba(15,118,110,0.08)',
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#0f766e',
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    }
  }, [expenses])

  const categoryChartData = useMemo(() => {
    const totalsByCategory = expenses.reduce((acc, expense) => {
      const category = classifyCategory(expense.title)
      acc[category] = (acc[category] || 0) + Number(expense.amount || 0)
      return acc
    }, {})

    const labels = Object.keys(totalsByCategory)
    return {
      labels,
      datasets: [
        {
          label: 'By Category',
          data: labels.map((label) => totalsByCategory[label]),
          backgroundColor: labels.map((_, index) => COLORS[index % COLORS.length] + '20'),
          borderColor: labels.map((_, index) => COLORS[index % COLORS.length]),
          borderWidth: 2,
          borderRadius: 8,
        },
      ],
    }
  }, [expenses])

  const recentExpenses = useMemo(() => expenses.slice(0, 3), [expenses])

  const groupHighlights = useMemo(() => {
    const grouped = expenses.reduce((acc, expense) => {
      const key = expense.groupName || `Group ${expense.groupId}`
      if (!acc[key]) {
        acc[key] = { name: key, total: 0, members: new Set() }
      }

      acc[key].total += Number(expense.amount || 0)
      if (expense.paidByName) {
        acc[key].members.add(expense.paidByName)
      }

      return acc
    }, {})

    return Object.values(grouped).slice(0, 3)
  }, [expenses])

  if (loading) {
    return (
      <section className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-4 py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-slate-200 border-t-teal-600" />
        <p className="text-sm font-medium text-slate-500">Loading dashboard…</p>
      </section>
    )
  }

  const statCards = [
    { label: 'Total Spent', value: `₹${summary.totalSpent}`, icon: '💸' },
    { label: 'Groups', value: `${summary.groupsCount} groups`, icon: '👥' },
    { label: 'Categories', value: `${summary.categoriesCount} categories`, icon: '📂' },
    { label: 'Entries', value: `${summary.expenseCount} expenses`, icon: '📝' },
  ]

  return (
    <section className="mx-auto flex max-w-7xl flex-col gap-6">
      {/* Header */}
      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200/60 bg-white/80 p-5 shadow-sm backdrop-blur-sm lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <p className="section-kicker">Overview</p>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Dashboard</h1>
          <p className="max-w-2xl text-sm text-slate-500">Track your group spending with visual insights and analytics.</p>
        </div>
        <button type="button" className="btn btn-primary w-full lg:w-auto" onClick={() => setShowModal(true)}>
          + Quick Add Expense
        </button>
      </section>

      {/* Info banners */}
      {usingFallback && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          📊 Showing sample data — add expenses to your groups to see real data here.
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {/* Stat cards */}
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {statCards.map((card) => (
          <article className="dashboard-card" key={card.label}>
            <div className="flex items-center gap-2">
              <span className="text-lg">{card.icon}</span>
              <h3>{card.label}</h3>
            </div>
            <p>{card.value}</p>
          </article>
        ))}
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <article className="dashboard-panel">
          <h2>Spending by Group</h2>
          <div className="relative mx-auto" style={{ height: '280px', maxWidth: '320px' }}>
            <Pie data={groupPieData} options={{ ...chartOptions, maintainAspectRatio: false }} />
          </div>
        </article>

        <article className="dashboard-panel">
          <h2>Monthly Trend</h2>
          <div style={{ height: '280px' }}>
            <Line data={monthlyTrendData} options={lineOptions} />
          </div>
        </article>

        <article className="dashboard-panel xl:col-span-2">
          <h2>Category Breakdown</h2>
          <div style={{ height: '280px' }}>
            <Bar data={categoryChartData} options={barOptions} />
          </div>
        </article>
      </section>

      {/* Recent & Groups */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <article className="dashboard-panel">
          <h2>Recent Expenses</h2>
          {recentExpenses.length === 0 ? (
            <p className="text-sm text-slate-400">No expenses yet.</p>
          ) : (
            <div className="stack">
              {recentExpenses.map((expense) => (
                <ExpenseCard
                  key={expense.id}
                  title={expense.title}
                  amount={expense.amount}
                  groupName={expense.groupName || `Group ${expense.groupId}`}
                  paidByName={expense.paidByName || 'You'}
                  date={expense.createdAt || 'Recently added'}
                  category={classifyCategory(expense.title)}
                />
              ))}
            </div>
          )}
        </article>

        <article className="dashboard-panel">
          <h2>Top Groups</h2>
          {groupHighlights.length === 0 ? (
            <p className="text-sm text-slate-400">No groups yet.</p>
          ) : (
            <div className="stack">
              {groupHighlights.map((group, index) => (
                <GroupCard
                  key={group.name}
                  name={group.name}
                  members={group.members.size || 1}
                  balance={`₹${group.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })} spent`}
                  accent={index === 0 ? 'teal' : index === 1 ? 'amber' : 'indigo'}
                />
              ))}
            </div>
          )}
        </article>
      </section>

      {/* Quick Add Modal */}
      <Modal
        title="Quick Add Expense"
        open={showModal}
        onClose={() => setShowModal(false)}
        footer={
          <button type="button" className="btn btn-primary" onClick={() => setShowModal(false)}>
            Done
          </button>
        }
      >
        <form className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-slate-700">Title</span>
            <input className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm outline-none transition-all placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-100" type="text" placeholder="Dinner, cab, groceries…" />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-slate-700">Amount</span>
            <input className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm outline-none transition-all placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-100" type="number" placeholder="1200" />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-slate-700">Group</span>
            <input className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm outline-none transition-all placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-100" type="text" placeholder="Travel group" />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-slate-700">Split type</span>
            <select className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm outline-none transition-all focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-100" defaultValue="equal">
              <option value="equal">Equal</option>
              <option value="custom">Custom</option>
            </select>
          </label>
        </form>
      </Modal>
    </section>
  )
}
