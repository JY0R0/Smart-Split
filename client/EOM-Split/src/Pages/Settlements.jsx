import React, { useEffect, useState, useCallback, useRef } from 'react'
import apiClient from '../services/apiClient'
import { useAuth } from '../context/AuthContext'

function resolveProofUrl(proofUrl) {
  if (!proofUrl) return ''
  if (/^https?:\/\//i.test(proofUrl) || proofUrl.startsWith('data:')) return proofUrl

  const apiBaseUrl = apiClient.defaults.baseURL || ''
  const uploadsBaseUrl = apiBaseUrl.replace(/\/api\/?$/, '')
  return `${uploadsBaseUrl}${proofUrl}`
}

export default function Settlements() {
  const { user } = useAuth()
  const [settlements, setSettlements] = useState([])
  const [claims, setClaims] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedKey, setExpandedKey] = useState(null)
  const [settlingKey, setSettlingKey] = useState(null)
  const [claimActionKey, setClaimActionKey] = useState(null)
  const [error, setError] = useState('')
  const claimFileInputRef = useRef(null)
  const [pendingClaimTarget, setPendingClaimTarget] = useState(null)

  const loadSettlements = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const [settlementsRes, claimsRes, historyRes] = await Promise.all([
        apiClient.get('/user/settlements'),
        apiClient.get('/user/claims'),
        apiClient.get('/user/settlement-history'),
      ])
      const { data } = settlementsRes
      setSettlements(data.settlements || [])
      setClaims(claimsRes.data.claims || [])
      setHistory(historyRes.data.history || [])
    } catch {
      setSettlements([])
      setClaims([])
      setHistory([])
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

  function openClaimFilePicker(settlement) {
    if (settlement.direction !== 'you_owe') {
      setError('Only the payer can create a payment claim. Use the pending claim card to approve it.')
      return
    }

    const directionLabel =
      settlement.direction === 'you_owe'
        ? `You owe ${settlement.otherUserName} ₹${settlement.totalAmount.toFixed(2)}`
        : `${settlement.otherUserName} owes you ₹${settlement.totalAmount.toFixed(2)}`

    const confirmed = window.confirm(
      `${directionLabel}\nGroup: ${settlement.groupName}\n\nChoose a screenshot/photo to upload for this claim. The recipient will approve it next.`
    )

    if (!confirmed) return

    setPendingClaimTarget(settlement)
    claimFileInputRef.current?.click()
  }

  async function submitClaimWithFile(file) {
    if (!pendingClaimTarget || !file) {
      setPendingClaimTarget(null)
      return
    }

    setSettlingKey(getKey(pendingClaimTarget))

    try {
      const proofDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('Failed to read image file.'))
        reader.readAsDataURL(file)
      })

      await apiClient.post(`/groups/${pendingClaimTarget.groupId}/claim`, {
        withUserId: pendingClaimTarget.otherUserId,
        proof: proofDataUrl,
      })

      alert('Payment claim created. The recipient must approve to record the settlement.')
      loadSettlements()
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to create payment claim.')
    } finally {
      setPendingClaimTarget(null)
      setSettlingKey(null)
    }
  }

  async function handleSettle(settlement) {
    openClaimFilePicker(settlement)
  }

  async function handleClaimAction(claim, action) {
    const key = `claim-${claim.id}`
    setClaimActionKey(key)
    try {
      await apiClient.post(`/claims/${claim.id}/${action}`)
      await loadSettlements()
    } catch (err) {
      setError(err?.response?.data?.message || `Failed to ${action} claim.`)
    } finally {
      setClaimActionKey(null)
    }
  }

  const youOwe = settlements.filter((s) => s.direction === 'you_owe')
  const theyOwe = settlements.filter((s) => s.direction === 'they_owe')
  const pendingClaims = claims.filter((claim) => claim.status === 'pending')

  const totalYouOwe = youOwe.reduce((sum, s) => sum + s.totalAmount, 0)
  const totalTheyOwe = theyOwe.reduce((sum, s) => sum + s.totalAmount, 0)

  return (
    <section className="mx-auto flex max-w-7xl flex-col gap-6">
      <input
        ref={claimFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          submitClaimWithFile(file)
        }}
      />
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
        <div className="space-y-6">
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/50 py-16">
            <span className="text-5xl">🤝</span>
            <div className="text-center">
              <p className="text-base font-semibold text-slate-700">All settled up!</p>
              <p className="mt-1 text-sm text-slate-400">No outstanding balances with anyone.</p>
            </div>
          </div>

          {pendingClaims.length > 0 && <PendingClaimsPanel claims={pendingClaims} currentUserId={user?.id} onAction={handleClaimAction} claimActionKey={claimActionKey} />}
        </div>
      ) : (
        <div className="space-y-6">
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

          <PendingClaimsPanel claims={pendingClaims} currentUserId={user?.id} onAction={handleClaimAction} claimActionKey={claimActionKey} />
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

      {/* Settlement History */}
      {!loading && history.length > 0 && (
        <div className="rounded-2xl border border-slate-200/60 bg-white/80 p-5 shadow-sm backdrop-blur-sm">
          <div className="mb-4">
            <p className="section-kicker">History</p>
            <h2 className="text-lg font-bold text-slate-900">Past settlements</h2>
          </div>

          <div className="space-y-3">
            {history.map((settlement) => {
              const date = new Date(settlement.createdAt);
              const formattedDate = date.toLocaleDateString('en-IN', { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
              });
              const formattedTime = date.toLocaleTimeString('en-IN', { 
                hour: '2-digit', 
                minute: '2-digit' 
              });
              const isPaid = settlement.direction === 'paid';

              return (
                <div
                  key={settlement.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 transition-all hover:bg-slate-100/50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`inline-flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold ${
                      isPaid 
                        ? 'bg-blue-50 text-blue-600' 
                        : 'bg-purple-50 text-purple-600'
                    }`}>
                      {isPaid ? '→' : '←'}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {isPaid ? `Paid ${settlement.otherPerson}` : `Received from ${settlement.otherPerson}`}
                        </p>
                        <span className="text-xs text-slate-500 whitespace-nowrap">
                          {settlement.groupName}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        {formattedDate} at {formattedTime}
                      </p>
                    </div>
                  </div>
                  <strong className={`shrink-0 text-lg font-bold ${
                    isPaid ? 'text-blue-600' : 'text-purple-600'
                  }`}>
                    {isPaid ? '−' : '+'}₹{settlement.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </strong>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

function PendingClaimsPanel({ claims, currentUserId, onAction, claimActionKey }) {
  if (!claims.length) return null

  return (
    <div className="rounded-2xl border border-amber-200/70 bg-amber-50/70 p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="section-kicker">Pending Claims</p>
          <h2 className="text-lg font-bold text-amber-950">Claims waiting for approval</h2>
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-700">
          {claims.length} pending
        </span>
      </div>

      <div className="space-y-3">
        {claims.map((claim) => {
          const isReceiver = claim.receiverId === currentUserId
          const canAct = isReceiver && claim.status === 'pending'

          return (
            <div key={claim.id} className="rounded-2xl border border-amber-200 bg-white px-4 py-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {claim.payerName} → {claim.receiverName}
                    </p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                      {claim.status}
                    </span>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      {claim.groupId ? `Group #${claim.groupId}` : 'No group'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    Amount: ₹{Number(claim.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                  {claim.proofUrl && (
                    <a
                      className="mt-2 inline-flex text-sm font-medium text-teal-700 underline-offset-2 hover:underline"
                      href={resolveProofUrl(claim.proofUrl)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View payment proof
                    </a>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {canAct ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={claimActionKey === `claim-${claim.id}`}
                        onClick={() => onAction(claim, 'approve')}
                      >
                        {claimActionKey === `claim-${claim.id}` ? 'Working…' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        disabled={claimActionKey === `claim-${claim.id}`}
                        onClick={() => onAction(claim, 'reject')}
                      >
                        Reject
                      </button>
                    </>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-500">
                      {isReceiver ? 'Pending your approval' : 'Waiting for receiver'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Settlement Card Component ── */

function SettlementCard({ settlement, expanded, settling, currentUserName, onToggle, onSettle }) {
  const s = settlement
  const isYouOwe = s.direction === 'you_owe'
  const accentColor = isYouOwe ? 'red' : 'emerald'
  const settleLabel = isYouOwe ? (settling ? 'Uploading…' : 'Upload Photo & Claim') : 'Not a claim action'

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
              disabled={settling || !isYouOwe}
              onClick={(e) => {
                e.stopPropagation()
                onSettle()
              }}
            >
              {settleLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
