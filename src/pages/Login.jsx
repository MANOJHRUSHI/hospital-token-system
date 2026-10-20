import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth, ROLE_HOME } from '../context/AuthContext'
import {
  Btn,
  Card,
  ErrorBanner,
  Field,
  PasswordInput,
  inputCls,
  validateIndianPhone,
  validatePassword,
} from '../components/ui'
import Footer from '../components/Footer'

export default function Login() {
  const { session, profile, signIn, signUp } = useAuth()
  const [mode, setMode] = useState('signin')
  const [form, setForm] = useState({ fullName: '', phone: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  if (session && profile) return <Navigate to={ROLE_HOME[profile.role]} replace />

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handlePhoneChange = (e) => {
    // Only accept numeric digits and prevent entering more than 10 digits
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 10)
    setForm((f) => ({ ...f, phone: cleaned }))
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    setNotice('')

    // Minimum password length validation (Rule C)
    if (!validatePassword(form.password)) {
      setError('Password must be at least 6 characters long.')
      return
    }

    // Patient phone number validation (Rule B)
    if (mode === 'signup') {
      const cleanPhone = form.phone.trim()
      if (!cleanPhone) {
        setError('Phone number is required.')
        return
      }
      if (!validateIndianPhone(cleanPhone)) {
        setError('Please enter a valid 10-digit Indian mobile number (e.g. 9876543210).')
        return
      }
    }

    setBusy(true)
    try {
      if (mode === 'signin') {
        await signIn(form.email.trim(), form.password)
      } else {
        const { needsConfirmation } = await signUp({
          email: form.email.trim(),
          password: form.password,
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
        })
        if (needsConfirmation) {
          setNotice('Account created successfully! Check your email to confirm it, then sign in.')
          setMode('signin')
        }
      }
    } catch (err) {
      setError(err.message || 'An error occurred during authentication.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-between bg-slate-50">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-13 w-13 items-center justify-center rounded-2xl bg-teal-600 text-2xl font-bold text-white shadow-md">
            +
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Hospital Token System</h1>
          <p className="mt-1 text-sm text-slate-500">Skip the crowd. Know your turn in real time.</p>
        </div>

        <Card className="shadow-md">
          <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-medium">
            {[
              ['signin', 'Sign in'],
              ['signup', 'New patient'],
            ].map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m)
                  setError('')
                  setNotice('')
                }}
                className={`rounded-lg py-2 transition-all ${
                  mode === m ? 'bg-white font-semibold text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'signup' && (
              <>
                <Field label="Full name">
                  <input
                    className={inputCls}
                    required
                    placeholder="e.g. Rahul Sharma"
                    value={form.fullName}
                    onChange={set('fullName')}
                  />
                </Field>
                <Field label="Phone number" hint="10-digit Indian mobile number">
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-xs font-semibold text-slate-500 select-none">+91</span>
                    <input
                      className={`${inputCls} pl-11`}
                      type="tel"
                      inputMode="numeric"
                      required
                      placeholder="9876543210"
                      maxLength={10}
                      value={form.phone}
                      onChange={handlePhoneChange}
                    />
                  </div>
                </Field>
              </>
            )}

            <Field label="Email address">
              <input
                className={inputCls}
                type="email"
                required
                placeholder="name@example.com"
                value={form.email}
                onChange={set('email')}
                autoComplete="email"
              />
            </Field>

            <Field label="Password" hint="Minimum 6 characters">
              <PasswordInput
                required
                minLength={6}
                value={form.password}
                onChange={set('password')}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
            </Field>

            <ErrorBanner message={error} onClose={() => setError('')} />

            {notice && (
              <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
                {notice}
              </div>
            )}

            <Btn type="submit" disabled={busy} className="w-full !py-2.5">
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create patient account'}
            </Btn>
          </form>
        </Card>

        <p className="text-center text-xs text-slate-400">
          Staff and administration accounts must sign in using their issued credentials.
        </p>
      </div>
    </div>
    <Footer />
  </div>
  )
}
