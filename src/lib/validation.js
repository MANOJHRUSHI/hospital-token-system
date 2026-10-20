// Validation helpers for Hospital Token System

// Enforce 10 numeric digits starting with valid Indian mobile digits (6, 7, 8, 9)
export const validateIndianPhone = (phone) => {
  if (!phone) return false
  const clean = String(phone).trim()
  return /^[6-9]\d{9}$/.test(clean)
}

// Enforce minimum password length of 6 characters for all roles
export const validatePassword = (pwd) => {
  return typeof pwd === 'string' && pwd.length >= 6
}
