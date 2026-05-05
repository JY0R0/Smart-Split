import React, { useEffect, useState } from 'react'
import apiClient from '../services/apiClient'
import GroupCard from '../components/GroupCard'
import Modal from '../components/Modal'

const ACCENTS = ['teal', 'amber', 'indigo']

export default function Groups() {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)

  // Create group modal
  const [createOpen, setCreateOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [savingGroup, setSavingGroup] = useState(false)
  const [createError, setCreateError] = useState('')

  // Group detail / member management
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [groupDetail, setGroupDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)

  // Add member
  const [memberEmail, setMemberEmail] = useState('')
  const [addingMember, setAddingMember] = useState(false)
  const [memberError, setMemberError] = useState('')
  const [memberSuccess, setMemberSuccess] = useState('')

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

    setSavingGroup(true)
    setCreateError('')

    try {
      await apiClient.post('/groups', { name: newGroupName.trim() })
      setNewGroupName('')
      setCreateOpen(false)
      loadGroups()
    } catch (err) {
      setCreateError(err?.response?.data?.message || 'Failed to create group.')
    } finally {
      setSavingGroup(false)
    }
  }

  async function openGroupDetail(group) {
    setSelectedGroup(group)
    setDetailOpen(true)
    setMemberEmail('')
    setMemberError('')
    setMemberSuccess('')
    setDetailLoading(true)

    try {
      const { data } = await apiClient.get(`/groups/${group.id}`)
      setGroupDetail(data.group)
    } catch {
      setGroupDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  function closeDetail() {
    setDetailOpen(false)
    setSelectedGroup(null)
    setGroupDetail(null)
    setMemberEmail('')
    setMemberError('')
    setMemberSuccess('')
  }

  async function handleAddMember(e) {
    e.preventDefault()
    if (!memberEmail.trim() || !selectedGroup) return

    setAddingMember(true)
    setMemberError('')
    setMemberSuccess('')

    try {
      const { data } = await apiClient.post(`/groups/${selectedGroup.id}/members`, {
        email: memberEmail.trim().toLowerCase(),
      })
      setMemberSuccess(`${data.member?.name || memberEmail} added successfully!`)
      setMemberEmail('')

      // Refresh group detail to show new member
      const { data: refreshed } = await apiClient.get(`/groups/${selectedGroup.id}`)
      setGroupDetail(refreshed.group)

      // Also refresh groups list for member count
      loadGroups()
    } catch (err) {
      setMemberError(err?.response?.data?.message || 'Failed to add member.')
    } finally {
      setAddingMember(false)
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

        <button type="button" className="btn btn-primary w-full lg:w-auto" onClick={() => setCreateOpen(true)}>
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
              members={group.memberCount || 1}
              balance={`Created by ${group.createdBy?.name || 'You'}`}
              accent={ACCENTS[index % ACCENTS.length]}
              onClick={() => openGroupDetail(group)}
            />
          ))}
        </div>
      )}

      {/* Create Group Modal */}
      <Modal
        title="Create Group"
        open={createOpen}
        onClose={() => { setCreateOpen(false); setCreateError('') }}
        footer={
          <button type="submit" form="create-group-form" className="btn btn-primary" disabled={savingGroup}>
            {savingGroup ? 'Creating…' : 'Create Group'}
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
          {createError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {createError}
            </div>
          )}
        </form>
      </Modal>

      {/* Group Detail / Member Management Modal */}
      <Modal
        title={selectedGroup?.name || 'Group Details'}
        open={detailOpen}
        onClose={closeDetail}
      >
        {detailLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-teal-600" />
          </div>
        ) : !groupDetail ? (
          <p className="py-4 text-sm text-slate-500">Failed to load group details.</p>
        ) : (
          <div className="grid gap-5">
            {/* Members list */}
            <div className="grid gap-2">
              <h4 className="text-sm font-semibold text-slate-700">
                Members ({groupDetail.members?.length || 0})
              </h4>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {(groupDetail.members || []).map((member) => (
                  <div key={member.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-teal-50 text-xs font-bold text-teal-700">
                      {(member.name || 'U').charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{member.name}</p>
                      <p className="truncate text-xs text-slate-400">{member.email}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Add member form */}
            <form onSubmit={handleAddMember} className="grid gap-3">
              <h4 className="text-sm font-semibold text-slate-700">Add a Member</h4>
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm outline-none transition-all placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-100"
                  type="email"
                  placeholder="Enter member's email…"
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  required
                />
                <button
                  type="submit"
                  className="btn btn-primary shrink-0"
                  disabled={addingMember || !memberEmail.trim()}
                >
                  {addingMember ? 'Adding…' : 'Add'}
                </button>
              </div>
              {memberError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {memberError}
                </div>
              )}
              {memberSuccess && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                  {memberSuccess}
                </div>
              )}
            </form>

            {/* Group expenses summary */}
            {groupDetail.expenses && groupDetail.expenses.length > 0 && (
              <div className="grid gap-2">
                <h4 className="text-sm font-semibold text-slate-700">
                  Expenses ({groupDetail.expenses.length})
                </h4>
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                  {groupDetail.expenses.slice(0, 5).map((expense) => (
                    <div key={expense.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{expense.title}</p>
                        <p className="text-xs text-slate-400">Paid by {expense.paidByName}</p>
                      </div>
                      <strong className="text-sm font-bold text-slate-900">
                        ₹{Number(expense.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </section>
  )
}
