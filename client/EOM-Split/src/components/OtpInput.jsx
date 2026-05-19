import React, { useRef } from 'react'

/**
 * OtpInput — six individual digit boxes with auto-advance, backspace, and paste support.
 * Props:
 *   length   {number}   — number of boxes (default 6)
 *   value    {string}   — current OTP string (controlled)
 *   onChange {function} — called with the new string on every change
 *   disabled {boolean}  — disables all boxes
 */
export default function OtpInput({ length = 6, value = '', onChange, disabled = false }) {
  const inputs = useRef([])
  const digits = value.split('').concat(Array(length).fill('')).slice(0, length)

  function handleChange(index, e) {
    const raw = e.target.value.replace(/\D/g, '')
    if (!raw) return
    const next = [...digits]
    next[index] = raw[raw.length - 1]
    onChange(next.join(''))
    if (index < length - 1) inputs.current[index + 1]?.focus()
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace') {
      const next = [...digits]
      if (next[index]) {
        next[index] = ''
        onChange(next.join(''))
      } else if (index > 0) {
        inputs.current[index - 1]?.focus()
        next[index - 1] = ''
        onChange(next.join(''))
      }
    }
  }

  function handlePaste(e) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    const padded = pasted.padEnd(length, '').slice(0, length)
    onChange(padded)
    const focusIdx = Math.min(pasted.length, length - 1)
    inputs.current[focusIdx]?.focus()
  }

  return (
    <div className="flex justify-center gap-2 sm:gap-3">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => (inputs.current[i] = el)}
          id={`otp-box-${i}`}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          disabled={disabled}
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          className="h-14 w-11 rounded-xl border border-slate-200 bg-slate-50/50 text-center text-xl font-bold text-slate-900 outline-none transition-all duration-200 focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-12"
        />
      ))}
    </div>
  )
}
