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
