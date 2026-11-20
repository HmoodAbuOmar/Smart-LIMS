export const SCHEDULING_TIME_ZONE = 'Asia/Jerusalem'
export function todayDate(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: SCHEDULING_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
export function localName(patient, language) { return patient[language === 'ar' ? 'nameAr' : 'nameEn'] }
export function dayAppointments(appointments, date) {
  return appointments.filter(appointment => todayDate(new Date(appointment.startsAt)) === date).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id.localeCompare(b.id))
}
export function arrivalCounts(appointments) {
  return { arrivals: appointments.length, checkedIn: appointments.filter(appointment => appointment.status === 'CHECKED_IN').length, notArrived: appointments.filter(appointment => appointment.status === 'BOOKED').length }
}
export function filterArrivals(appointments, tab) {
  return appointments.filter(appointment => tab === 'arrivals' || (tab === 'checkedIn' ? appointment.status === 'CHECKED_IN' : appointment.status === 'BOOKED'))
}
export function canCheckIn(appointment) {
  return appointment.status === 'BOOKED' && !appointment.arrivedAt && !!appointment.orderId && appointment.orderItemIds?.length > 0 && appointment.checkInEligible === true
}
// VisitService.noShow: booked/CONFIRMED, no existing visit, slot ended, expected version.
export function canMarkNoShow(appointment, now = new Date()) {
  return appointment.status === 'BOOKED' && !appointment.arrivedAt && !!appointment.orderId && appointment.noShowSupported === true && Date.parse(appointment.endsAt) <= now.getTime()
}
export function formatTime(value, language) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar-PS' : 'en-GB', { timeZone: SCHEDULING_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(value))
}
