import { ROLES } from '../lib/constants/roles'

/**
 * UNVERIFIED: Demo accounts for UI review only — not backed by `/api/auth/login`.
 */
export const DEMO_ACCOUNTS = [
  {
    email: 'admin@smartlims.demo',
    password: 'demo',
    role: ROLES.ADMIN,
    fullName: 'Alex Admin',
    id: 'usr-admin-1',
  },
  {
    email: 'patient@smartlims.demo',
    password: 'demo',
    role: ROLES.PATIENT,
    fullName: 'Sam Patient',
    id: 'usr-patient-1',
    patientId: 'pat-1001',
  },
  {
    email: 'reception@smartlims.demo',
    password: 'demo',
    role: ROLES.RECEPTIONIST,
    fullName: 'Rina Reception',
    id: 'usr-recep-1',
  },
  {
    email: 'lab@smartlims.demo',
    password: 'demo',
    role: ROLES.LAB_TECHNICIAN,
    fullName: 'Leo Lab Tech',
    id: 'usr-lab-1',
  },
]

export function findDemoAccount(email, password) {
  const normalized = email.trim().toLowerCase()
  return DEMO_ACCOUNTS.find(
    (a) => a.email === normalized && a.password === password,
  )
}
