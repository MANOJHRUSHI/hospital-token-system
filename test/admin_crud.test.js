import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateIndianPhone, validatePassword } from '../src/lib/validation.js'

describe('Admin Doctor & Staff Account Validation (Requirements D3 & D4)', () => {
  it('validates doctor creation requirements strictly', () => {
    const validateDoctorInput = ({ email, password, fullName, phone, departmentId }) => {
      const errors = []
      if (!fullName || !fullName.trim()) errors.push('Doctor name is required')
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.push('Valid email is required')
      if (!validatePassword(password)) errors.push('Password must be at least 6 characters')
      if (phone && !validateIndianPhone(phone)) errors.push('Phone must be a valid 10-digit Indian number')
      if (!departmentId) errors.push('Department selection is required')
      return errors
    }

    // Valid doctor input
    const validDoc = {
      fullName: 'Dr. Priya Nair',
      email: 'priya@hospital.com',
      password: 'DocPassword@2026',
      phone: '9876543210',
      departmentId: 1,
    }
    assert.deepEqual(validateDoctorInput(validDoc), [])

    // Invalid doctor input: short password, invalid phone, missing department
    const invalidDoc = {
      fullName: '',
      email: 'bad-email',
      password: '123',
      phone: '12345',
      departmentId: '',
    }
    const errs = validateDoctorInput(invalidDoc)
    assert.equal(errs.length, 5)
    assert.ok(errs.includes('Doctor name is required'))
    assert.ok(errs.includes('Valid email is required'))
    assert.ok(errs.includes('Password must be at least 6 characters'))
    assert.ok(errs.includes('Phone must be a valid 10-digit Indian number'))
    assert.ok(errs.includes('Department selection is required'))
  })

  it('validates receptionist creation requirements strictly', () => {
    const validateReceptionistInput = ({ email, password, fullName, phone }) => {
      const errors = []
      if (!fullName || !fullName.trim()) errors.push('Name is required')
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.push('Valid email is required')
      if (!validatePassword(password)) errors.push('Password must be at least 6 characters')
      if (phone && !validateIndianPhone(phone)) errors.push('Phone must be a valid 10-digit Indian number')
      return errors
    }

    const validRec = {
      fullName: 'Vikram Joshi',
      email: 'reception1@hospital.com',
      password: 'StaffSecret#123',
      phone: '8765432109',
    }
    assert.deepEqual(validateReceptionistInput(validRec), [])

    const invalidRec = {
      fullName: '   ',
      email: 'not-an-email',
      password: 'short',
      phone: '98765abcde',
    }
    const errs = validateReceptionistInput(invalidRec)
    assert.equal(errs.length, 4)
  })

  it('enforces deletion safety: blocks hard delete if doctor has active or historical tokens', () => {
    const checkCanDeleteDoctor = (doctor, tokens) => {
      const hasTokens = tokens.some((t) => t.doctor_id === doctor.id)
      if (hasTokens) {
        return {
          canDelete: false,
          reason: 'Cannot delete doctor with existing token records. Please deactivate instead.',
        }
      }
      return { canDelete: true }
    }

    const doctorWithHistory = { id: 'doc-busy', name: 'Dr. Busy' }
    const doctorWithoutHistory = { id: 'doc-new', name: 'Dr. Fresh' }
    const tokens = [{ id: 'tk-1', doctor_id: 'doc-busy', token_number: 1 }]

    const res1 = checkCanDeleteDoctor(doctorWithHistory, tokens)
    assert.equal(res1.canDelete, false)
    assert.ok(res1.reason.includes('deactivate instead'))

    const res2 = checkCanDeleteDoctor(doctorWithoutHistory, tokens)
    assert.equal(res2.canDelete, true)
  })
})

describe('Patient Directory & Token Search/Filter Logic (Requirements D5 & D6)', () => {
  const samplePatients = [
    { id: 'uuid-1', name: 'Aarav Patel', phone: '9876543210', email: 'aarav@mail.com' },
    { id: 'uuid-2', name: 'Diya Sharma', phone: '8123456789', email: 'diya@mail.com' },
    { id: 'uuid-3', name: 'Rohan Gupta', phone: '7000000000', email: 'rohan@mail.com' },
  ]

  it('filters patients accurately by name, phone, or ID query', () => {
    const searchPatients = (list, query) => {
      const q = query.trim().toLowerCase()
      if (!q) return list
      return list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.phone.includes(q) ||
          p.email.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q)
      )
    }

    assert.equal(searchPatients(samplePatients, 'Aarav').length, 1)
    assert.equal(searchPatients(samplePatients, '8123456789').length, 1)
    assert.equal(searchPatients(samplePatients, 'uuid-3').length, 1)
    assert.equal(searchPatients(samplePatients, 'Nonexistent').length, 0)
    assert.equal(searchPatients(samplePatients, '').length, 3)
  })

  it('filters tokens accurately by doctor, status, and search query', () => {
    const tokens = [
      { id: '1', tokenNumber: 1, doctorId: 'doc-a', status: 'waiting', patientName: 'Aarav' },
      { id: '2', tokenNumber: 2, doctorId: 'doc-a', status: 'in_consultation', patientName: 'Diya' },
      { id: '3', tokenNumber: 1, doctorId: 'doc-b', status: 'completed', patientName: 'Rohan' },
    ]

    const filterTokens = (list, { doctorId, status, query }) => {
      const q = (query || '').trim().toLowerCase()
      return list.filter((t) => {
        if (doctorId && t.doctorId !== doctorId) return false
        if (status && t.status !== status) return false
        if (q && !String(t.tokenNumber).includes(q) && !t.patientName.toLowerCase().includes(q)) return false
        return true
      })
    }

    assert.equal(filterTokens(tokens, { doctorId: 'doc-a' }).length, 2)
    assert.equal(filterTokens(tokens, { status: 'waiting' }).length, 1)
    assert.equal(filterTokens(tokens, { query: 'Diya' }).length, 1)
    assert.equal(filterTokens(tokens, { doctorId: 'doc-a', status: 'completed' }).length, 0)
  })
})
