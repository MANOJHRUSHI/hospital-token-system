import { supabase } from './supabase.js'

// "Today" in India time, formatted YYYY-MM-DD (matches ist_today() in the database)
export const todayIST = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

// ---------- reads ----------
export async function fetchDoctors() {
  const { data, error } = await supabase
    .from('doctors')
    .select('id, profile_id, department_id, is_available, avg_consult_minutes, profiles(full_name, is_active), departments(name)')
  if (error) throw error
  return (data || [])
    .map((d) => ({
      id: d.id,
      profileId: d.profile_id,
      departmentId: d.department_id,
      departmentName: d.departments?.name ?? '',
      name: d.profiles?.full_name ?? 'Doctor',
      isAvailable: d.is_available,
      isActive: d.profiles?.is_active ?? true,
      avgMinutes: d.avg_consult_minutes,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function fetchDepartments() {
  const { data, error } = await supabase.from('departments').select('id, name').order('name')
  if (error) throw error
  return data || []
}

// Today's tokens. token_details is filled in only for rows the current user may see
// (own token for patients, everything for reception & admin, own queue for doctors).
export async function fetchTodayTokens() {
  const { data, error } = await supabase
    .from('tokens')
    .select('*, token_details(patient_id, patient_name, patient_phone)')
    .eq('token_date', todayIST())
    .order('token_number', { ascending: true })
  if (error) throw error
  return (data || []).map(normalizeToken)
}

// A patient's own tokens across all days (for history)
export async function fetchMyTokens(userId) {
  const { data, error } = await supabase
    .from('token_details')
    .select('patient_name, tokens(*)')
    .eq('patient_id', userId)
  if (error) throw error
  return (data || [])
    .filter((r) => r.tokens)
    .map((r) => ({ ...r.tokens, details: { patient_name: r.patient_name } }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

function normalizeToken(t) {
  const d = Array.isArray(t.token_details) ? t.token_details[0] : t.token_details
  const { token_details, ...rest } = t
  return { ...rest, details: d || null }
}

// ---------- actions (all go through database functions) ----------
async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(error.message)
  return data
}

export const createToken = (doctorId, { name, phone, priority } = {}) =>
  rpc('create_token', {
    p_doctor: doctorId,
    p_name: name ?? null,
    p_phone: phone ?? null,
    p_priority: !!priority,
  })
export const callNext = () => rpc('call_next', {})
export const startConsultation = (id) => rpc('start_consultation', { p_token: id })
export const completeToken = (id) => rpc('complete_token', { p_token: id })
export const skipToken = (id) => rpc('skip_token', { p_token: id })
export const requeueToken = (id) => rpc('requeue_token', { p_token: id })
export const cancelToken = (id) => rpc('cancel_token', { p_token: id })
export const setPriority = (id, priority) => rpc('set_priority', { p_token: id, p_priority: priority })

export async function setAvailability(doctorId, isAvailable) {
  const { error } = await supabase.from('doctors').update({ is_available: isAvailable }).eq('id', doctorId)
  if (error) throw new Error(error.message)
}

// ---------- Administrator APIs ----------

export async function fetchAdminStats() {
  try {
    const data = await rpc('admin_get_stats', {})
    if (data) return data
  } catch (err) {
    // Graceful fallback if migration hasn't been run yet
    console.warn('admin_get_stats RPC not found, falling back to client queries', err)
  }

  // Client-side fallback aggregation
  const today = todayIST()
  const [patients, docs, recs, allTokens, todayToks] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'patient'),
    supabase.from('doctors').select('id, is_available'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'receptionist'),
    supabase.from('tokens').select('id', { count: 'exact', head: true }),
    supabase.from('tokens').select('id, status').eq('token_date', today),
  ])

  const tData = todayToks.data || []
  return {
    total_patients: patients.count || 0,
    total_doctors: (docs.data || []).length,
    available_doctors: (docs.data || []).filter((d) => d.is_available).length,
    total_receptionists: recs.count || 0,
    total_tokens_all: allTokens.count || 0,
    total_tokens_today: tData.length,
    waiting_today: tData.filter((t) => t.status === 'waiting').length,
    in_progress_today: tData.filter((t) => t.status === 'called' || t.status === 'in_consultation').length,
    completed_today: tData.filter((t) => t.status === 'completed').length,
    skipped_today: tData.filter((t) => t.status === 'skipped').length,
    cancelled_today: tData.filter((t) => t.status === 'cancelled').length,
  }
}

export async function fetchAdminDoctors() {
  try {
    const data = await rpc('admin_list_doctors', {})
    if (data) return data
  } catch (err) {
    console.warn('admin_list_doctors RPC fallback', err)
  }

  // Fallback to fetchDoctors
  const docs = await fetchDoctors()
  return docs.map((d) => ({
    id: d.id,
    profileId: d.profileId,
    name: d.name,
    email: '',
    phone: '',
    departmentId: d.departmentId,
    departmentName: d.departmentName,
    isAvailable: d.isAvailable,
    isActive: d.isActive ?? true,
    avgMinutes: d.avgMinutes,
    createdAt: null,
    activeTokensCount: 0,
    totalTokensCount: 0,
  }))
}

export async function createDoctorAccount({ email, password, fullName, phone, departmentId, avgMinutes = 10 }) {
  return await rpc('admin_create_doctor', {
    p_email: email.trim(),
    p_password: password,
    p_full_name: fullName.trim(),
    p_phone: phone ? phone.trim() : null,
    p_department_id: Number(departmentId),
    p_avg_minutes: Number(avgMinutes) || 10,
  })
}

export async function updateDoctorAccount(doctorId, { fullName, phone, departmentId, avgMinutes, isAvailable, isActive }) {
  return await rpc('admin_update_doctor', {
    p_doctor_id: doctorId,
    p_full_name: fullName.trim(),
    p_phone: phone ? phone.trim() : null,
    p_department_id: Number(departmentId),
    p_avg_minutes: Number(avgMinutes) || 10,
    p_is_available: !!isAvailable,
    p_is_active: isActive !== false,
  })
}

export async function deleteDoctorAccount(doctorId) {
  return await rpc('admin_delete_doctor', { p_doctor_id: doctorId })
}

export async function fetchAdminReceptionists() {
  try {
    const data = await rpc('admin_list_receptionists', {})
    if (data) return data
  } catch (err) {
    console.warn('admin_list_receptionists RPC fallback', err)
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone, is_active, created_at')
    .eq('role', 'receptionist')
    .order('full_name')
  if (error) throw error

  return (data || []).map((p) => ({
    id: p.id,
    name: p.full_name,
    email: '',
    phone: p.phone,
    isActive: p.is_active ?? true,
    createdAt: p.created_at,
  }))
}

export async function createReceptionistAccount({ email, password, fullName, phone }) {
  return await rpc('admin_create_receptionist', {
    p_email: email.trim(),
    p_password: password,
    p_full_name: fullName.trim(),
    p_phone: phone ? phone.trim() : null,
  })
}

export async function updateReceptionistAccount(profileId, { fullName, phone, isActive }) {
  return await rpc('admin_update_receptionist', {
    p_profile_id: profileId,
    p_full_name: fullName.trim(),
    p_phone: phone ? phone.trim() : null,
    p_is_active: isActive !== false,
  })
}

export async function deleteReceptionistAccount(profileId) {
  return await rpc('admin_delete_receptionist', { p_profile_id: profileId })
}

export async function resetUserPassword(userId, newPassword) {
  return await rpc('admin_reset_user_password', {
    p_user_id: userId,
    p_new_password: newPassword,
  })
}

export async function fetchAdminPatients({ search = '', limit = 50, offset = 0 } = {}) {
  try {
    const data = await rpc('admin_list_patients', {
      p_search: search || null,
      p_limit: limit,
      p_offset: offset,
    })
    if (data) return data
  } catch (err) {
    console.warn('admin_list_patients RPC fallback', err)
  }

  // Fallback to direct table query
  let q = supabase
    .from('profiles')
    .select('id, full_name, phone, is_active, created_at')
    .eq('role', 'patient')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (search) {
    q = q.ilike('full_name', `%${search}%`)
  }

  const { data, error } = await q
  if (error) throw error

  return (data || []).map((p) => ({
    id: p.id,
    name: p.full_name,
    phone: p.phone,
    email: '',
    createdAt: p.created_at,
    isActive: p.is_active ?? true,
    totalTokens: 0,
    todayTokenNumber: null,
    todayTokenStatus: null,
    todayDoctorName: null,
  }))
}

export async function fetchAdminPatientHistory(patientId) {
  try {
    const data = await rpc('admin_get_patient_history', { p_patient_id: patientId })
    if (data) return data
  } catch (err) {
    console.warn('admin_get_patient_history RPC fallback', err)
  }

  const { data, error } = await supabase
    .from('token_details')
    .select('tokens(*, doctors(profiles(full_name), departments(name)))')
    .eq('patient_id', patientId)

  if (error) throw error

  return (data || [])
    .filter((r) => r.tokens)
    .map((r) => ({
      id: r.tokens.id,
      tokenNumber: r.tokens.token_number,
      tokenDate: r.tokens.token_date,
      status: r.tokens.status,
      isPriority: r.tokens.is_priority,
      createdAt: r.tokens.created_at,
      calledAt: r.tokens.called_at,
      startedAt: r.tokens.started_at,
      completedAt: r.tokens.completed_at,
      doctorName: r.tokens.doctors?.profiles?.full_name ?? 'Doctor',
      departmentName: r.tokens.doctors?.departments?.name ?? '',
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function fetchAdminTokens({ date, doctorId, status, search, limit = 100, offset = 0 } = {}) {
  try {
    const data = await rpc('admin_list_all_tokens', {
      p_date: date || null,
      p_doctor_id: doctorId || null,
      p_status: status || null,
      p_search: search || null,
      p_limit: limit,
      p_offset: offset,
    })
    if (data) return data
  } catch (err) {
    console.warn('admin_list_all_tokens RPC fallback', err)
  }

  // Fallback to table query
  let q = supabase
    .from('tokens')
    .select('*, token_details(patient_id, patient_name, patient_phone), doctors(profiles(full_name), departments(name))')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (date) q = q.eq('token_date', date)
  if (doctorId) q = q.eq('doctor_id', doctorId)
  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) throw error

  return (data || []).map((t) => {
    const td = Array.isArray(t.token_details) ? t.token_details[0] : t.token_details
    return {
      id: t.id,
      tokenNumber: t.token_number,
      tokenDate: t.token_date,
      status: t.status,
      isPriority: t.is_priority,
      createdAt: t.created_at,
      calledAt: t.called_at,
      startedAt: t.started_at,
      completedAt: t.completed_at,
      doctorId: t.doctor_id,
      doctorName: t.doctors?.profiles?.full_name ?? 'Doctor',
      departmentName: t.doctors?.departments?.name ?? '',
      patientId: td?.patient_id ?? null,
      patientName: td?.patient_name ?? 'Patient',
      patientPhone: td?.patient_phone ?? '',
    }
  })
}

// ---------- queue helpers ----------
export const ACTIVE = ['waiting', 'called', 'in_consultation']

// Emergency first, then lowest token number
export const queueOrder = (a, b) =>
  Number(b.is_priority) - Number(a.is_priority) || a.token_number - b.token_number

export const waitingFor = (tokens, doctorId) =>
  tokens.filter((t) => t.doctor_id === doctorId && t.status === 'waiting').sort(queueOrder)

export const nowServing = (tokens, doctorId) =>
  tokens.find((t) => t.doctor_id === doctorId && (t.status === 'in_consultation' || t.status === 'called')) || null

// Use real average once doctor has at least 5 finished consultations today,
// otherwise fall back to doctor's default (10 minutes).
export function avgMinutesFor(tokens, doctor) {
  const done = tokens.filter(
    (t) => t.doctor_id === doctor.id && t.status === 'completed' && t.started_at && t.completed_at,
  )
  if (done.length < 5) return doctor.avgMinutes || 10
  const total = done.reduce((s, t) => s + (new Date(t.completed_at) - new Date(t.started_at)), 0)
  return Math.max(1, Math.round(total / done.length / 60000))
}

export const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '-'

export const fmtDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata',
      })
    : '-'
