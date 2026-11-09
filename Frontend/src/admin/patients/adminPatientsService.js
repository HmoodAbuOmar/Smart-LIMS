import { patientFields, validatePatient } from './adminPatientsModel.js'

// Fictional records; IDs, never names or phone numbers, own all relationships.
const names = [
  ['Lina Nasser', 'لينا ناصر'], ['Omar Khalil', 'عمر خليل'], ['Lina Nasser', 'لينا ناصر'],
  ['Maya Saleh', 'مايا صالح'], ['Adam Hassan', 'آدم حسن'], ['Noor Ahmad', 'نور أحمد'],
  ['Sara Hamdan', 'سارة حمدان'], ['Yousef Ali', 'يوسف علي'], ['Dana Mansour', 'دانا منصور'],
  ['Rami Faris', 'رامي فارس'], ['Hala Samir', 'هالة سمير'], ['Kareem Zaid', 'كريم زيد'],
  ['Amina Hassan Mahmoud Abdulrahman Al-Khatib', 'أمينة حسن محمود عبد الرحمن الخطيب'], ['Sara Mahmoud', 'سارة محمود'],
]
export function createPatientDemoData() {
  const patients = names.map(([nameEn, nameAr], index) => ({
    id: `demo-patient-${index + 1}`, fileNumber: `P-${String(1001 + index)}`, nameEn, nameAr,
    dateOfBirth: `${1980 + index}-03-${String(index + 1).padStart(2, '0')}`,
    gender: index === 12 ? 'UNKNOWN' : index % 2 ? 'MALE' : 'FEMALE',
    phone: index < 3 ? '0599000111' : index === 13 ? '+970599123456' : `059900${String(index).padStart(4, '0')}`,
    address: index % 3 ? '' : 'Demo Street 12', linkedAccountId: index % 2 ? null : `demo-account-${index + 1}`, creator: 'demo-admin',
  }))
  const orders = ['COMPLETED', 'IN_PROGRESS', 'NEW', 'CANCELLED'].map((status, index) => ({ id: `demo-patient-order-${index + 1}`, patientId: patients[0].id, number: `DEMO-PO-${2001 + index}`, date: `2026-10-${20 + index}`, status, total: [150, 100, 80, 60][index] }))
  orders.push({ id: 'demo-patient-order-5', patientId: patients[1].id, number: 'DEMO-PO-2005', date: '2026-10-25', status: 'NEW', total: 120 })
  const appointments = ['BOOKED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].map((status, index) => ({ id: `demo-patient-appointment-${index + 1}`, patientId: patients[0].id, orderId: index < 4 ? orders[index].id : null, date: `2026-11-${String(index + 1).padStart(2, '0')}`, time: '09:30', status }))
  const transactions = [
    { id: 'demo-collection-1', orderId: orders[0].id, type: 'PAYMENT', status: 'CONFIRMED', amount: 150 },
    { id: 'demo-refund-1', orderId: orders[0].id, type: 'REFUND', status: 'CONFIRMED', amount: 20 },
    { id: 'demo-collection-2', orderId: orders[1].id, type: 'PAYMENT', status: 'PENDING', amount: 100 },
    { id: 'demo-collection-3', orderId: orders[2].id, type: 'PAYMENT', status: 'FAILED', amount: 80 },
  ]
  return { patients, orders, appointments, transactions }
}

// Replaceable async boundary. No HTTP, browser storage, or login-account writes.
export function createPatientsMockService(initial = createPatientDemoData(), { delay = 180 } = {}) {
  const data = structuredClone(initial)
  let sequence = 1000
  const wait = () => new Promise(resolve => setTimeout(resolve, delay))
  return {
    async load() { await wait(); return structuredClone(data) },
    async save(values, id) {
      await wait()
      if (Object.keys(validatePatient(values)).length) throw new Error('Invalid patient')
      const fields = patientFields(values)
      if (id) {
        const patient = data.patients.find(item => item.id === id)
        if (!patient) throw new Error('Patient unavailable')
        Object.assign(patient, fields)
        return structuredClone(patient)
      }
      let fileNumber
      do { fileNumber = `P-${++sequence}` } while (data.patients.some(item => item.fileNumber === fileNumber))
      const patient = { ...fields, id: `demo-patient-added-${sequence}`, fileNumber, creator: 'demo-admin', linkedAccountId: null }
      data.patients.push(patient)
      return structuredClone(patient)
    },
  }
}
export const adminPatientsService = createPatientsMockService()
