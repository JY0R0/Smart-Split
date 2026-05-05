import React from 'react'

export default function GroupCard({ name, members, balance, accent = 'teal', onClick }) {
  return (
    <article
      className={`group-card accent-${accent}${onClick ? ' cursor-pointer' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick() } : undefined}
    >
      <div className="group-card-head">
        <h3>{name}</h3>
        <span className="pill">{members} {members === 1 ? 'member' : 'members'}</span>
      </div>

      <p className="group-balance">{balance}</p>
    </article>
  )
}
