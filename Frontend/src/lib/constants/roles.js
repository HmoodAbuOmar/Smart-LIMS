/** Planned roles — confirm against API docs when available. */
export const ROLES = {
  ADMIN: 'ADMIN',
  PATIENT: 'PATIENT',
  RECEPTIONIST: 'RECEPTIONIST',
  LAB_TECHNICIAN: 'LAB_TECHNICIAN',
}

export const ROLE_LABELS = {
  [ROLES.ADMIN]: 'Administrator',
  [ROLES.PATIENT]: 'Patient',
  [ROLES.RECEPTIONIST]: 'Receptionist',
  [ROLES.LAB_TECHNICIAN]: 'Lab technician',
}

export function dashboardPathForRole(role) {
  switch (role) {
    case ROLES.ADMIN:
      return '/app/admin/dashboard'
    case ROLES.PATIENT:
      return '/app/patient/dashboard'
    case ROLES.RECEPTIONIST:
      return '/app/reception/dashboard'
    case ROLES.LAB_TECHNICIAN:
      return '/app/lab/dashboard'
    default:
      return '/login'
  }
}

export function roleFromAppPath(pathname) {
  if (pathname.startsWith('/app/admin')) return ROLES.ADMIN
  if (pathname.startsWith('/app/patient')) return ROLES.PATIENT
  if (pathname.startsWith('/app/reception')) return ROLES.RECEPTIONIST
  if (pathname.startsWith('/app/lab')) return ROLES.LAB_TECHNICIAN
  return null
}
