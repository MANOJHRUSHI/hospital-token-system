import Layout from '../components/Layout'
import { Btn, Card, ErrorBanner, Loading, StatusBadge, PriorityBadge } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useAction, useLive } from '../hooks/useLive'
import {
  callNext,
  completeToken,
  fetchDoctors,
  fetchTodayTokens,
  fmtTime,
  queueOrder,
  setAvailability,
  skipToken,
  startConsultation,
} from '../lib/api'

export default function Doctor() {
  const { user } = useAuth()
  const { data, error, live, reload } = useLive(async () => {
    const [doctors, tokens] = await Promise.all([fetchDoctors(), fetchTodayTokens()])
    return { doctors, tokens, me: doctors.find((d) => d.profileId === user.id) || null }
  }, [user.id])

  return (
    <Layout title="Doctor dashboard" live={live}>
      <ErrorBanner message={error} />
      {!data ? (
        <Loading />
      ) : !data.me ? (
        <Card>
          <p className="text-sm text-slate-600">
            Your account has the doctor role but no doctor record. Run <code>supabase/staff.sql</code> to link it to a
            department.
          </p>
        </Card>
      ) : (
        <DoctorBody me={data.me} tokens={data.tokens.filter((t) => t.doctor_id === data.me.id)} reload={reload} />
      )}
    </Layout>
  )
}

function DoctorBody({ me, tokens, reload }) {
  const { run, busy, error, clearError } = useAction()
  const act = (fn) => run(async () => { await fn(); await reload() })

  const current = tokens.find((t) => t.status === 'in_consultation') || tokens.find((t) => t.status === 'called') || null
  const waiting = tokens.filter((t) => t.status === 'waiting').sort(queueOrder)
  const completed = tokens.filter((t) => t.status === 'completed').length
  const skipped = tokens.filter((t) => t.status === 'skipped').length

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{me.name}</h1>
          <p className="text-sm text-slate-500">{me.departmentName}</p>
        </div>
        <button
          disabled={busy}
          onClick={() => act(() => setAvailability(me.id, !me.isAvailable))}
          className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ring-1 transition disabled:opacity-50 ${
            me.isAvailable
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-300 hover:bg-emerald-100'
              : 'bg-amber-50 text-amber-700 ring-amber-300 hover:bg-amber-100'
          }`}
        >
          <span className={`h-2.5 w-2.5 rounded-full ${me.isAvailable ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          {me.isAvailable ? 'Available (tap to go on break)' : 'On break (tap to be available)'}
        </button>
      </div>

      <ErrorBanner message={error} onClose={clearError} />

      <div className="grid grid-cols-3 gap-3">
        <Counter label="Waiting" value={waiting.length} color="text-amber-600" />
        <Counter label="Completed today" value={completed} color="text-emerald-600" />
        <Counter label="Skipped" value={skipped} color="text-orange-600" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="space-y-4 lg:col-span-3">
          <h2 className="text-lg font-semibold">Current patient</h2>

          {current ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-teal-50 p-5 ring-1 ring-teal-200">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-teal-700">Token</div>
                  <div className="text-6xl font-bold text-teal-700">#{current.token_number}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold">{current.details?.patient_name || 'Patient'}</div>
                  <div className="text-sm text-slate-500">{current.details?.patient_phone || 'no phone'}</div>
                  <div className="mt-2 flex justify-end gap-2">
                    {current.is_priority && <PriorityBadge />}
                    <StatusBadge status={current.status} />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                {current.status === 'called' ? (
                  <>
                    <Btn disabled={busy} onClick={() => act(() => startConsultation(current.id))}>
                      Start consultation
                    </Btn>
                    <Btn variant="warn" disabled={busy} onClick={() => act(() => skipToken(current.id))}>
                      Skip (no-show)
                    </Btn>
                  </>
                ) : (
                  <Btn disabled={busy} onClick={() => act(() => completeToken(current.id))}>
                    Mark completed
                  </Btn>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-2xl bg-slate-50 p-8 text-center">
              <p className="mb-4 text-sm text-slate-500">
                {waiting.length === 0 ? 'No patients are waiting right now.' : 'Ready for the next patient?'}
              </p>
              <Btn
                className="!px-8 !py-3 !text-base"
                disabled={busy || waiting.length === 0 || !me.isAvailable}
                onClick={() => act(callNext)}
              >
                Call next
              </Btn>
              {!me.isAvailable && <p className="mt-3 text-xs text-amber-700">You are on break. Switch to Available first.</p>}
            </div>
          )}
        </Card>

        <Card className="space-y-3 lg:col-span-2">
          <h2 className="text-lg font-semibold">Upcoming</h2>
          {waiting.length === 0 ? (
            <p className="text-sm text-slate-500">Queue is empty.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
              {waiting.map((t, i) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="w-10 text-lg font-bold text-teal-700">#{t.token_number}</span>
                    <div>
                      <div className="text-sm font-medium">{t.details?.patient_name || 'Patient'}</div>
                      <div className="text-xs text-slate-400">booked {fmtTime(t.created_at)}</div>
                    </div>
                  </div>
                  {t.is_priority ? <PriorityBadge /> : i === 0 && <span className="text-xs font-medium text-teal-700">Next</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}

function Counter({ label, value, color }) {
  return (
    <Card className="!p-4 text-center">
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </Card>
  )
}
