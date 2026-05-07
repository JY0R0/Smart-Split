import React from 'react'

export default function GroupCard({ name, members, balance, status = 'active', accent = 'teal', onClick }) {
  const isDefunct = status === 'defunct'

  return (
    <article
      className={`group-card accent-${accent}${onClick ? ' cursor-pointer' : ''}${isDefunct ? ' opacity-80' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick() } : undefined}
    >
      <div className="group-card-head">
        <h3>{name}</h3>
        <div className="flex items-center gap-2">
          {isDefunct && <span className="pill">Defunct</span>}
          <span className="pill">{members} {members === 1 ? 'member' : 'members'}</span>
        </div>
      </div>

      <p className="group-balance">{balance}</p>
    </article>
  )
}
