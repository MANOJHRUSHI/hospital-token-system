import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateIndianPhone, validatePassword } from '../src/lib/validation.js'

describe('Patient Phone Number Validation (Requirement B)', () => {
  it('accepts valid 10-digit Indian mobile numbers starting with 6, 7, 8, 9', () => {
    assert.equal(validateIndianPhone('9876543210'), true)
    assert.equal(validateIndianPhone('8123456789'), true)
    assert.equal(validateIndianPhone('7000000000'), true)
    assert.equal(validateIndianPhone('6999999999'), true)
    assert.equal(validateIndianPhone(' 9876543210 '), true) // trims whitespace
  })

  it('rejects phone numbers with letters, punctuation, spaces, or non-digits', () => {
    assert.equal(validateIndianPhone('98765abcde'), false)
    assert.equal(validateIndianPhone('98765 43210'), false)
    assert.equal(validateIndianPhone('98765-43210'), false)
    assert.equal(validateIndianPhone('+919876543210'), false) // Raw input must be 10 digits
    assert.equal(validateIndianPhone('98765.43210'), false)
  })

  it('rejects numbers that are less than 10 digits', () => {
    assert.equal(validateIndianPhone('98765'), false)
    assert.equal(validateIndianPhone('987654321'), false)
    assert.equal(validateIndianPhone('9'), false)
  })

  it('rejects numbers that are more than 10 digits', () => {
    assert.equal(validateIndianPhone('98765432101'), false)
    assert.equal(validateIndianPhone('987654321012345'), false)
  })

  it('rejects invalid initial digits (not valid Indian mobile prefixes)', () => {
    assert.equal(validateIndianPhone('0987654321'), false)
    assert.equal(validateIndianPhone('1234567890'), false)
    assert.equal(validateIndianPhone('2345678901'), false)
    assert.equal(validateIndianPhone('3456789012'), false)
    assert.equal(validateIndianPhone('4567890123'), false)
    assert.equal(validateIndianPhone('5678901234'), false)
  })

  it('rejects empty, null, and undefined values', () => {
    assert.equal(validateIndianPhone(''), false)
    assert.equal(validateIndianPhone(null), false)
    assert.equal(validateIndianPhone(undefined), false)
  })
})

describe('Minimum Password Length Validation (Requirement C)', () => {
  it('accepts passwords with 6 or more characters for all roles', () => {
    assert.equal(validatePassword('123456'), true)
    assert.equal(validatePassword('abcdef'), true)
    assert.equal(validatePassword('securePass123!'), true)
    assert.equal(validatePassword('veryLongPasswordWithSymbols#9'), true)
  })

  it('rejects passwords shorter than 6 characters', () => {
    assert.equal(validatePassword(''), false)
    assert.equal(validatePassword('1'), false)
    assert.equal(validatePassword('12345'), false)
    assert.equal(validatePassword('admin'), false)
    assert.equal(validatePassword('doc'), false)
  })

  it('rejects non-string values', () => {
    assert.equal(validatePassword(null), false)
    assert.equal(validatePassword(undefined), false)
    assert.equal(validatePassword(123456), false)
  })
})
