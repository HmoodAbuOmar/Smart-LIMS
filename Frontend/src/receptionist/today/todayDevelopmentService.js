import { canCheckIn, canMarkNoShow, todayDate } from './todayModel.js'
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
export function createTodayService({ initial, now = () => new Date(), delay = 140, beforeWrite = async () => {} } = {}) {
  const data = structuredClone(initial ?? createTodayData(now()))
  const wait = () => new Promise(resolve => setTimeout(resolve, delay))
  const fail = code => { const error = new Error(code); error.code = code; throw error }
  async function change(id, version, action) {
    await wait()
    await beforeWrite(action, id)
    const record = data.find(appointment => appointment.id === id)
    if (!record || record.version !== version) fail('APPOINTMENT_CHANGED')
    const timestamp = now()
    if (todayDate(new Date(record.startsAt)) !== todayDate(timestamp)) fail('APPOINTMENT_CHANGED')
    if (action === 'checkIn' ? !canCheckIn(record) : !canMarkNoShow(record, timestamp)) fail('APPOINTMENT_STATE_CONFLICT')
    record.status = action === 'checkIn' ? 'CHECKED_IN' : 'NO_SHOW'
    if (action === 'checkIn') record.arrivedAt = timestamp.toISOString()
    record.version++
    return structuredClone(record)
  }
  return { async load() { await wait(); return structuredClone(data) }, checkIn: (id, version) => change(id, version, 'checkIn'), markNoShow: (id, version) => change(id, version, 'noShow') }
}
