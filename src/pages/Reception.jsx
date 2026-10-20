import { useMemo, useState } from 'react'
import Layout from '../components/Layout'
import { Btn, Card, ErrorBanner, Field, inputCls, Loading, StatusBadge, PriorityBadge, validateIndianPhone } from '../components/ui'
import { useAction, useLive } from '../hooks/useLive'
import {
  avgMinutesFor,
  cancelToken,
  createToken,
  fetchDepartments,
  fetchDoctors,
  fetchTodayTokens,
  fmtTime,
  nowServing,
  queueOrder,
  requeueToken,
  setPriority,
} from '../lib/api'

export default function Reception() {
  const { data, error, live, reload } = useLive(async () => {
    const [doctors, departments, tokens] = await Promise.all([fetchDoctors(), fetchDepartments(), fetchTodayTokens()])
    return { doctors, departments, tokens }
  }, [])

  return (
    <Layout title="Reception dashboard" live={live}>
      <ErrorBanner message={error} />
      {!data ? <Loading /> : <ReceptionBody data={data} reload={reload} />}
    </Layout>
  )
}

function ReceptionBody({ data, reload }) {
  const { doctors, departments, tokens } = data
  const [deptFilter, setDeptFilter] = useState('all')
  const [search, setSearch] = useState('')

  const stats = useMemo(() => {
    const waits = tokens
      .filter((t) => t.called_at)
      .map((t) => (new Date(t.called_at) - new Date(t.created_at)) / 60000)
    return {
      total: tokens.length,
      waiting: tokens.filter((t) => t.status === 'waiting').length,
      inProgress: tokens.filter((t) => t.status === 'called' || t.status === 'in_consultation').length,
      completed: tokens.filter((t) => t.status === 'completed').length,
      avgWait: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null,
    }
  }, [tokens])

  const q = search.trim().toLowerCase().replace('#', '')
  const matches = (t) =>
    !q ||
    String(t.token_number) === q ||
    t.details?.patient_name?.toLowerCase().includes(q) ||
    t.details?.patient_phone?.toLowerCase().includes(q)

  const visibleDoctors = doctors.filter((d) => deptFilter === 'all' || String(d.departmentId) === deptFilter)

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Tokens today" value={stats.total} />
        <StatCard label="Waiting" value={stats.waiting} tone="amber" />
        <StatCard label="In progress" value={stats.inProgress} tone="sky" />
        <StatCard label="Completed" value={stats.completed} tone="emerald" />
        <StatCard label="Avg wait" value={stats.avgWait === null ? '-' : `${stats.avgWait} min`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <WalkInForm doctors={doctors} departments={departments} onCreated={reload} />

        <div className="space-y-4 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-2">
              <Chip active={deptFilter === 'all'} onClick={() => setDeptFilter('all')}>
                All
              </Chip>
              {departments.map((d) => (
                <Chip key={d.id} active={deptFilter === String(d.id)} onClick={() => setDeptFilter(String(d.id))}>
                  {d.name}
                </Chip>
              ))}
            </div>
            <input
              className={`${inputCls} !w-56 sm:ml-auto`}
              placeholder="Search token, name or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {visibleDoctors.map((d) => (
            <DoctorQueue key={d.id} doctor={d} tokens={tokens} matches={matches} onChange={reload} />
          ))}
        </div>
      </div>
    </>
  )
}

function StatCard({ label, value, tone }) {
  const tones = {
    amber: 'text-amber-600',
    sky: 'text-sky-600',
    emerald: 'text-emerald-600',
  }
  return (
    <Card className="!p-4">
      <div className={`text-2xl font-bold ${tones[tone] || ''}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </Card>
  )
}

function Chip({ active, ...props }) {
  return (
    <button
      className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition ${
        active ? 'bg-teal-600 text-white ring-teal-600' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'
      }`}
      {...props}
    />
  )
}

function WalkInForm({ doctors, departments, onCreated }) {
  const [form, setForm] = useState({ name: '', phone: '', deptId: '', doctorId: '', priority: false })
  const [created, setCreated] = useState(null)
  const { run, busy, error, clearError } = useAction()
  const list = doctors.filter((d) => String(d.departmentId) === String(form.deptId))
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handlePhoneChange = (e) => {
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 10)
    setForm((f) => ({ ...f, phone: cleaned }))
  }

  return (
    <Card className="h-fit space-y-3">
      <h2 className="text-lg font-semibold">New walk-in token</h2>
      <Field label="Patient name">
        <input className={inputCls} placeholder="Patient's full name" value={form.name} onChange={set('name')} />
      </Field>
      <Field label="Phone number" hint="10-digit Indian mobile (optional)">
        <div className="relative flex items-center">
          <span className="absolute left-3 text-xs font-semibold text-slate-500 select-none">+91</span>
          <input
            className={`${inputCls} pl-11`}
            type="tel"
            inputMode="numeric"
            placeholder="9876543210"
            maxLength={10}
            value={form.phone}
            onChange={handlePhoneChange}
          />
        </div>
      </Field>
      <Field label="Department">
        <select className={inputCls} value={form.deptId} onChange={(e) => setForm((f) => ({ ...f, deptId: e.target.value, doctorId: '' }))}>
          <option value="">Select department</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Doctor">
        <select className={inputCls} value={form.doctorId} onChange={set('doctorId')} disabled={!form.deptId}>
          <option value="">Select doctor</option>
          {list.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.isAvailable ? '' : ' (on break)'}
            </option>
          ))}
        </select>
      </Field>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={form.priority}
          onChange={(e) => setForm((f) => ({ ...f, priority: e.target.checked }))}
          className="h-4 w-4 rounded border-slate-300 text-red-600"
        />
        Emergency (move to front of the queue)
      </label>

      <ErrorBanner message={error} onClose={clearError} />
      {created && (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
          Token <span className="text-lg font-bold">#{created.token_number}</span> created. Tell the patient their number.
        </div>
      )}
      <Btn
        className="w-full"
        disabled={busy || !form.name.trim() || !form.doctorId}
        onClick={() => {
          if (form.phone && !validateIndianPhone(form.phone)) {
            alert('Please enter a valid 10-digit Indian mobile number.')
            return
          }
          run(async () => {
            const t = await createToken(form.doctorId, {
              name: form.name.trim(),
              phone: form.phone ? form.phone.trim() : null,
              priority: form.priority,
            })
            setCreated(t)
            setForm((f) => ({ ...f, name: '', phone: '', priority: false }))
            await onCreated()
          })
        }}
      >
        {busy ? 'Creating…' : 'Create token'}
      </Btn>
    </Card>
  )
}

function DoctorQueue({ doctor, tokens, matches, onChange }) {
  const mine = tokens.filter((t) => t.doctor_id === doctor.id)
  const serving = nowServing(tokens, doctor.id)
  const waiting = mine.filter((t) => t.status === 'waiting').sort(queueOrder).filter(matches)
  const skipped = mine.filter((t) => t.status === 'skipped').filter(matches)
  const completed = mine.filter((t) => t.status === 'completed').length
  const { run, busy, error, clearError } = useAction()

  const act = (fn) => run(async () => { await fn(); await onChange() })

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${doctor.isAvailable ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className="font-semibold">{doctor.name}</span>
          </div>
          <div className="text-xs text-slate-500">
            {doctor.departmentName} · {doctor.isAvailable ? 'Available' : 'On break'} · avg {avgMinutesFor(tokens, doctor)} min
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-500">
            Now serving:{' '}
            <span className="font-semibold text-slate-800">{serving ? `#${serving.token_number}` : '-'}</span>
          </span>
          <span className="text-slate-500">
            Done: <span className="font-semibold text-slate-800">{completed}</span>
          </span>
        </div>
      </div>

      <ErrorBanner message={error} onClose={clearError} />

      {waiting.length === 0 && skipped.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No one waiting.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
          {waiting.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <div className="flex items-center gap-3">
                <span className="w-10 text-lg font-bold text-teal-700">#{t.token_number}</span>
                <div>
                  <div className="text-sm font-medium">{t.details?.patient_name || 'Patient'}</div>
                  <div className="text-xs text-slate-400">
                    {t.details?.patient_phone || 'no phone'} · booked {fmtTime(t.created_at)}
                  </div>
                </div>
                {t.is_priority && <PriorityBadge />}
              </div>
              <div className="flex gap-2">
                <Btn
                  variant={t.is_priority ? 'secondary' : 'warn'}
                  className="!px-3 !py-1.5 !text-xs"
                  disabled={busy}
                  onClick={() => act(() => setPriority(t.id, !t.is_priority))}
                >
                  {t.is_priority ? 'Remove emergency' : 'Mark emergency'}
                </Btn>
                <Btn
                  variant="danger"
                  className="!px-3 !py-1.5 !text-xs"
                  disabled={busy}
                  onClick={() => window.confirm(`Cancel token #${t.token_number}?`) && act(() => cancelToken(t.id))}
                >
                  Cancel
                </Btn>
              </div>
            </li>
          ))}
          {skipped.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 bg-orange-50/50 px-4 py-2.5">
              <div className="flex items-center gap-3">
                <span className="w-10 text-lg font-bold text-orange-600">#{t.token_number}</span>
                <div>
                  <div className="text-sm font-medium">{t.details?.patient_name || 'Patient'}</div>
                  <div className="text-xs text-slate-400">{t.details?.patient_phone || 'no phone'}</div>
                </div>
                <StatusBadge status="skipped" />
              </div>
              <div className="flex gap-2">
                <Btn variant="primary" className="!px-3 !py-1.5 !text-xs" disabled={busy} onClick={() => act(() => requeueToken(t.id))}>
                  Re-queue
                </Btn>
                <Btn
                  variant="danger"
                  className="!px-3 !py-1.5 !text-xs"
                  disabled={busy}
                  onClick={() => window.confirm(`Cancel token #${t.token_number}?`) && act(() => cancelToken(t.id))}
                >
                  Cancel
                </Btn>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
