import { useMemo, useState } from 'react'
import Layout from '../components/Layout'
import { Btn, Card, ErrorBanner, Field, inputCls, Loading, StatusBadge, PriorityBadge } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useAction, useLive } from '../hooks/useLive'
import {
  avgMinutesFor,
  cancelToken,
  createToken,
  fetchDepartments,
  fetchDoctors,
  fetchMyTokens,
  fetchTodayTokens,
  nowServing,
  todayIST,
  waitingFor,
} from '../lib/api'

export default function Patient() {
  const { user } = useAuth()
  const { data, error, live, reload } = useLive(async () => {
    const [doctors, departments, tokens, mine] = await Promise.all([
      fetchDoctors(),
      fetchDepartments(),
      fetchTodayTokens(),
      fetchMyTokens(user.id),
    ])
    return { doctors, departments, tokens, mine }
  }, [user.id])

  return (
    <Layout title="Patient dashboard" live={live}>
      <ErrorBanner message={error} />
      {!data ? (
        <Loading />
      ) : (
        <PatientBody data={data} reload={reload} />
      )}
    </Layout>
  )
}

function PatientBody({ data, reload }) {
  const { doctors, departments, tokens, mine } = data
  const today = todayIST()

  const isOpenToday = (t) =>
    t.token_date === today && ['waiting', 'called', 'in_consultation', 'skipped'].includes(t.status)
  const active = mine.filter(isOpenToday)
  const history = mine.filter((t) => !isOpenToday(t))

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <h2 className="text-lg font-semibold">My tokens today</h2>
        {active.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-500">You have no active token. Book one on the right.</p>
          </Card>
        ) : (
          active.map((t) => (
            <TokenCard key={t.id} token={t} doctors={doctors} tokens={tokens} onChange={reload} />
          ))
        )}

        <h2 className="pt-4 text-lg font-semibold">History</h2>
        <Card className="!p-0">
          {history.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">Nothing here yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {history.map((t) => {
                const d = doctors.find((x) => x.id === t.doctor_id)
                return (
                  <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div>
                      <span className="font-semibold">#{t.token_number}</span>{' '}
                      <span className="text-slate-600">{d?.name ?? 'Doctor'}</span>
                      <div className="text-xs text-slate-400">{t.token_date}</div>
                    </div>
                    <StatusBadge status={t.status} />
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      <BookingCard doctors={doctors} departments={departments} tokens={tokens} onBooked={reload} />
    </div>
  )
}

function BookingCard({ doctors, departments, tokens, onBooked }) {
  const [deptId, setDeptId] = useState('')
  const [doctorId, setDoctorId] = useState('')
  const { run, busy, error, clearError } = useAction()

  const list = useMemo(
    () => doctors.filter((d) => String(d.departmentId) === String(deptId)),
    [doctors, deptId],
  )
  const chosen = doctors.find((d) => d.id === doctorId)

  return (
    <Card className="h-fit space-y-4">
      <h2 className="text-lg font-semibold">Get a token</h2>
      <Field label="Department">
        <select
          className={inputCls}
          value={deptId}
          onChange={(e) => {
            setDeptId(e.target.value)
            setDoctorId('')
          }}
        >
          <option value="">Select department</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Doctor">
        <select className={inputCls} value={doctorId} onChange={(e) => setDoctorId(e.target.value)} disabled={!deptId}>
          <option value="">Select doctor</option>
          {list.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.isAvailable ? '' : ' (on break)'}
            </option>
          ))}
        </select>
      </Field>

      {chosen && (
        <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
          <div>
            <span className="font-medium text-slate-800">{waitingFor(tokens, chosen.id).length}</span> waiting now
          </div>
          <div>
            About{' '}
            <span className="font-medium text-slate-800">
              {(waitingFor(tokens, chosen.id).length + (nowServing(tokens, chosen.id) ? 1 : 0)) *
                avgMinutesFor(tokens, chosen)}{' '}
              min
            </span>{' '}
            wait if you book now
          </div>
          {!chosen.isAvailable && <div className="mt-1 text-amber-700">Doctor is on a break. You can still book.</div>}
        </div>
      )}

      <ErrorBanner message={error} onClose={clearError} />
      <Btn
        className="w-full"
        disabled={!doctorId || busy}
        onClick={() =>
          run(async () => {
            await createToken(doctorId)
            setDoctorId('')
            await onBooked()
          })
        }
      >
        {busy ? 'Booking…' : 'Get token'}
      </Btn>
    </Card>
  )
}

function TokenCard({ token, doctors, tokens, onChange }) {
  const doctor = doctors.find((d) => d.id === token.doctor_id)
  const serving = doctor ? nowServing(tokens, doctor.id) : null
  const waiting = doctor ? waitingFor(tokens, doctor.id) : []
  const myIndex = waiting.findIndex((t) => t.id === token.id)
  const ahead = myIndex === -1 ? 0 : myIndex
  const someoneInside = serving && serving.id !== token.id
  const avg = doctor ? avgMinutesFor(tokens, doctor) : 10
  const estimate = (ahead + (someoneInside ? 1 : 0)) * avg
  const { run, busy, error, clearError } = useAction()

  const called = token.status === 'called'
  const inRoom = token.status === 'in_consultation'

  return (
    <Card className={called ? 'pulse-ring ring-2 !ring-emerald-400' : ''}>
      {called && (
        <div className="-mx-5 -mt-5 mb-4 rounded-t-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white">
          It's your turn. Please go to {doctor?.name ?? 'the doctor'} now.
        </div>
      )}
      {inRoom && (
        <div className="-mx-5 -mt-5 mb-4 rounded-t-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-white">
          You are in consultation.
        </div>
      )}
      {token.status === 'skipped' && (
        <div className="-mx-5 -mt-5 mb-4 rounded-t-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white">
          You were skipped when called. Please meet the reception desk to rejoin the queue.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Your token</div>
          <div className="text-5xl font-bold text-teal-700">#{token.token_number}</div>
        </div>
        <div className="text-right">
          <div className="font-semibold">{doctor?.name}</div>
          <div className="text-sm text-slate-500">{doctor?.departmentName}</div>
          <div className="mt-2 flex justify-end gap-2">
            {token.is_priority && <PriorityBadge />}
            <StatusBadge status={token.status} />
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 text-center">
        <Stat label="Now serving" value={serving ? `#${serving.token_number}` : '-'} />
        <Stat label="Patients ahead" value={token.status === 'waiting' ? ahead : '-'} />
        <Stat label="Est. wait" value={token.status === 'waiting' ? (estimate === 0 ? 'Next' : `${estimate} min`) : '-'} />
      </div>

      {token.status === 'waiting' && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <ErrorBanner message={error} onClose={clearError} />
          <Btn
            variant="danger"
            className="ml-auto"
            disabled={busy}
            onClick={() => {
              if (!window.confirm('Cancel this token?')) return
              run(async () => {
                await cancelToken(token.id)
                await onChange()
              })
            }}
          >
            Cancel token
          </Btn>
        </div>
      )}
    </Card>
  )
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 px-2 py-3">
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  )
}
