import React from 'react'

export default function ExpenseCard({ title, amount, groupName, paidByName, date, category }) {
  return (
    <article className="expense-card">
      <div className="expense-card-top">
        <div>
          {category && <span className="pill">{category}</span>}
          <h3>{title}</h3>
        </div>
        <strong className="text-lg font-bold text-slate-900">₹{Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
      </div>

      <p className="muted">Group: {groupName}</p>
      <p className="muted">Paid by {paidByName}</p>
      {date && <p className="muted">{date}</p>}
    </article>
  )
}
