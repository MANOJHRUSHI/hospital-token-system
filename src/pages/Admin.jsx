import { useState, useMemo } from 'react'
import Layout from '../components/Layout'
import {
  Btn,
  Card,
  ConfirmModal,
  ErrorBanner,
  Field,
  Loading,
  Modal,
  PasswordInput,
  PriorityBadge,
  RoleBadge,
  StatusBadge,
  SuccessBanner,
  inputCls,
  validateIndianPhone,
  validatePassword,
} from '../components/ui'
import { useAction, useLive } from '../hooks/useLive'
import {
  createDoctorAccount,
  createReceptionistAccount,
  deleteDoctorAccount,
  deleteReceptionistAccount,
  fetchAdminDoctors,
  fetchAdminPatientHistory,
  fetchAdminPatients,
  fetchAdminReceptionists,
  fetchAdminStats,
  fetchAdminTokens,
  fetchDepartments,
  fmtDateTime,
  fmtTime,
  resetUserPassword,
  todayIST,
  updateDoctorAccount,
  updateReceptionistAccount,
} from '../lib/api'

export default function Admin() {
  const [tab, setTab] = useState('overview') // 'overview' | 'doctors' | 'receptionists' | 'patients' | 'tokens'
  const { data, error, live, reload } = useLive(async () => {
    const [stats, doctors, receptionists, departments] = await Promise.all([
      fetchAdminStats(),
      fetchAdminDoctors(),
      fetchAdminReceptionists(),
      fetchDepartments(),
    ])
    return { stats, doctors, receptionists, departments }
  }, [])

  return (
    <Layout title="Administrator Control Center" live={live}>
      <ErrorBanner message={error} />
      {!data ? (
        <Loading text="Loading administrative data…" />
      ) : (
        <AdminContent
          tab={tab}
          setTab={setTab}
          data={data}
          reload={reload}
        />
      )}
    </Layout>
  )
}

function AdminContent({ tab, setTab, data, reload }) {
  const { stats, doctors, receptionists, departments } = data

  const tabs = [
    { id: 'overview', label: 'Overview', icon: 'chart' },
    { id: 'doctors', label: `Doctors (${doctors.length})`, icon: 'doctor' },
    { id: 'receptionists', label: `Reception (${receptionists.length})`, icon: 'reception' },
    { id: 'patients', label: 'Patients Directory', icon: 'patient' },
    { id: 'tokens', label: 'Live Token Workflow', icon: 'token' },
  ]

  return (
    <div className="space-y-6">
      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                tab === t.id
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <TabIcon type={t.icon} active={tab === t.id} />
              {t.label}
            </button>
          ))}
        </div>
        <Btn variant="secondary" className="!px-3 !py-1.5 !text-xs" onClick={reload}>
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh Data
        </Btn>
      </div>

      {/* Tab Panels */}
      {tab === 'overview' && (
        <OverviewSection stats={stats} doctors={doctors} onNavigate={setTab} reload={reload} />
      )}
      {tab === 'doctors' && (
        <DoctorsSection doctors={doctors} departments={departments} reload={reload} />
      )}
      {tab === 'receptionists' && (
        <ReceptionistsSection receptionists={receptionists} reload={reload} />
      )}
      {tab === 'patients' && (
        <PatientsSection reload={reload} />
      )}
      {tab === 'tokens' && (
        <TokensSection doctors={doctors} reload={reload} />
      )}
    </div>
  )
}

// ==========================================
// 1. OVERVIEW SECTION
// ==========================================
function OverviewSection({ stats, doctors, onNavigate, reload }) {
  return (
    <div className="space-y-6">
      {/* Top Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatWidget
          title="Total Registered Patients"
          value={stats.total_patients}
          subtitle="Hospital database count"
          color="teal"
          icon="users"
          onClick={() => onNavigate('patients')}
        />
        <StatWidget
          title="Total Doctors"
          value={stats.total_doctors}
          subtitle={`${stats.available_doctors || 0} currently available`}
          color="emerald"
          icon="doctor"
          onClick={() => onNavigate('doctors')}
        />
        <StatWidget
          title="Total Receptionists"
          value={stats.total_receptionists}
          subtitle="Desk staff accounts"
          color="sky"
          icon="reception"
          onClick={() => onNavigate('receptionists')}
        />
        <StatWidget
          title="Total Lifetime Tokens"
          value={stats.total_tokens_all}
          subtitle={`${stats.total_tokens_today} tokens today`}
          color="indigo"
          icon="token"
          onClick={() => onNavigate('tokens')}
        />
      </div>

      {/* Today's Operational Status */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Today's Token Operations (IST)</h2>
            <p className="text-xs text-slate-500">Live operational overview for {todayIST()}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Active Clinic Day
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <TodayStatItem label="Tokens Issued Today" value={stats.total_tokens_today} tone="default" />
          <TodayStatItem label="Currently Waiting" value={stats.waiting_today} tone="amber" />
          <TodayStatItem label="In Consultation / Called" value={stats.in_progress_today} tone="sky" />
          <TodayStatItem label="Completed Consultations" value={stats.completed_today} tone="emerald" />
          <TodayStatItem label="Skipped / Cancelled" value={(stats.skipped_today || 0) + (stats.cancelled_today || 0)} tone="rose" />
        </div>
      </Card>

      {/* Doctors Availability Quick View */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-base font-bold text-slate-900">Doctors On Duty</h2>
          <Btn variant="subtle" className="!text-xs" onClick={() => onNavigate('doctors')}>
            Manage All Doctors →
          </Btn>
        </div>

        {doctors.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">No doctors registered yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {doctors.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 p-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        doc.isActive
                          ? doc.isAvailable
                            ? 'bg-emerald-500 ring-2 ring-emerald-200'
                            : 'bg-amber-500 ring-2 ring-amber-200'
                          : 'bg-slate-400'
                      }`}
                    />
                    <span className="text-sm font-semibold text-slate-800">{doc.name}</span>
                  </div>
                  <div className="text-xs text-slate-500">{doc.departmentName || 'General'}</div>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                      doc.isActive
                        ? doc.isAvailable
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                          : 'bg-amber-50 text-amber-700 ring-amber-200'
                        : 'bg-slate-100 text-slate-500 ring-slate-200'
                    }`}
                  >
                    {!doc.isActive ? 'Inactive' : doc.isAvailable ? 'Available' : 'On Break'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function StatWidget({ title, value, subtitle, color, icon, onClick }) {
  const colors = {
    teal: 'bg-teal-50 text-teal-600 ring-teal-200',
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-200',
    sky: 'bg-sky-50 text-sky-600 ring-sky-200',
    indigo: 'bg-indigo-50 text-indigo-600 ring-indigo-200',
  }
  return (
    <Card
      onClick={onClick}
      className="cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value ?? 0}</div>
          <div className="mt-1 text-xs text-slate-500">{subtitle}</div>
        </div>
        <div className={`rounded-xl p-2.5 ring-1 ${colors[color] || colors.teal}`}>
          <TabIcon type={icon} className="h-5 w-5" />
        </div>
      </div>
    </Card>
  )
}

function TodayStatItem({ label, value, tone }) {
  const tones = {
    default: 'text-slate-800',
    amber: 'text-amber-600',
    sky: 'text-sky-600',
    emerald: 'text-emerald-600',
    rose: 'text-rose-600',
  }
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-center">
      <div className={`text-2xl font-bold ${tones[tone]}`}>{value ?? 0}</div>
      <div className="mt-1 text-[11px] font-medium text-slate-500">{label}</div>
    </div>
  )
}

// ==========================================
// 2. DOCTOR MANAGEMENT (FULL CRUD)
// ==========================================
function DoctorsSection({ doctors, departments, reload }) {
  const [modalMode, setModalMode] = useState(null) // 'create' | 'edit' | 'reset-pwd' | null
  const [activeDoctor, setActiveDoctor] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [toastMsg, setToastMsg] = useState('')
  const { run, busy, error, clearError } = useAction()

  const openCreate = () => {
    setActiveDoctor(null)
    setModalMode('create')
    clearError()
  }

  const openEdit = (doc) => {
    setActiveDoctor(doc)
    setModalMode('edit')
    clearError()
  }

  const openResetPwd = (doc) => {
    setActiveDoctor(doc)
    setModalMode('reset-pwd')
    clearError()
  }

  const openDelete = (doc) => {
    setDeleteConfirm(doc)
    clearError()
  }

  const handleDelete = () => {
    if (!deleteConfirm) return
    run(async () => {
      await deleteDoctorAccount(deleteConfirm.id)
      setDeleteConfirm(null)
      setToastMsg(`Doctor ${deleteConfirm.name} deleted safely.`)
      await reload()
    })
  }

  const handleToggleStatus = (doc) => {
    run(async () => {
      await updateDoctorAccount(doc.id, {
        fullName: doc.name,
        phone: doc.phone,
        departmentId: doc.departmentId,
        avgMinutes: doc.avgMinutes,
        isAvailable: doc.isActive ? false : true,
        isActive: !doc.isActive,
      })
      setToastMsg(`Doctor ${doc.name} ${doc.isActive ? 'deactivated' : 'activated'} successfully.`)
      await reload()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Doctor Directory & Management</h2>
          <p className="text-xs text-slate-500">Manage medical staff, credentials, departments, and consultation settings.</p>
        </div>
        <Btn onClick={openCreate} className="!py-2 !text-xs">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add New Doctor
        </Btn>
      </div>

      <ErrorBanner message={error} onClose={clearError} />
      <SuccessBanner message={toastMsg} onClose={() => setToastMsg('')} />

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Doctor</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Avg Consult</th>
                <th className="px-4 py-3">Duty Status</th>
                <th className="px-4 py-3">Account Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {doctors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No doctors found. Click "Add New Doctor" above to create one.
                  </td>
                </tr>
              ) : (
                doctors.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-700">
                          Dr
                        </div>
                        <div>
                          <div>{doc.name}</div>
                          {doc.email && <div className="text-xs text-slate-400">{doc.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{doc.departmentName || 'General'}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {doc.phone ? (
                        <span className="font-mono text-xs">+91 {doc.phone}</span>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{doc.avgMinutes || 10} min</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                          doc.isAvailable
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-300'
                            : 'bg-amber-50 text-amber-700 ring-amber-300'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${doc.isAvailable ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        {doc.isAvailable ? 'Available' : 'On break'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                          doc.isActive
                            ? 'bg-slate-100 text-slate-700 ring-slate-200'
                            : 'bg-rose-50 text-rose-700 ring-rose-200'
                        }`}
                      >
                        {doc.isActive ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(doc)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                          title="Edit details"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => openResetPwd(doc)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-amber-600"
                          title="Reset password"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(doc)}
                          className={`rounded-lg px-2 py-1 text-xs font-semibold ${
                            doc.isActive
                              ? 'text-amber-700 hover:bg-amber-50'
                              : 'text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          {doc.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openDelete(doc)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          title="Delete doctor"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Doctor Create / Edit Form Modal */}
      {(modalMode === 'create' || modalMode === 'edit') && (
        <DoctorFormModal
          isOpen={true}
          mode={modalMode}
          doctor={activeDoctor}
          departments={departments}
          onClose={() => setModalMode(null)}
          onSuccess={async (msg) => {
            setModalMode(null)
            setToastMsg(msg)
            await reload()
          }}
        />
      )}

      {/* Reset Password Modal */}
      {modalMode === 'reset-pwd' && activeDoctor && (
        <ResetPasswordModal
          isOpen={true}
          user={activeDoctor}
          userType="doctor"
          onClose={() => setModalMode(null)}
          onSuccess={async (msg) => {
            setModalMode(null)
            setToastMsg(msg)
            await reload()
          }}
        />
      )}

      {/* Safe Delete Confirmation */}
      <ConfirmModal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleDelete}
        busy={busy}
        title="Delete Doctor Account"
        message={`Are you sure you want to delete Dr. ${deleteConfirm?.name}? If this doctor has existing patient consultations or token records, the operation will be safely prevented to avoid data loss. If so, deactivate the doctor instead.`}
        confirmText="Confirm Delete"
      />
    </div>
  )
}

function DoctorFormModal({ isOpen, mode, doctor, departments, onClose, onSuccess }) {
  const [form, setForm] = useState({
    fullName: doctor?.name || '',
    email: doctor?.email || '',
    phone: doctor?.phone || '',
    password: '',
    departmentId: doctor?.departmentId || departments[0]?.id || '',
    avgMinutes: doctor?.avgMinutes || 10,
    isAvailable: doctor ? doctor.isAvailable : true,
    isActive: doctor ? doctor.isActive : true,
  })
  const { run, busy, error, clearError } = useAction()

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handlePhoneChange = (e) => {
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 10)
    setForm((f) => ({ ...f, phone: cleaned }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    clearError()

    // Minimum password check for create
    if (mode === 'create') {
      if (!validatePassword(form.password)) {
        throw new Error('Initial password must be at least 6 characters long.')
      }
    }

    // Phone validation if entered
    if (form.phone && !validateIndianPhone(form.phone)) {
      throw new Error('Please enter a valid 10-digit Indian mobile number.')
    }

    run(async () => {
      if (mode === 'create') {
        await createDoctorAccount({
          email: form.email,
          password: form.password,
          fullName: form.fullName,
          phone: form.phone,
          departmentId: form.departmentId,
          avgMinutes: form.avgMinutes,
        })
        onSuccess(`Doctor account for ${form.fullName} created successfully.`)
      } else {
        await updateDoctorAccount(doctor.id, {
          fullName: form.fullName,
          phone: form.phone,
          departmentId: form.departmentId,
          avgMinutes: form.avgMinutes,
          isAvailable: form.isAvailable,
          isActive: form.isActive,
        })
        onSuccess(`Doctor profile for ${form.fullName} updated.`)
      }
    })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'create' ? 'Add New Doctor' : `Edit Doctor Profile: ${doctor?.name}`}
      subtitle="Fill in doctor credentials and consultation department"
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <ErrorBanner message={error} onClose={clearError} />

        <Field label="Doctor Full Name">
          <input
            className={inputCls}
            required
            placeholder="Dr. Sunita Rao"
            value={form.fullName}
            onChange={set('fullName')}
          />
        </Field>

        {mode === 'create' && (
          <Field label="Login Email Address">
            <input
              className={inputCls}
              type="email"
              required
              placeholder="doctor@hospital.com"
              value={form.email}
              onChange={set('email')}
            />
          </Field>
        )}

        <Field label="Phone Number" hint="10-digit Indian mobile">
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

        {mode === 'create' && (
          <Field label="Initial Account Password" hint="Minimum 6 characters">
            <PasswordInput
              required
              minLength={6}
              value={form.password}
              onChange={set('password')}
            />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Department / Specialization">
            <select
              className={inputCls}
              required
              value={form.departmentId}
              onChange={set('departmentId')}
            >
              <option value="">Select department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Avg Consultation (Mins)">
            <input
              className={inputCls}
              type="number"
              min={1}
              max={120}
              required
              value={form.avgMinutes}
              onChange={set('avgMinutes')}
            />
          </Field>
        </div>

        {mode === 'edit' && (
          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.isAvailable}
                onChange={(e) => setForm((f) => ({ ...f, isAvailable: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              Available for new patient consultations
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              Account active (uncheck to deactivate access)
            </label>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-3">
          <Btn type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
          <Btn type="submit" disabled={busy}>
            {busy ? 'Saving…' : mode === 'create' ? 'Create Doctor' : 'Save Changes'}
          </Btn>
        </div>
      </form>
    </Modal>
  )
}

// ==========================================
// 3. RECEPTIONIST MANAGEMENT (FULL CRUD)
// ==========================================
function ReceptionistsSection({ receptionists, reload }) {
  const [modalMode, setModalMode] = useState(null) // 'create' | 'edit' | 'reset-pwd' | null
  const [activeRec, setActiveRec] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [toastMsg, setToastMsg] = useState('')
  const { run, busy, error, clearError } = useAction()

  const openCreate = () => {
    setActiveRec(null)
    setModalMode('create')
    clearError()
  }

  const openEdit = (rec) => {
    setActiveRec(rec)
    setModalMode('edit')
    clearError()
  }

  const openResetPwd = (rec) => {
    setActiveRec(rec)
    setModalMode('reset-pwd')
    clearError()
  }

  const handleDelete = () => {
    if (!deleteConfirm) return
    run(async () => {
      await deleteReceptionistAccount(deleteConfirm.id)
      setDeleteConfirm(null)
      setToastMsg(`Receptionist ${deleteConfirm.name} removed successfully.`)
      await reload()
    })
  }

  const handleToggleStatus = (rec) => {
    run(async () => {
      await updateReceptionistAccount(rec.id, {
        fullName: rec.name,
        phone: rec.phone,
        isActive: !rec.isActive,
      })
      setToastMsg(`Receptionist ${rec.name} status updated.`)
      await reload()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Receptionist Accounts & Permissions</h2>
          <p className="text-xs text-slate-500">Manage front-desk staff responsible for issuing walk-in tokens.</p>
        </div>
        <Btn onClick={openCreate} className="!py-2 !text-xs">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Receptionist
        </Btn>
      </div>

      <ErrorBanner message={error} onClose={clearError} />
      <SuccessBanner message={toastMsg} onClose={() => setToastMsg('')} />

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Staff Name</th>
                <th className="px-4 py-3">Email Address</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Account Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {receptionists.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No receptionists found. Add front desk staff above.
                  </td>
                </tr>
              ) : (
                receptionists.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700">
                          FD
                        </div>
                        <span>{rec.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{rec.email || '-'}</td>
                    <td className="px-4 py-3 text-slate-600 font-mono text-xs">
                      {rec.phone ? `+91 ${rec.phone}` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                          rec.isActive
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                            : 'bg-rose-50 text-rose-700 ring-rose-200'
                        }`}
                      >
                        {rec.isActive ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {rec.createdAt ? fmtDateTime(rec.createdAt) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(rec)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                          title="Edit details"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => openResetPwd(rec)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-amber-600"
                          title="Reset password"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(rec)}
                          className={`rounded-lg px-2 py-1 text-xs font-semibold ${
                            rec.isActive
                              ? 'text-amber-700 hover:bg-amber-50'
                              : 'text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          {rec.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm(rec)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          title="Delete receptionist"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Receptionist Create / Edit Modal */}
      {(modalMode === 'create' || modalMode === 'edit') && (
        <ReceptionistFormModal
          isOpen={true}
          mode={modalMode}
          receptionist={activeRec}
          onClose={() => setModalMode(null)}
          onSuccess={async (msg) => {
            setModalMode(null)
            setToastMsg(msg)
            await reload()
          }}
        />
      )}

      {/* Reset Password Modal */}
      {modalMode === 'reset-pwd' && activeRec && (
        <ResetPasswordModal
          isOpen={true}
          user={activeRec}
          userType="receptionist"
          onClose={() => setModalMode(null)}
          onSuccess={async (msg) => {
            setModalMode(null)
            setToastMsg(msg)
            await reload()
          }}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleDelete}
        busy={busy}
        title="Delete Receptionist Account"
        message={`Are you sure you want to delete front-desk account "${deleteConfirm?.name}"? This action removes authentication credentials immediately.`}
        confirmText="Confirm Delete"
      />
    </div>
  )
}

function ReceptionistFormModal({ isOpen, mode, receptionist, onClose, onSuccess }) {
  const [form, setForm] = useState({
    fullName: receptionist?.name || '',
    email: receptionist?.email || '',
    phone: receptionist?.phone || '',
    password: '',
    isActive: receptionist ? receptionist.isActive : true,
  })
  const { run, busy, error, clearError } = useAction()

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handlePhoneChange = (e) => {
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 10)
    setForm((f) => ({ ...f, phone: cleaned }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    clearError()

    if (mode === 'create') {
      if (!validatePassword(form.password)) {
        throw new Error('Initial password must be at least 6 characters long.')
      }
    }

    if (form.phone && !validateIndianPhone(form.phone)) {
      throw new Error('Please enter a valid 10-digit Indian mobile number.')
    }

    run(async () => {
      if (mode === 'create') {
        await createReceptionistAccount({
          email: form.email,
          password: form.password,
          fullName: form.fullName,
          phone: form.phone,
        })
        onSuccess(`Receptionist account for ${form.fullName} created.`)
      } else {
        await updateReceptionistAccount(receptionist.id, {
          fullName: form.fullName,
          phone: form.phone,
          isActive: form.isActive,
        })
        onSuccess(`Receptionist profile for ${form.fullName} updated.`)
      }
    })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'create' ? 'Add New Receptionist' : `Edit Receptionist: ${receptionist?.name}`}
      subtitle="Front-desk staff credentials"
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <ErrorBanner message={error} onClose={clearError} />

        <Field label="Full Name">
          <input
            className={inputCls}
            required
            placeholder="e.g. Meera Patel"
            value={form.fullName}
            onChange={set('fullName')}
          />
        </Field>

        {mode === 'create' && (
          <Field label="Login Email Address">
            <input
              className={inputCls}
              type="email"
              required
              placeholder="reception@hospital.com"
              value={form.email}
              onChange={set('email')}
            />
          </Field>
        )}

        <Field label="Phone Number" hint="10-digit Indian mobile">
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

        {mode === 'create' && (
          <Field label="Initial Password" hint="Minimum 6 characters">
            <PasswordInput
              required
              minLength={6}
              value={form.password}
              onChange={set('password')}
            />
          </Field>
        )}

        {mode === 'edit' && (
          <label className="flex items-center gap-2 pt-1 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            Account active (uncheck to deactivate access)
          </label>
        )}

        <div className="flex justify-end gap-3 pt-3">
          <Btn type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
          <Btn type="submit" disabled={busy}>
            {busy ? 'Saving…' : mode === 'create' ? 'Create Receptionist' : 'Save Changes'}
          </Btn>
        </div>
      </form>
    </Modal>
  )
}

// ==========================================
// 4. RESET PASSWORD MODAL
// ==========================================
function ResetPasswordModal({ isOpen, user, userType, onClose, onSuccess }) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const { run, busy, error, clearError } = useAction()

  const handleSubmit = (e) => {
    e.preventDefault()
    clearError()

    if (!validatePassword(newPassword)) {
      throw new Error('Password must be at least 6 characters long.')
    }
    if (newPassword !== confirmPassword) {
      throw new Error('Password confirmation does not match.')
    }

    run(async () => {
      const targetUserId = user.profileId || user.id
      await resetUserPassword(targetUserId, newPassword)
      onSuccess(`Password for ${user.name} was securely reset.`)
    })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Reset Password for ${user.name}`}
      subtitle={`Enforce 6+ characters for ${userType} account`}
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <ErrorBanner message={error} onClose={clearError} />

        <Field label="New Password" hint="Minimum 6 characters">
          <PasswordInput
            required
            minLength={6}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New secure password"
          />
        </Field>

        <Field label="Confirm New Password">
          <PasswordInput
            required
            minLength={6}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat new password"
          />
        </Field>

        <p className="text-xs text-slate-500">
          The password is encrypted immediately with industry-standard bcrypt. No plaintext passwords are ever stored.
        </p>

        <div className="flex justify-end gap-3 pt-2">
          <Btn type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
          <Btn type="submit" variant="warn" disabled={busy}>
            {busy ? 'Resetting…' : 'Update Password'}
          </Btn>
        </div>
      </form>
    </Modal>
  )
}

// ==========================================
// 5. PATIENT DIRECTORY & VISIBILITY
// ==========================================
function PatientsSection() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const pageSize = 20
  const [selectedPatient, setSelectedPatient] = useState(null)

  const { data, error, live, reload } = useLive(async () => {
    const list = await fetchAdminPatients({
      search: search.trim(),
      limit: pageSize,
      offset: page * pageSize,
    })
    return list
  }, [search, page])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Patient Directory</h2>
          <p className="text-xs text-slate-500">Complete registered patient records and live token tracking.</p>
        </div>
        <div className="w-full sm:w-72">
          <input
            className={inputCls}
            placeholder="Search by name, phone, or ID…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(0)
            }}
          />
        </div>
      </div>

      <ErrorBanner message={error} />

      <Card className="!p-0 overflow-hidden">
        {!data ? (
          <Loading text="Loading patient records…" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Registered</th>
                  <th className="px-4 py-3">Lifetime Tokens</th>
                  <th className="px-4 py-3">Today's Token</th>
                  <th className="px-4 py-3">Assigned Doctor</th>
                  <th className="px-4 py-3 text-right">History</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No patients matching criteria.
                    </td>
                  </tr>
                ) : (
                  data.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <div>{p.name || 'Anonymous Patient'}</div>
                        <div className="font-mono text-[11px] text-slate-400">ID: {p.id.slice(0, 8)}…</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {p.phone ? `+91 ${p.phone}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {p.createdAt ? fmtDateTime(p.createdAt) : '-'}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-700">
                        {p.totalTokens ?? 0}
                      </td>
                      <td className="px-4 py-3">
                        {p.todayTokenNumber ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-teal-700">#{p.todayTokenNumber}</span>
                            <StatusBadge status={p.todayTokenStatus} />
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">None today</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">
                        {p.todayDoctorName || '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Btn
                          variant="secondary"
                          className="!px-2.5 !py-1 !text-xs"
                          onClick={() => setSelectedPatient(p)}
                        >
                          View Tokens
                        </Btn>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-2.5 text-xs text-slate-600">
          <span>Showing page {page + 1}</span>
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium hover:bg-slate-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={!data || data.length < pageSize}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium hover:bg-slate-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </Card>

      {/* Patient Token History Modal */}
      {selectedPatient && (
        <PatientHistoryModal
          patient={selectedPatient}
          onClose={() => setSelectedPatient(null)}
        />
      )}
    </div>
  )
}

function PatientHistoryModal({ patient, onClose }) {
  const { data: tokens, error, loading } = useLive(async () => {
    return await fetchAdminPatientHistory(patient.id)
  }, [patient.id])

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`Token History: ${patient.name}`}
      subtitle={`Complete consultation record for Patient ID ${patient.id}`}
      maxWidth="max-w-2xl"
    >
      <ErrorBanner message={error} />
      {loading ? (
        <Loading text="Loading patient token history…" />
      ) : !tokens || tokens.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">No tokens found for this patient.</p>
      ) : (
        <div className="space-y-3">
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200">
            {tokens.map((tk) => (
              <div key={tk.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-teal-700">Token #{tk.tokenNumber}</span>
                    <span className="text-xs text-slate-400">· {tk.tokenDate}</span>
                    {tk.isPriority && <PriorityBadge />}
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    {tk.doctorName} ({tk.departmentName || 'General'})
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Booked: {fmtTime(tk.createdAt)}
                    {tk.calledAt && ` · Called: ${fmtTime(tk.calledAt)}`}
                    {tk.completedAt && ` · Done: ${fmtTime(tk.completedAt)}`}
                  </div>
                </div>
                <StatusBadge status={tk.status} />
              </div>
            ))}
          </div>
          <div className="flex justify-end pt-2">
            <Btn variant="secondary" onClick={onClose}>
              Close
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ==========================================
// 6. LIVE TOKEN WORKFLOW
// ==========================================
function TokensSection({ doctors, reload }) {
  const [dateFilter, setDateFilter] = useState(todayIST())
  const [doctorFilter, setDoctorFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')

  const { data: tokens, error, live } = useLive(async () => {
    return await fetchAdminTokens({
      date: dateFilter || null,
      doctorId: doctorFilter || null,
      status: statusFilter || null,
      search: search.trim() || null,
      limit: 100,
    })
  }, [dateFilter, doctorFilter, statusFilter, search])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Hospital Token Workflow</h2>
          <p className="text-xs text-slate-500">Live monitor of patient queues, assignments, and consultation lifecycles.</p>
        </div>
      </div>

      {/* Filters Bar */}
      <Card className="!p-3">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Date</span>
            <input
              type="date"
              className={inputCls}
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
          </div>

          <div>
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Doctor</span>
            <select
              className={inputCls}
              value={doctorFilter}
              onChange={(e) => setDoctorFilter(e.target.value)}
            >
              <option value="">All Doctors</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Status</span>
            <select
              className={inputCls}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="waiting">Waiting</option>
              <option value="called">Called</option>
              <option value="in_consultation">In consultation</option>
              <option value="completed">Completed</option>
              <option value="skipped">Skipped</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Search</span>
            <input
              className={inputCls}
              placeholder="Search token #, name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </Card>

      <ErrorBanner message={error} />

      <Card className="!p-0 overflow-hidden">
        {!tokens ? (
          <Loading text="Loading token records…" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Token #</th>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Assigned Doctor</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Timestamps</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tokens.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No tokens found matching the filter criteria.
                    </td>
                  </tr>
                ) : (
                  tokens.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-bold text-teal-700">#{t.tokenNumber}</span>
                          {t.isPriority && <PriorityBadge />}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{t.patientName || 'Walk-in'}</div>
                        <div className="font-mono text-xs text-slate-500">
                          {t.patientPhone ? `+91 ${t.patientPhone}` : 'no phone'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{t.doctorName}</div>
                        <div className="text-xs text-slate-400">{t.departmentName}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {fmtTime(t.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        <div>Called: {fmtTime(t.calledAt)}</div>
                        <div>Completed: {fmtTime(t.completedAt)}</div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

// Icon Helper for consistent clean SVGs without extra packages
function TabIcon({ type, active, className = 'h-4 w-4' }) {
  if (type === 'chart') {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    )
  }
  if (type === 'doctor') {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    )
  }
  if (type === 'reception') {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    )
  }
  if (type === 'patient' || type === 'users') {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    )
  }
  if (type === 'token') {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
      </svg>
    )
  }
  return null
}
