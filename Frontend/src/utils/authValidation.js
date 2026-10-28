// UI validation only. No credentials are persisted or submitted without an API.
export function validateAuth(values, mode) {
  const errors = {}
  if (mode === 'signup' && !values.name.trim()) errors.name = 'nameRequired'
  if (!values.email.trim()) errors.email = 'emailRequired'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) errors.email = 'emailInvalid'
  if (!values.password) errors.password = 'passwordRequired'
  else if (mode === 'signup' && (
    [...values.password].length < 8 ||
    !/\p{L}/u.test(values.password) ||
    !/\p{N}/u.test(values.password) ||
    !/[^\p{L}\p{N}\s]/u.test(values.password)
  )) errors.password = 'passwordWeak'
  if (mode === 'signup') {
    if (!values.confirmPassword) errors.confirmPassword = 'confirmRequired'
    else if (values.password !== values.confirmPassword) errors.confirmPassword = 'passwordMismatch'
  }
  return errors
}
