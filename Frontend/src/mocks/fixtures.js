/**
 * UNVERIFIED mock fixtures — replace with documented DTOs when API docs exist.
 */

export const mockUsers = [
  {
    id: 'usr-admin-1',
    email: 'admin@smartlims.demo',
    fullName: 'Alex Admin',
    role: 'ADMIN',
    status: 'ACTIVE',
  },
  {
    id: 'usr-patient-1',
    email: 'patient@smartlims.demo',
    fullName: 'Sam Patient',
    role: 'PATIENT',
    status: 'ACTIVE',
  },
  {
    id: 'usr-recep-1',
    email: 'reception@smartlims.demo',
    fullName: 'Rina Reception',
    role: 'RECEPTIONIST',
    status: 'ACTIVE',
  },
  {
    id: 'usr-lab-1',
    email: 'lab@smartlims.demo',
    fullName: 'Leo Lab Tech',
    role: 'LAB_TECHNICIAN',
    status: 'ACTIVE',
  },
]

export const mockPatients = [
  {
    id: 'pat-1001',
    mrn: 'MRN-1001',
    fullName: 'Sam Patient',
    dateOfBirth: '1990-04-12',
    phone: '+1 555 0100',
    email: 'patient@smartlims.demo',
  },
  {
    id: 'pat-1002',
    mrn: 'MRN-1002',
    fullName: 'Jordan Lee',
    dateOfBirth: '1985-11-03',
    phone: '+1 555 0101',
    email: 'jordan@example.com',
  },
]

export const mockLabTests = [
  { id: 'tst-cbc', code: 'CBC', name: 'Complete blood count', price: 45, status: 'ACTIVE' },
  { id: 'tst-lipid', code: 'LIPID', name: 'Lipid panel', price: 60, status: 'ACTIVE' },
  { id: 'tst-hba1c', code: 'HBA1C', name: 'HbA1c', price: 38, status: 'ACTIVE' },
]

export const mockTestParameters = [
  { id: 'prm-wbc', testId: 'tst-cbc', code: 'WBC', name: 'White blood cells', unit: '10^9/L' },
  { id: 'prm-hgb', testId: 'tst-cbc', code: 'HGB', name: 'Hemoglobin', unit: 'g/dL' },
]

export const mockReferenceRanges = [
  {
    id: 'rr-wbc-adult',
    parameterId: 'prm-wbc',
    label: 'Adult default',
    min: 4,
    max: 11,
    unit: '10^9/L',
    sex: 'ANY',
  },
]

export const mockOrders = [
  {
    id: 'ord-5001',
    patientId: 'pat-1001',
    patientName: 'Sam Patient',
    status: 'PENDING',
    createdAt: '2026-03-01',
    totalAmount: 105,
  },
  {
    id: 'ord-5002',
    patientId: 'pat-1002',
    patientName: 'Jordan Lee',
    status: 'COMPLETED',
    createdAt: '2026-02-20',
    totalAmount: 45,
  },
]

export const mockOrderItems = [
  { id: 'oi-1', orderId: 'ord-5001', testCode: 'CBC', testName: 'Complete blood count', price: 45 },
  { id: 'oi-2', orderId: 'ord-5001', testCode: 'LIPID', testName: 'Lipid panel', price: 60 },
]

export const mockAppointmentSlots = [
  { id: 'slot-1', date: '2026-03-10', startTime: '09:00', endTime: '09:30', capacity: 4, booked: 2 },
  { id: 'slot-2', date: '2026-03-10', startTime: '10:00', endTime: '10:30', capacity: 4, booked: 1 },
]

export const mockAppointments = [
  {
    id: 'appt-1',
    patientId: 'pat-1001',
    patientName: 'Sam Patient',
    slotId: 'slot-1',
    status: 'SCHEDULED',
    date: '2026-03-10',
    time: '09:00',
  },
]

export const mockPayments = [
  {
    id: 'pay-1',
    orderId: 'ord-5001',
    amount: 105,
    status: 'PENDING',
    method: 'CASH',
    recordedAt: '2026-03-01',
  },
]

export const mockSamples = [
  {
    id: 'smp-9001',
    orderId: 'ord-5001',
    barcode: 'SL-9001',
    status: 'COLLECTED',
    collectedAt: '2026-03-02',
  },
]

export const mockSampleTests = [
  { id: 'st-1', sampleId: 'smp-9001', testCode: 'CBC', status: 'PENDING' },
  { id: 'st-2', sampleId: 'smp-9001', testCode: 'LIPID', status: 'PENDING' },
]

export const mockTestResults = [
  {
    id: 'res-7001',
    orderId: 'ord-5002',
    patientName: 'Jordan Lee',
    status: 'PUBLISHED',
    publishedAt: '2026-02-22',
  },
  {
    id: 'res-7002',
    orderId: 'ord-5001',
    patientName: 'Sam Patient',
    status: 'DRAFT',
    publishedAt: null,
  },
]

export const mockResultValues = [
  { id: 'rv-1', resultId: 'res-7001', parameterCode: 'WBC', value: '7.2', unit: '10^9/L', flag: 'NORMAL' },
  { id: 'rv-2', resultId: 'res-7001', parameterCode: 'HGB', value: '14.1', unit: 'g/dL', flag: 'NORMAL' },
]

export const mockNotifications = [
  {
    id: 'ntf-1',
    title: 'Result published',
    body: 'Your CBC results are available.',
    read: false,
    createdAt: '2026-02-22T10:00:00Z',
  },
  {
    id: 'ntf-2',
    title: 'Appointment reminder',
    body: 'Sample collection on 10 Mar at 09:00.',
    read: true,
    createdAt: '2026-03-08T09:00:00Z',
  },
]

export const mockAuditLogs = [
  {
    id: 'aud-1',
    action: 'USER_LOGIN',
    actor: 'admin@smartlims.demo',
    timestamp: '2026-03-09T08:01:00Z',
    resource: 'Auth',
  },
  {
    id: 'aud-2',
    action: 'ORDER_CREATED',
    actor: 'reception@smartlims.demo',
    timestamp: '2026-03-01T14:22:00Z',
    resource: 'Order ord-5001',
  },
]

export const mockAssessments = [
  {
    id: 'asm-1',
    patientId: 'pat-1001',
    summary: 'Fatigue, mild fever',
    createdAt: '2026-02-28',
    status: 'COMPLETED',
  },
]

export const mockSuggestedTests = [
  { id: 'sg-1', assessmentId: 'asm-1', testCode: 'CBC', testName: 'Complete blood count', selected: true },
  { id: 'sg-2', assessmentId: 'asm-1', testCode: 'LIPID', testName: 'Lipid panel', selected: false },
]

export function findById(list, id) {
  return list.find((item) => item.id === id) ?? null
}
