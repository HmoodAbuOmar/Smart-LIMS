export function validatePatientForm({ fullName, email, phone }) {
  const errors = {}
  if (!String(fullName ?? '').trim()) {
    errors.fullName = 'Full name is required.'
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
    errors.email = 'Enter a valid email address.'
  }
  if (phone && String(phone).trim().length < 6) {
    errors.phone = 'Phone number looks too short.'
  }
  return errors
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}
