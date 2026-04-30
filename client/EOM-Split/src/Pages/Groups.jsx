import React, { useEffect, useState } from 'react'
import apiClient from '../services/apiClient'
import GroupCard from '../components/GroupCard'
import Modal from '../components/Modal'

const ACCENTS = ['teal', 'amber', 'indigo']

export default function Groups() {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function loadGroups() {
    try {
      setLoading(true)
      const { data } = await apiClient.get('/groups')
      setGroups(data.groups || [])
    } catch {
      setGroups([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadGroups()
  }, [])

  async function handleCreateGroup(e) {
    e.preventDefault()
    if (!newGroupName.trim()) return

    setSaving(true)
    setError('')

    try {
      await apiClient.post('/groups', { name: newGroupName.trim() })
      setNewGroupName('')
      setOpen(false)
      loadGroups()
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to create group.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mx-auto flex max-w-7xl flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/60 bg-white/80 p-5 shadow-sm backdrop-blur-sm lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <p className="section-kicker">Workspace</p>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Groups</h1>
          <p className="max-w-2xl text-sm text-slate-500">Keep every trip, house, or team expense in one place.</p>
        </div>

        <button type="button" className="btn btn-primary w-full lg:w-auto" onClick={() => setOpen(true)}>
          + Create Group
        </button>
      </div>

      {/* Groups grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-slate-200 border-t-teal-600" />
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/50 py-16">
          <span className="text-4xl">👥</span>
          <p className="text-sm font-medium text-slate-500">No groups yet — create one to get started!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group, index) => (
            <GroupCard
              key={group.id}
              name={group.name}
              members={group.createdBy ? 1 : 0}
              balance={`Created by ${group.createdBy?.name || 'You'}`}
              accent={ACCENTS[index % ACCENTS.length]}
            />
          ))}
        </div>
      )}

      {/* Create Group Modal */}
      <Modal
        title="Create Group"
        open={open}
        onClose={() => { setOpen(false); setError('') }}
        footer={
          <button type="submit" form="create-group-form" className="btn btn-primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create Group'}
          </button>
        }
      >
        <form id="create-group-form" onSubmit={handleCreateGroup} className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-slate-700">Group name</span>
            <input
              className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm outline-none transition-all placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-100"
              type="text"
              placeholder="Weekend Trip, Flatmates…"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              required
              autoFocus
            />
          </label>
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </div>
          )}
        </form>
      </Modal>
    </section>
  )
}
