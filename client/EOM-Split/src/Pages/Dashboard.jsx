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

const COLORS = ['#0f766e', '#dc2626', '#2563eb', '#d97706', '#9333ea', '#0ea5e9']

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

export default function Dashboard() {
  const [expenses, setExpenses] = useState([])
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
      totalSpent: totalSpent.toFixed(2),
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
          borderWidth: 1,
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
          backgroundColor: 'rgba(15,118,110,0.2)',
          tension: 0.25,
          fill: true,
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
          label: 'Spending Categories',
          data: labels.map((label) => totalsByCategory[label]),
          backgroundColor: labels.map((_, index) => COLORS[index % COLORS.length]),
        },
      ],
    }
  }, [expenses])

  if (loading) {
    return (
      <main className="page dashboard-page">
        <h1>Dashboard</h1>
        <p>Loading charts...</p>
      </main>
    )
  }

  return (
    <main className="page dashboard-page">
      <section className="dashboard-header">
        <h1>Dashboard</h1>
        <p>Track your group spending with visual insights.</p>
        {usingFallback && (
          <p className="dashboard-note">
            Showing sample data because no token-based API data was available.
          </p>
        )}
        {error && <p className="dashboard-error">{error}</p>}
      </section>

      <section className="dashboard-stats">
        <article className="dashboard-card">
          <h3>Total Spent</h3>
          <p>INR {summary.totalSpent}</p>
        </article>
        <article className="dashboard-card">
          <h3>Group Expenses</h3>
          <p>{summary.groupsCount} groups</p>
        </article>
        <article className="dashboard-card">
          <h3>Categories</h3>
          <p>{summary.categoriesCount} categories</p>
        </article>
        <article className="dashboard-card">
          <h3>Entries</h3>
          <p>{summary.expenseCount} expenses</p>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="dashboard-panel">
          <h2>Pie Chart</h2>
          <Pie data={groupPieData} />
        </article>

        <article className="dashboard-panel">
          <h2>Monthly Trends</h2>
          <Line data={monthlyTrendData} />
        </article>

        <article className="dashboard-panel dashboard-panel-wide">
          <h2>Spending Categories</h2>
          <Bar data={categoryChartData} />
        </article>
      </section>
    </main>
  )
}
