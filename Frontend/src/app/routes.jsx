import { ROLES } from '../lib/constants/roles'
import { GuestOnlyRoute, ProtectedAppRoute } from '../components/auth/RouteGuard'

import { LandingPage } from '../pages/public/LandingPage'
import { LoginPage } from '../pages/public/LoginPage'
import { RegisterPage } from '../pages/public/RegisterPage'
import { ForgotPasswordPage } from '../pages/public/ForgotPasswordPage'
import { ResetPasswordPage } from '../pages/public/ResetPasswordPage'
import { ConfirmEmailPage } from '../pages/public/ConfirmEmailPage'
import { SetPasswordPage } from '../pages/public/SetPasswordPage'

import { DashboardRedirectPage } from '../pages/shared/DashboardRedirectPage'
import { ProfilePage } from '../pages/shared/ProfilePage'
import { ForbiddenPage } from '../pages/shared/ForbiddenPage'
import { NotFoundPage } from '../pages/shared/NotFoundPage'

import { AdminDashboardPage } from '../pages/admin/AdminDashboardPage'
import { AdminUsersPage } from '../pages/admin/AdminUsersPage'
import { AdminUserDetailPage } from '../pages/admin/AdminUserDetailPage'
import { AdminUserNewPage } from '../pages/admin/AdminUserNewPage'
import {
  AdminTestsPage,
  AdminTestParametersPage,
  AdminReferenceRangesPage,
  AdminAppointmentSlotsPage,
  AdminAuditLogsPage,
} from '../pages/admin/AdminCatalogPages'

import {
  PatientDashboardPage,
  PatientAssessmentNewPage,
  PatientAssessmentDetailPage,
  PatientSuggestedTestsPage,
  PatientCatalogPage,
  PatientOrdersPage,
  PatientOrderNewPage,
  PatientOrderDetailPage,
  PatientAppointmentsPage,
  PatientPaymentsPage,
  PatientResultsPage,
  PatientResultDetailPage,
  PatientNotificationsPage,
} from '../pages/patient/PatientPages'

import {
  ReceptionDashboardPage,
  ReceptionPatientsPage,
  ReceptionPatientNewPage,
  ReceptionPatientDetailPage,
  ReceptionOrdersPage,
  ReceptionOrderNewPage,
  ReceptionOrderDetailPage,
  ReceptionAppointmentsPage,
  ReceptionPaymentsPage,
} from '../pages/reception/ReceptionPages'

import {
  LabDashboardPage,
  LabWorklistPage,
  LabSamplesPage,
  LabSampleDetailPage,
  LabSampleTestsPage,
  LabResultEditPage,
  LabNotificationsPage,
} from '../pages/lab/LabPages'

function wrapGuest(element) {
  return <GuestOnlyRoute>{element}</GuestOnlyRoute>
}

function wrapApp(element, allowedRoles) {
  return <ProtectedAppRoute allowedRoles={allowedRoles}>{element}</ProtectedAppRoute>
}

export const routes = [
  { path: '/', element: <LandingPage /> },
  { path: '/login', element: wrapGuest(<LoginPage />) },
  { path: '/register', element: wrapGuest(<RegisterPage />) },
  { path: '/forgot-password', element: wrapGuest(<ForgotPasswordPage />) },
  { path: '/reset-password', element: wrapGuest(<ResetPasswordPage />) },
  { path: '/confirm-email', element: wrapGuest(<ConfirmEmailPage />) },
  { path: '/set-password', element: wrapGuest(<SetPasswordPage />) },
  { path: '/forbidden', element: <ForbiddenPage /> },

  { path: '/app/dashboard', element: wrapApp(<DashboardRedirectPage />) },
  { path: '/app/profile', element: wrapApp(<ProfilePage />) },

  { path: '/app/admin/dashboard', element: wrapApp(<AdminDashboardPage />, [ROLES.ADMIN]) },
  { path: '/app/admin/users', element: wrapApp(<AdminUsersPage />, [ROLES.ADMIN]) },
  { path: '/app/admin/users/new', element: wrapApp(<AdminUserNewPage />, [ROLES.ADMIN]) },
  { path: '/app/admin/users/:id', element: wrapApp(<AdminUserDetailPage />, [ROLES.ADMIN]) },
  { path: '/app/admin/tests', element: wrapApp(<AdminTestsPage />, [ROLES.ADMIN]) },
  {
    path: '/app/admin/test-parameters',
    element: wrapApp(<AdminTestParametersPage />, [ROLES.ADMIN]),
  },
  {
    path: '/app/admin/reference-ranges',
    element: wrapApp(<AdminReferenceRangesPage />, [ROLES.ADMIN]),
  },
  {
    path: '/app/admin/appointment-slots',
    element: wrapApp(<AdminAppointmentSlotsPage />, [ROLES.ADMIN]),
  },
  { path: '/app/admin/audit-logs', element: wrapApp(<AdminAuditLogsPage />, [ROLES.ADMIN]) },

  {
    path: '/app/patient/dashboard',
    element: wrapApp(<PatientDashboardPage />, [ROLES.PATIENT]),
  },
  {
    path: '/app/patient/assessments/new',
    element: wrapApp(<PatientAssessmentNewPage />, [ROLES.PATIENT]),
  },
  {
    path: '/app/patient/assessments/:id',
    element: wrapApp(<PatientAssessmentDetailPage />, [ROLES.PATIENT]),
  },
  {
    path: '/app/patient/suggested-tests',
    element: wrapApp(<PatientSuggestedTestsPage />, [ROLES.PATIENT]),
  },
  { path: '/app/patient/catalog', element: wrapApp(<PatientCatalogPage />, [ROLES.PATIENT]) },
  { path: '/app/patient/orders', element: wrapApp(<PatientOrdersPage />, [ROLES.PATIENT]) },
  {
    path: '/app/patient/orders/new',
    element: wrapApp(<PatientOrderNewPage />, [ROLES.PATIENT]),
  },
  {
    path: '/app/patient/orders/:id',
    element: wrapApp(<PatientOrderDetailPage />, [ROLES.PATIENT]),
  },
  {
    path: '/app/patient/appointments',
    element: wrapApp(<PatientAppointmentsPage />, [ROLES.PATIENT]),
  },
  { path: '/app/patient/payments', element: wrapApp(<PatientPaymentsPage />, [ROLES.PATIENT]) },
  { path: '/app/patient/results', element: wrapApp(<PatientResultsPage />, [ROLES.PATIENT]) },
  {
    path: '/app/patient/results/:id',
    element: wrapApp(<PatientResultDetailPage />, [ROLES.PATIENT]),
  },
  {
    path: '/app/patient/notifications',
    element: wrapApp(<PatientNotificationsPage />, [ROLES.PATIENT]),
  },

  {
    path: '/app/reception/dashboard',
    element: wrapApp(<ReceptionDashboardPage />, [ROLES.RECEPTIONIST]),
  },
  {
    path: '/app/reception/patients',
    element: wrapApp(<ReceptionPatientsPage />, [ROLES.RECEPTIONIST]),
  },
  {
    path: '/app/reception/patients/new',
    element: wrapApp(<ReceptionPatientNewPage />, [ROLES.RECEPTIONIST]),
  },
  {
    path: '/app/reception/patients/:id',
    element: wrapApp(<ReceptionPatientDetailPage />, [ROLES.RECEPTIONIST]),
  },
  { path: '/app/reception/orders', element: wrapApp(<ReceptionOrdersPage />, [ROLES.RECEPTIONIST]) },
  {
    path: '/app/reception/orders/new',
    element: wrapApp(<ReceptionOrderNewPage />, [ROLES.RECEPTIONIST]),
  },
  {
    path: '/app/reception/orders/:id',
    element: wrapApp(<ReceptionOrderDetailPage />, [ROLES.RECEPTIONIST]),
  },
  {
    path: '/app/reception/appointments',
    element: wrapApp(<ReceptionAppointmentsPage />, [ROLES.RECEPTIONIST]),
  },
  {
    path: '/app/reception/payments',
    element: wrapApp(<ReceptionPaymentsPage />, [ROLES.RECEPTIONIST]),
  },

  { path: '/app/lab/dashboard', element: wrapApp(<LabDashboardPage />, [ROLES.LAB_TECHNICIAN]) },
  { path: '/app/lab/worklist', element: wrapApp(<LabWorklistPage />, [ROLES.LAB_TECHNICIAN]) },
  { path: '/app/lab/samples', element: wrapApp(<LabSamplesPage />, [ROLES.LAB_TECHNICIAN]) },
  {
    path: '/app/lab/samples/:id',
    element: wrapApp(<LabSampleDetailPage />, [ROLES.LAB_TECHNICIAN]),
  },
  {
    path: '/app/lab/sample-tests',
    element: wrapApp(<LabSampleTestsPage />, [ROLES.LAB_TECHNICIAN]),
  },
  {
    path: '/app/lab/results/:id/edit',
    element: wrapApp(<LabResultEditPage />, [ROLES.LAB_TECHNICIAN]),
  },
  {
    path: '/app/lab/notifications',
    element: wrapApp(<LabNotificationsPage />, [ROLES.LAB_TECHNICIAN]),
  },
]

export function resolveRouteElement(pathname, routesList) {
  const exact = routesList.find((r) => r.path === pathname)
  if (exact) return exact.element

  for (const route of routesList) {
    if (!route.path.includes(':')) continue
    const patternParts = route.path.split('/').filter(Boolean)
    const pathParts = pathname.split('/').filter(Boolean)
    if (patternParts.length !== pathParts.length) continue
    let ok = true
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) continue
      if (patternParts[i] !== pathParts[i]) {
        ok = false
        break
      }
    }
    if (ok) return route.element
  }

  return <NotFoundPage />
}
