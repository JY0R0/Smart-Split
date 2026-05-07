import React from 'react'

export default function ExpenseCard({ id, title, amount, groupName, paidByName, date, category, photoUrl, onEdit }) {
  return (
    <article className="expense-card">
      {photoUrl && (
        <img
          src={photoUrl.startsWith('/uploads') ? `http://127.0.0.1:5000${photoUrl}` : photoUrl}
          alt={title}
          className="mb-3 max-h-40 w-full rounded-lg object-cover"
        />
      )}
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
      
      {onEdit && (
        <button
          type="button"
          onClick={() => onEdit(id)}
          className="mt-3 inline-flex items-center gap-1 rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-100"
        >
          ✏️ Edit
        </button>
      )}
    </article>
  )
}
