import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { queueOrder, waitingFor, nowServing, avgMinutesFor, ACTIVE } from '../src/lib/api.js'
import { ROLE_HOME } from '../src/lib/constants.js'

describe('Token Queue Ordering & Business Logic (Requirement E)', () => {
  it('prioritizes emergency tokens over regular tokens regardless of token number', () => {
    const regularToken1 = { token_number: 1, is_priority: false }
    const regularToken2 = { token_number: 2, is_priority: false }
    const emergencyToken5 = { token_number: 5, is_priority: true }
    const emergencyToken9 = { token_number: 9, is_priority: true }

    const queue = [regularToken1, emergencyToken9, regularToken2, emergencyToken5]
    queue.sort(queueOrder)

    // Emergency tokens first, sorted by number (5, then 9)
    assert.equal(queue[0].token_number, 5)
    assert.equal(queue[0].is_priority, true)
    assert.equal(queue[1].token_number, 9)
    assert.equal(queue[1].is_priority, true)

    // Regular tokens next, sorted by number (1, then 2)
    assert.equal(queue[2].token_number, 1)
    assert.equal(queue[2].is_priority, false)
    assert.equal(queue[3].token_number, 2)
    assert.equal(queue[3].is_priority, false)
  })

  it('filters and sorts waiting tokens for a specific doctor correctly', () => {
    const doctorId = 'doc-123'
    const tokens = [
      { id: 't1', doctor_id: doctorId, status: 'waiting', token_number: 3, is_priority: false },
      { id: 't2', doctor_id: 'other-doc', status: 'waiting', token_number: 1, is_priority: true },
      { id: 't3', doctor_id: doctorId, status: 'called', token_number: 1, is_priority: false },
      { id: 't4', doctor_id: doctorId, status: 'waiting', token_number: 2, is_priority: true },
      { id: 't5', doctor_id: doctorId, status: 'completed', token_number: 4, is_priority: false },
    ]

    const waiting = waitingFor(tokens, doctorId)
    assert.equal(waiting.length, 2)
    // Emergency t4 (#2) comes before regular t1 (#3)
    assert.equal(waiting[0].id, 't4')
    assert.equal(waiting[1].id, 't1')
  })

  it('identifies currently serving patient in consultation or called', () => {
    const doctorId = 'doc-123'
    const tokensCalled = [
      { id: 't1', doctor_id: doctorId, status: 'called', token_number: 1 },
      { id: 't2', doctor_id: doctorId, status: 'waiting', token_number: 2 },
    ]
    assert.equal(nowServing(tokensCalled, doctorId)?.token_number, 1)

    const tokensInConsult = [
      { id: 't3', doctor_id: doctorId, status: 'in_consultation', token_number: 3 },
      { id: 't4', doctor_id: doctorId, status: 'waiting', token_number: 4 },
    ]
    assert.equal(nowServing(tokensInConsult, doctorId)?.token_number, 3)

    const tokensNone = [
      { id: 't5', doctor_id: doctorId, status: 'waiting', token_number: 5 },
      { id: 't6', doctor_id: doctorId, status: 'completed', token_number: 6 },
    ]
    assert.equal(nowServing(tokensNone, doctorId), null)
  })

  it('calculates average consultation time correctly with fallback for < 5 samples', () => {
    const doctor = { id: 'doc-1', avgMinutes: 12 }
    const tokensFew = [
      {
        doctor_id: 'doc-1',
        status: 'completed',
        started_at: '2026-10-19T10:00:00Z',
        completed_at: '2026-10-19T10:15:00Z', // 15 mins
      },
    ]

    // Less than 5 completed consultations -> falls back to doctor default
    assert.equal(avgMinutesFor(tokensFew, doctor), 12)

    // With 5 completed consultations of 20 mins each
    const tokensFive = [
      { doctor_id: 'doc-1', status: 'completed', started_at: '2026-10-19T10:00:00Z', completed_at: '2026-10-19T10:20:00Z' },
      { doctor_id: 'doc-1', status: 'completed', started_at: '2026-10-19T10:20:00Z', completed_at: '2026-10-19T10:40:00Z' },
      { doctor_id: 'doc-1', status: 'completed', started_at: '2026-10-19T10:40:00Z', completed_at: '2026-10-19T11:00:00Z' },
      { doctor_id: 'doc-1', status: 'completed', started_at: '2026-10-19T11:00:00Z', completed_at: '2026-10-19T11:20:00Z' },
      { doctor_id: 'doc-1', status: 'completed', started_at: '2026-10-19T11:20:00Z', completed_at: '2026-10-19T11:40:00Z' },
    ]
    assert.equal(avgMinutesFor(tokensFive, doctor), 20)
  })

  it('verifies ACTIVE statuses', () => {
    assert.deepEqual(ACTIVE, ['waiting', 'called', 'in_consultation'])
  })
})

describe('Role Home Redirections (Requirements D & E)', () => {
  it('maps all roles to their designated dashboards', () => {
    assert.equal(ROLE_HOME.patient, '/patient')
    assert.equal(ROLE_HOME.doctor, '/doctor')
    assert.equal(ROLE_HOME.receptionist, '/reception')
    assert.equal(ROLE_HOME.admin, '/admin')
  })
})
