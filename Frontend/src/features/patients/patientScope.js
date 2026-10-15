export function patientIdFromAuth(user) {
  return user?.patientId ?? 'pat-1001'
}

export function filterForPatient(list, patientId, key = 'patientId') {
  return (list ?? []).filter((row) => row[key] === patientId)
}

export function isUpcomingAppointment(appt) {
  const today = new Date().toISOString().slice(0, 10)
  const cancelled = String(appt.status).toUpperCase() === 'CANCELLED'
  return !cancelled && String(appt.date) >= today
}
