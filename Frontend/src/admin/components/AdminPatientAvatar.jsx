// Stable identity-based palette: independent of gender, search, and row order.
import { patientAvatarTone, patientName } from '../adminPatientsModel.js'

export default function AdminPatientAvatar({ patient, language, large = false }) {
  const parts = patientName(patient, language).trim().split(/\s+/)
  const initials = [parts[0], parts.length > 1 ? parts.at(-1) : ''].map(part => [...part][0] || '').join('').toLocaleUpperCase()
  return <span className={`ap-avatar ap-avatar-${patientAvatarTone(patient.id)}${large ? ' ap-avatar-large' : ''}`} aria-hidden="true">{initials}</span>
}
