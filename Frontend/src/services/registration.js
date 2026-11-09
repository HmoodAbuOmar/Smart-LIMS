import { validateAuth } from '../utils/authValidation.js'

// User-account details only; patient medical data belongs to onboarding.js.
export const registrationFields = ['name', 'email', 'password', 'confirmPassword']
export function validateRegistration(values) { return validateAuth(values, 'signup') }
export function toRegistrationPayload(values) {
  return { fullName: values.name.trim(), email: values.email.trim(), password: values.password }
}
// Local validation only. Add the account API adapter here when its contract exists.
export function prepareRegistration(values) {
  const errors = validateRegistration(values)
  return { status: Object.keys(errors).length ? 'invalid' : 'validated', errors }
}
