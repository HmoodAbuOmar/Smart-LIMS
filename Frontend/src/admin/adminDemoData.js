// Isolated, deterministic fictional records. No API, patient state, or persistence.
export const demoDate = '2026-11-01'
const patients = [
  ['Omar Nasser', 'عمر ناصر'], ['Lina Haddad', 'لينا حداد'],
  ['Yousef Mansour', 'يوسف منصور'], ['Mariam Saleh', 'مريم صالح'],
  ['Khaled Darwish', 'خالد درويش'], ['Noor Hamdan', 'نور حمدان'],
]
export const demoTests = [
  { id: 'cbc', name: ['Complete blood count', 'تعداد الدم الكامل'], price: 45 },
  { id: 'lipid', name: ['Lipid profile', 'فحص الدهون'], price: 70 },
  { id: 'thyroid', name: ['Thyroid panel', 'فحص الغدة الدرقية'], price: 120 },
  { id: 'glucose', name: ['Fasting blood glucose', 'سكر الدم الصائم'], price: 25 },
  { id: 'liver', name: ['Liver function panel', 'فحوصات وظائف الكبد'], price: 85 },
  { id: 'renal', name: ['Renal function panel', 'فحوصات وظائف الكلى'], price: 80 },
]
export function offsetDate(offset) {
  const date = new Date(`${demoDate}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}
const volumes = [4, 6, 5, 7, 6, 8, 5, 9, 7, 8, 6, 10, 8, 7]
export const demoOrders = volumes.flatMap((count, day) => Array.from({ length: count }, (_, index) => {
  const test = demoTests[(day + index) % demoTests.length]
  const status = day < 11 ? 'completed' : ['received', 'processing', 'review', 'completed'][index % 4]
  return {
    id: `DEMO-O-${String(day + 1).padStart(2, '0')}${String(index + 1).padStart(2, '0')}`,
    patient: patients[(day + index) % patients.length], testId: test.id,
    date: offsetDate(day - 13), time: `${String(8 + index).padStart(2, '0')}:15`,
    status, payment: status === 'received' ? 'pending' : 'paid', amount: test.price,
  }
})).reverse()

export const demoAppointments = Array.from({ length: 6 }, (_, index) => ({
  id: `DEMO-A-${String(index + 1).padStart(3, '0')}`,
  patient: patients[index], testId: demoTests[index].id,
  date: offsetDate(Math.floor(index / 2)), time: index % 2 ? '11:30' : '09:00',
  status: index === 3 ? 'pending' : 'confirmed',
}))

// A01-only historical event fixtures. Confirmations are collection events, not
// appointment bookings; refunds are explicit amounts, never inferred from orders.
export const demoSampleEvents = [
  { id: 'DEMO-S-001', orderId: 'DEMO-O-1401', date: offsetDate(0), status: 'rejected' },
  { id: 'DEMO-S-002', orderId: 'DEMO-O-1203', date: offsetDate(-2), status: 'rejected' },
  { id: 'DEMO-S-003', orderId: 'DEMO-O-0602', date: offsetDate(-8), status: 'rejected' },
  { id: 'DEMO-S-004', orderId: 'DEMO-O-1404', date: offsetDate(0), status: 'accepted' },
]
export const demoCollectionEvents = [
  { id: 'DEMO-C-001', orderId: 'DEMO-O-1404', date: offsetDate(0), status: 'confirmed' },
  { id: 'DEMO-C-002', orderId: 'DEMO-O-1302', date: offsetDate(-1), status: 'confirmed' },
  { id: 'DEMO-C-003', orderId: 'DEMO-O-1204', date: offsetDate(-2), status: 'confirmed' },
  { id: 'DEMO-C-004', orderId: 'DEMO-O-0603', date: offsetDate(-8), status: 'confirmed' },
  { id: 'DEMO-C-005', orderId: 'DEMO-O-1401', date: offsetDate(0), status: 'pending' },
]
export const demoRefundEvents = [
  { id: 'DEMO-F-001', orderId: 'DEMO-O-1404', date: offsetDate(0), status: 'completed', amount: 25, currency: 'ILS' },
  { id: 'DEMO-F-002', orderId: 'DEMO-O-1204', date: offsetDate(-1), status: 'completed', amount: 45, currency: 'ILS' },
  { id: 'DEMO-F-003', orderId: 'DEMO-O-0602', date: offsetDate(-8), status: 'completed', amount: 35, currency: 'ILS' },
  { id: 'DEMO-F-004', orderId: 'DEMO-O-1402', date: offsetDate(0), status: 'pending', amount: 70, currency: 'ILS' },
]
