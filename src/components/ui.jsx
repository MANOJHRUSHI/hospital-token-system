import { useState, useEffect } from 'react'

const STYLES = {
  waiting:         'bg-amber-100 text-amber-800 ring-amber-200',
  called:          'bg-emerald-100 text-emerald-800 ring-emerald-200',
  in_consultation: 'bg-sky-100 text-sky-800 ring-sky-200',
  completed:       'bg-slate-100 text-slate-600 ring-slate-200',
  skipped:         'bg-orange-100 text-orange-800 ring-orange-200',
  cancelled:       'bg-rose-100 text-rose-700 ring-rose-200',
}

const LABELS = {
  waiting: 'Waiting',
  called: 'Called',
  in_consultation: 'In consultation',
  completed: 'Completed',
  skipped: 'Skipped',
  cancelled: 'Cancelled',
}

export function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[status] || 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
      {LABELS[status] || status}
    </span>
  )
}

export function PriorityBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white shadow-xs">
      Emergency
    </span>
  )
}

export function RoleBadge({ role }) {
  const roleStyles = {
    admin: 'bg-purple-100 text-purple-800 ring-purple-200',
    doctor: 'bg-teal-100 text-teal-800 ring-teal-200',
    receptionist: 'bg-sky-100 text-sky-800 ring-sky-200',
    patient: 'bg-slate-100 text-slate-700 ring-slate-200',
  }
  const roleLabels = {
    admin: 'Administrator',
    doctor: 'Doctor',
    receptionist: 'Receptionist',
    patient: 'Patient',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${roleStyles[role] || 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
      {roleLabels[role] || role}
    </span>
  )
}

export function Card({ className = '', children, ...props }) {
  return <div className={`rounded-2xl bg-white p-5 shadow-xs ring-1 ring-slate-200/80 transition-shadow hover:shadow-sm ${className}`} {...props}>{children}</div>
}

export function ErrorBanner({ message, onClose }) {
  if (!message) return null
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200" role="alert">
      <div className="flex items-start gap-2">
        <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span>{message}</span>
      </div>
      {onClose && (
        <button type="button" onClick={onClose} className="font-semibold text-red-700 hover:text-red-900 focus:outline-none" aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  )
}

export function SuccessBanner({ message, onClose }) {
  if (!message) return null
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200" role="status">
      <div className="flex items-start gap-2">
        <svg className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <span>{message}</span>
      </div>
      {onClose && (
        <button type="button" onClick={onClose} className="font-semibold text-emerald-700 hover:text-emerald-900 focus:outline-none" aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  )
}

export function Btn({ variant = 'primary', className = '', ...props }) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50'
  const variants = {
    primary: 'bg-teal-600 text-white hover:bg-teal-700 focus:ring-teal-500 shadow-xs',
    secondary: 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 focus:ring-slate-400',
    danger: 'bg-white text-rose-700 ring-1 ring-rose-300 hover:bg-rose-50 focus:ring-rose-400',
    dangerSolid: 'bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-500 shadow-xs',
    warn: 'bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-400 shadow-xs',
    dark: 'bg-slate-800 text-white hover:bg-slate-900 focus:ring-slate-600 shadow-xs',
    subtle: 'text-slate-600 hover:bg-slate-100 focus:ring-slate-300',
  }
  return <button className={`${base} ${variants[variant] || variants.primary} ${className}`} {...props} />
}

export const inputCls =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-200 disabled:bg-slate-100 disabled:cursor-not-allowed'

export function Field({ label, hint, error, children }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between">
        <span className="block text-xs font-medium text-slate-600">{label}</span>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </div>
      {children}
      {error && <span className="mt-1 block text-xs text-rose-600">{error}</span>}
    </label>
  )
}

export function PasswordInput({
  value,
  onChange,
  placeholder = '••••••••',
  required = false,
  minLength = 6,
  id,
  name,
  disabled = false,
  autoComplete,
  className = '',
  ...props
}) {
  const [show, setShow] = useState(false)

  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        id={id}
        name={name}
        disabled={disabled}
        autoComplete={autoComplete}
        className={`${inputCls} pr-10 ${className}`}
        {...props}
      />
      <button
        type="button"
        tabIndex={0}
        onClick={() => setShow((s) => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500"
        aria-label={show ? 'Hide password' : 'Show password'}
        title={show ? 'Hide password' : 'Show password'}
      >
        {show ? (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
          </svg>
        ) : (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        )}
      </button>
    </div>
  )
}

export function Modal({ isOpen, onClose, title, subtitle, children, maxWidth = 'max-w-lg' }) {
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Modal Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`relative z-10 w-full ${maxWidth} rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200/80 transition-all max-h-[90vh] overflow-y-auto`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 id="modal-title" className="text-lg font-semibold text-slate-900">
              {title}
            </h3>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500"
            aria-label="Close dialog"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  )
}

export function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', confirmVariant = 'dangerSolid', busy = false }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-md">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{message}</p>
        <div className="flex justify-end gap-3 pt-2">
          <Btn variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
          <Btn variant={confirmVariant} onClick={onConfirm} disabled={busy}>
            {busy ? 'Processing…' : confirmText}
          </Btn>
        </div>
      </div>
    </Modal>
  )
}

export function Loading({ text = 'Loading…' }) {
  return (
    <div className="py-12 text-center text-sm text-slate-500">
      <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      {text}
    </div>
  )
}

// Validation helpers
export { validateIndianPhone, validatePassword } from '../lib/validation.js'

