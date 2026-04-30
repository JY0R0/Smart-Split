import React from 'react'

export default function GroupCard({ name, members, balance, accent = 'teal' }) {
  return (
    <article className={`group-card accent-${accent}`}>
      <div className="group-card-head">
        <h3>{name}</h3>
        <span className="pill">{members} members</span>
      </div>

      <p className="group-balance">{balance}</p>
    </article>
  )
}
