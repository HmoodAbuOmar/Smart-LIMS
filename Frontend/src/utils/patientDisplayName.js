// Presentation only: leave the underlying record and any edited name unchanged.
export function patientDisplayName(value, fallback) {
  return /^(sample patient|مريض نموذجي)$/iu.test(value || '') ? fallback : value
}
