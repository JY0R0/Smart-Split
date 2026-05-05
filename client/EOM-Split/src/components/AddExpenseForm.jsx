import React, { useEffect, useState } from 'react'
import apiClient from '../services/apiClient'

export default function AddExpenseForm({ onSuccess, onError }) {
  const [groups, setGroups] = useState([])
  const [members, setMembers] = useState([])
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [groupId, setGroupId] = useState('')
  const [paidById, setPaidById] = useState('')
  const [selectedParticipants, setSelectedParticipants] = useState([])
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Load user's groups on mount
  useEffect(() => {
    async function fetchGroups() {
      try {
        setLoadingGroups(true)
        const { data } = await apiClient.get('/groups')
        setGroups(data.groups || [])
      } catch {
        setGroups([])
      } finally {
        setLoadingGroups(false)
      }
    }
    fetchGroups()
  }, [])

  // Load members when group changes
  useEffect(() => {
    if (!groupId) {
      setMembers([])
      setPaidById('')
      setSelectedParticipants([])
      return
    }

    async function fetchMembers() {
      try {
        setLoadingMembers(true)
        const { data } = await apiClient.get(`/groups/${groupId}`)
        const groupMembers = data.group?.members || []
        setMembers(groupMembers)
        // Default: current user pays, all members split
        if (groupMembers.length > 0) {
          setPaidById(String(groupMembers[0].id))
          setSelectedParticipants(groupMembers.map((m) => m.id))
        }
      } catch {
        setMembers([])
      } finally {
        setLoadingMembers(false)
      }
    }
    fetchMembers()
  }, [groupId])

  function toggleParticipant(memberId) {
    setSelectedParticipants((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!title.trim()) {
      setError('Title is required.')
      return
    }
    if (!amount || Number(amount) <= 0) {
      setError('Please enter a valid amount.')
      return
    }
    if (!groupId) {
      setError('Please select a group.')
      return
    }
    if (!paidById) {
      setError('Please select who paid.')
      return
    }
    if (selectedParticipants.length === 0) {
      setError('Select at least one person to split with.')
      return
    }

    setSaving(true)
    try {
      await apiClient.post(`/groups/${groupId}/expenses`, {
        title: title.trim(),
        amount: Number(amount),
        paidById: Number(paidById),
        splitType: 'equal',
        participants: selectedParticipants,
      })

      // Reset form
      setTitle('')
      setAmount('')
      setGroupId('')
      setPaidById('')
      setSelectedParticipants([])
      setMembers([])

      if (onSuccess) onSuccess()
    } catch (err) {
      const msg = err?.response?.data?.message || 'Failed to add expense.'
      setError(msg)
      if (onError) onError(msg)
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm outline-none transition-all placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-100'

  return (
    <form id="add-expense-form" onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {/* Title */}
      <label className="grid gap-1.5">
        <span className="text-sm font-semibold text-slate-700">Title</span>
        <input
          className={inputClass}
          type="text"
          placeholder="Dinner, cab, groceries…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </label>

      {/* Amount */}
      <label className="grid gap-1.5">
        <span className="text-sm font-semibold text-slate-700">Amount (₹)</span>
        <input
          className={inputClass}
          type="number"
          placeholder="1200"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </label>

      {/* Group selector */}
      <label className="grid gap-1.5">
        <span className="text-sm font-semibold text-slate-700">Group</span>
        {loadingGroups ? (
          <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-400">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-teal-500" />
            Loading groups…
          </div>
        ) : groups.length === 0 ? (
          <p className="px-4 py-3 text-sm text-slate-400">No groups found. Create a group first.</p>
        ) : (
          <select
            className={inputClass}
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            required
          >
            <option value="">Select a group…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
      </label>

      {/* Paid by */}
      <label className="grid gap-1.5">
        <span className="text-sm font-semibold text-slate-700">Paid by</span>
        {loadingMembers ? (
          <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-400">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-teal-500" />
            Loading members…
          </div>
        ) : members.length === 0 ? (
          <p className="px-4 py-3 text-sm text-slate-400">
            {groupId ? 'No members in this group.' : 'Select a group first.'}
          </p>
        ) : (
          <select
            className={inputClass}
            value={paidById}
            onChange={(e) => setPaidById(e.target.value)}
            required
          >
            <option value="">Select who paid…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.email})
              </option>
            ))}
          </select>
        )}
      </label>

      {/* Split participants */}
      {members.length > 0 && (
        <div className="col-span-full grid gap-2">
          <span className="text-sm font-semibold text-slate-700">Split between</span>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => {
              const isSelected = selectedParticipants.includes(m.id)
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleParticipant(m.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                    isSelected
                      ? 'border-teal-300 bg-teal-50 text-teal-700 shadow-sm'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span
                    className={`inline-flex h-4 w-4 items-center justify-center rounded-sm text-[10px] ${
                      isSelected ? 'bg-teal-600 text-white' : 'border border-slate-300 bg-white'
                    }`}
                  >
                    {isSelected && '✓'}
                  </span>
                  {m.name}
                </button>
              )
            })}
          </div>
          {selectedParticipants.length > 0 && amount && (
            <p className="text-xs text-slate-400">
              ≈ ₹{(Number(amount) / selectedParticipants.length).toFixed(2)} per person
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="col-span-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {/* Hidden submit for form ID */}
      <button type="submit" className="hidden" />

      {/* Save button visible in footer */}
      <div className="col-span-full flex justify-end pt-1">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={saving || loadingGroups || loadingMembers}
        >
          {saving ? 'Saving…' : 'Save Expense'}
        </button>
      </div>
    </form>
  )
}
