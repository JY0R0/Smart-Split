import React, { useEffect, useState, useCallback } from 'react'
import apiClient from '../services/apiClient'
import ExpenseCard from '../components/ExpenseCard'
import Modal from '../components/Modal'
import AddExpenseForm from '../components/AddExpenseForm'

function classifyCategory(title) {
  const value = (title || '').toLowerCase()
  if (value.includes('grocery') || value.includes('food') || value.includes('dinner')) return 'Food'
  if (value.includes('cab') || value.includes('fuel') || value.includes('flight') || value.includes('travel')) return 'Transport'
  if (value.includes('bill') || value.includes('rent') || value.includes('electric')) return 'Bills'
  if (value.includes('movie') || value.includes('party') || value.includes('game')) return 'Entertainment'
  return 'Other'
}

export default function Expenses() {
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  const loadExpenses = useCallback(async () => {
    try {
      setLoading(true)
      const { data: groupsPayload } = await apiClient.get('/groups')
      const groups = groupsPayload.groups || []

      const requests = groups.map(async (group) => {
        try {
          const { data } = await apiClient.get(`/groups/${group.id}/expenses`)
          return (data.expenses || []).map((exp) => ({
            ...exp,
            groupName: group.name,
          }))
        } catch {
          return []
        }
      })

      const all = await Promise.all(requests)
      setExpenses(all.flat())
    } catch {
      setExpenses([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadExpenses()
  }, [loadExpenses])

  function handleExpenseAdded() {
    setOpen(false)
    loadExpenses()
  }

  return (
    <section className="mx-auto flex max-w-7xl flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/60 bg-white/80 p-5 shadow-sm backdrop-blur-sm lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <p className="section-kicker">Transactions</p>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Expenses</h1>
          <p className="max-w-2xl text-sm text-slate-500">View and manage every split, payment, and category in one clean feed.</p>
        </div>

        <button type="button" className="btn btn-primary w-full lg:w-auto" onClick={() => setOpen(true)}>
          + Add Expense
        </button>
      </div>

      {/* Expenses list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-slate-200 border-t-teal-600" />
        </div>
      ) : expenses.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/50 py-16">
          <span className="text-4xl">💰</span>
          <p className="text-sm font-medium text-slate-500">No expenses found — add one to a group to see it here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {expenses.map((expense) => (
            <ExpenseCard
              key={expense.id}
              title={expense.title}
              amount={expense.amount}
              groupName={expense.groupName || `Group ${expense.groupId}`}
              paidByName={expense.paidByName || 'Unknown'}
              category={classifyCategory(expense.title)}
            />
          ))}
        </div>
      )}

      {/* Add Expense Modal */}
      <Modal
        title="Add Expense"
        open={open}
        onClose={() => setOpen(false)}
      >
        <AddExpenseForm onSuccess={handleExpenseAdded} />
      </Modal>
    </section>
  )
}
