// Display safeguards complement server authorization; they never replace it.
export function isInternalRecord(record) {
  return record?.source === 'development' || record?.source === 'development-simulator' || /^SAMPLE-/i.test(record?.id || '')
}
export function emptyPatientWorkspace() {
  return { profile: { name: '', nameAr: '', email: '', phone: '', address: '', dateOfBirth: '', gender: '', fileNumber: '' }, tests: [], cart: [], orders: [], appointments: [], results: [], notifications: [] }
}
export function patientFacingWorkspace(workspace) {
  const clean = { ...emptyPatientWorkspace(), ...workspace }
  if (/^SAMPLE-/i.test(clean.profile?.fileNumber || '')) clean.profile = emptyPatientWorkspace().profile
  for (const key of ['orders', 'appointments', 'results']) clean[key] = (clean[key] || []).filter(record => !isInternalRecord(record))
  if (!clean.profile.fileNumber) clean.notifications = []
  return clean
}
export function verifiedBookingResponse(response, draft, profile) {
  const appointment = response?.appointment, order = response?.order
  if (response?.confirmed !== true || response.requestId !== draft.requestId || !appointment || !order || isInternalRecord(appointment) || isInternalRecord(order)) return null
  if (!profile.fileNumber || appointment.patientId !== profile.fileNumber || order.patientId !== profile.fileNumber) return null
  if (!appointment.id || !order.id || appointment.orderId !== order.id || appointment.status !== 'confirmed') return null
  if (appointment.date !== draft.date || appointment.time !== draft.time || appointment.paymentMethod !== draft.method) return null
  if (!Array.isArray(appointment.tests) || !Array.isArray(order.tests) || !draft.tests?.length || appointment.tests.length !== draft.tests.length || order.tests.length !== draft.tests.length || !draft.tests.every(id => appointment.tests.includes(id) && order.tests.includes(id))) return null
  if (!Number.isFinite(appointment.total) || appointment.total < 0 || appointment.total !== order.total || response.currency !== 'ILS') return null
  if (draft.method === 'online' && (response.paymentVerified !== true || appointment.paymentStatus !== 'paid')) return null
  if (draft.method === 'laboratory' && appointment.paymentStatus !== 'pending') return null
  return { appointment: { ...appointment, serverConfirmed: true, source: 'server' }, order: { ...order, source: 'server' } }
}
