import { createAppointmentsStore } from '../appointments/appointmentsDevelopmentStore.js'
import { todayDate } from './todayModel.js'
export function createTodayData(now = new Date()) {
  const date = todayDate(now)
  // Midday UTC lies on the same calendar day in the scheduling zone, including DST.
  const at = hour => `${date}T${String(hour).padStart(2, '0')}:00:00Z`
  const patients = [
    { id: 'r01-patient-1', fileNumber: 'P-2001', nameEn: 'Lina Haddad', nameAr: 'لينا حداد' },
    { id: 'r01-patient-2', fileNumber: 'P-2002', nameEn: 'Omar Nasser', nameAr: 'عمر ناصر' },
    { id: 'r01-patient-3', fileNumber: 'P-2003', nameEn: 'Maya Saleh', nameAr: 'مايا صالح' },
    { id: 'r01-patient-4', fileNumber: 'P-2004', nameEn: 'Yousef Ali', nameAr: 'يوسف علي' },
  ]
  return ['BOOKED', 'CHECKED_IN', 'NO_SHOW', 'BOOKED', 'COMPLETED', 'CANCELLED', 'BOOKED'].map((status, i) => ({
    id: `r01-appointment-${i + 1}`, patient: patients[i % patients.length],
    orderId: i === 6 ? null : `r01-order-${i + 1}`, orderNumber: i === 6 ? null : `ORD-${5001 + i}`,
    orderItemIds: i === 6 ? [] : [`r01-item-${i + 1}`],
    startsAt: at(6 + i), endsAt: `${date}T${String(6 + i).padStart(2, '0')}:30:00Z`,
    status, arrivedAt: ['CHECKED_IN', 'COMPLETED'].includes(status) ? at(6 + i) : null,
    version: 0, checkInEligible: i !== 6, noShowSupported: true,
  }))
}
export function createTodayService(options = {}) {
  return createAppointmentsStore({ ...options, initial: options.initial ?? createTodayData((options.now || (() => new Date()))()) })
}
