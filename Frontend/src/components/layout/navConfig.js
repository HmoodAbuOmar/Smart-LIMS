import { ROLES } from '../../lib/constants/roles'

export const NAV_BY_ROLE = {
  [ROLES.ADMIN]: [
    { to: '/app/admin/dashboard', label: 'Dashboard' },
    { to: '/app/admin/users', label: 'Users' },
    { to: '/app/admin/tests', label: 'Laboratory tests' },
    { to: '/app/admin/test-parameters', label: 'Test parameters' },
    { to: '/app/admin/reference-ranges', label: 'Reference ranges' },
    { to: '/app/admin/appointment-slots', label: 'Appointment slots' },
    { to: '/app/admin/audit-logs', label: 'Audit logs' },
  ],
  [ROLES.PATIENT]: [
    { to: '/app/patient/dashboard', label: 'Dashboard' },
    { to: '/app/patient/assessments/new', label: 'Symptom assessment' },
    { to: '/app/patient/suggested-tests', label: 'Suggested tests' },
    { to: '/app/patient/catalog', label: 'Test catalog' },
    { to: '/app/patient/orders', label: 'Orders' },
    { to: '/app/patient/appointments', label: 'Appointments' },
    { to: '/app/patient/payments', label: 'Payments' },
    { to: '/app/patient/results', label: 'Results' },
    { to: '/app/patient/notifications', label: 'Notifications' },
  ],
  [ROLES.RECEPTIONIST]: [
    { to: '/app/reception/dashboard', label: 'Dashboard' },
    { to: '/app/reception/patients', label: 'Patients' },
    { to: '/app/reception/orders', label: 'Orders' },
    { to: '/app/reception/appointments', label: 'Appointments' },
    { to: '/app/reception/payments', label: 'Payments' },
  ],
  [ROLES.LAB_TECHNICIAN]: [
    { to: '/app/lab/dashboard', label: 'Dashboard' },
    { to: '/app/lab/worklist', label: 'Worklist' },
    { to: '/app/lab/samples', label: 'Samples' },
    { to: '/app/lab/sample-tests', label: 'Sample tests' },
    { to: '/app/lab/notifications', label: 'Notifications' },
  ],
}
