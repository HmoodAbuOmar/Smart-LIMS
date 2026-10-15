import { createBrowserRouter } from 'react-router-dom'
import { Root } from './Root'
import { PublicLayout } from '../layouts/PublicLayout'
import { GuestOnlyRoute, ProtectedAppRoute } from '../components/auth/RouteGuard'
import { ROLES } from '../lib/constants/roles'

import {
  HomePage,
  AboutPage,
  PublicCatalogPage,
  PublicTestDetailPage,
  PreparationPage,
} from '../pages/public/PublicSitePages'
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
  AdminPatientsPage,
  AdminPatientDetailPage,
  AdminOrdersPage,
  AdminOrderDetailPage,
  AdminPaymentsPage,
} from '../pages/admin/AdminOpsPages'

import {
  PatientDashboardPage,
  PatientProfilePage,
  PatientAppointmentsPage,
  PatientBookAppointmentPage,
  PatientOrdersPage,
  PatientOrderDetailPage,
  PatientPaymentsPage,
  PatientResultsPage,
  PatientResultDetailPage,
  PatientNotificationsPage,
} from '../pages/patient/PatientPages'

import {
  ReceptionDashboardPage,
  ReceptionPatientsPage,
  ReceptionPatientNewPage,
  ReceptionPatientEditPage,
  ReceptionPatientDetailPage,
  ReceptionOrdersPage,
  ReceptionOrderNewPage,
  ReceptionOrderDetailPage,
  ReceptionOrderItemsPage,
  ReceptionAppointmentsPage,
  ReceptionCheckInPage,
  ReceptionPaymentsPage,
  ReceptionRefundsPage,
} from '../pages/reception/ReceptionPages'

import {
  LabDashboardPage,
  LabWorklistPage,
  LabOrderDetailPage,
  LabSampleRegisterPage,
  LabSamplesPage,
  LabSampleDetailPage,
  LabSampleTestsPage,
  LabResultEntryPage,
  LabDraftResultsPage,
  LabPublishResultsPage,
  LabResultCorrectionsPage,
  LabResultEditPage,
  LabResultHistoryPage,
} from '../pages/lab/LabPages'

const guest = (el) => <GuestOnlyRoute>{el}</GuestOnlyRoute>
const app = (el, roles) => <ProtectedAppRoute allowedRoles={roles}>{el}</ProtectedAppRoute>

export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'about', element: <AboutPage /> },
          { path: 'tests', element: <PublicCatalogPage /> },
          { path: 'tests/:testId', element: <PublicTestDetailPage /> },
          { path: 'tests/:testId/preparation', element: <PreparationPage /> },
        ],
      },
      { path: 'login', element: guest(<LoginPage />) },
      { path: 'register', element: guest(<RegisterPage />) },
      { path: 'forgot-password', element: guest(<ForgotPasswordPage />) },
      { path: 'reset-password', element: guest(<ResetPasswordPage />) },
      { path: 'confirm-email', element: guest(<ConfirmEmailPage />) },
      { path: 'set-password', element: guest(<SetPasswordPage />) },
      { path: 'forbidden', element: <ForbiddenPage /> },

      { path: 'app/dashboard', element: app(<DashboardRedirectPage />) },
      { path: 'app/profile', element: app(<ProfilePage />) },

      { path: 'app/admin/dashboard', element: app(<AdminDashboardPage />, [ROLES.ADMIN]) },
      { path: 'app/admin/users', element: app(<AdminUsersPage />, [ROLES.ADMIN]) },
      { path: 'app/admin/users/new', element: app(<AdminUserNewPage />, [ROLES.ADMIN]) },
      { path: 'app/admin/users/:id', element: app(<AdminUserDetailPage />, [ROLES.ADMIN]) },
      { path: 'app/admin/patients', element: app(<AdminPatientsPage />, [ROLES.ADMIN]) },
      { path: 'app/admin/patients/:id', element: app(<AdminPatientDetailPage />, [ROLES.ADMIN]) },
      { path: 'app/admin/tests', element: app(<AdminTestsPage />, [ROLES.ADMIN]) },
      { path: 'app/admin/test-parameters', element: app(<AdminTestParametersPage />, [ROLES.ADMIN]) },
      { path: 'app/admin/reference-ranges', element: app(<AdminReferenceRangesPage />, [ROLES.ADMIN]) },
      { path: 'app/admin/appointment-slots', element: app(<AdminAppointmentSlotsPage />, [ROLES.ADMIN]) },
      { path: 'app/admin/orders', element: app(<AdminOrdersPage />, [ROLES.ADMIN]) },
      { path: 'app/admin/orders/:id', element: app(<AdminOrderDetailPage />, [ROLES.ADMIN]) },
      { path: 'app/admin/payments', element: app(<AdminPaymentsPage />, [ROLES.ADMIN]) },
      { path: 'app/admin/audit-logs', element: app(<AdminAuditLogsPage />, [ROLES.ADMIN]) },

      { path: 'app/patient/dashboard', element: app(<PatientDashboardPage />, [ROLES.PATIENT]) },
      { path: 'app/patient/profile', element: app(<PatientProfilePage />, [ROLES.PATIENT]) },
      { path: 'app/patient/appointments', element: app(<PatientAppointmentsPage />, [ROLES.PATIENT]) },
      { path: 'app/patient/appointments/book', element: app(<PatientBookAppointmentPage />, [ROLES.PATIENT]) },
      { path: 'app/patient/orders', element: app(<PatientOrdersPage />, [ROLES.PATIENT]) },
      { path: 'app/patient/orders/:id', element: app(<PatientOrderDetailPage />, [ROLES.PATIENT]) },
      { path: 'app/patient/payments', element: app(<PatientPaymentsPage />, [ROLES.PATIENT]) },
      { path: 'app/patient/results', element: app(<PatientResultsPage />, [ROLES.PATIENT]) },
      { path: 'app/patient/results/:id', element: app(<PatientResultDetailPage />, [ROLES.PATIENT]) },
      { path: 'app/patient/notifications', element: app(<PatientNotificationsPage />, [ROLES.PATIENT]) },

      { path: 'app/reception/dashboard', element: app(<ReceptionDashboardPage />, [ROLES.RECEPTIONIST]) },
      { path: 'app/reception/patients', element: app(<ReceptionPatientsPage />, [ROLES.RECEPTIONIST]) },
      { path: 'app/reception/patients/new', element: app(<ReceptionPatientNewPage />, [ROLES.RECEPTIONIST]) },
      { path: 'app/reception/patients/:id', element: app(<ReceptionPatientDetailPage />, [ROLES.RECEPTIONIST]) },
      { path: 'app/reception/patients/:id/edit', element: app(<ReceptionPatientEditPage />, [ROLES.RECEPTIONIST]) },
      { path: 'app/reception/orders', element: app(<ReceptionOrdersPage />, [ROLES.RECEPTIONIST]) },
      { path: 'app/reception/orders/new', element: app(<ReceptionOrderNewPage />, [ROLES.RECEPTIONIST]) },
      { path: 'app/reception/orders/:id', element: app(<ReceptionOrderDetailPage />, [ROLES.RECEPTIONIST]) },
      { path: 'app/reception/orders/:id/items', element: app(<ReceptionOrderItemsPage />, [ROLES.RECEPTIONIST]) },
      { path: 'app/reception/appointments', element: app(<ReceptionAppointmentsPage />, [ROLES.RECEPTIONIST]) },
      { path: 'app/reception/check-in', element: app(<ReceptionCheckInPage />, [ROLES.RECEPTIONIST]) },
      { path: 'app/reception/payments', element: app(<ReceptionPaymentsPage />, [ROLES.RECEPTIONIST]) },
      { path: 'app/reception/refunds', element: app(<ReceptionRefundsPage />, [ROLES.RECEPTIONIST]) },

      { path: 'app/lab/dashboard', element: app(<LabDashboardPage />, [ROLES.LAB_TECHNICIAN]) },
      { path: 'app/lab/worklist', element: app(<LabWorklistPage />, [ROLES.LAB_TECHNICIAN]) },
      { path: 'app/lab/orders/:id', element: app(<LabOrderDetailPage />, [ROLES.LAB_TECHNICIAN]) },
      { path: 'app/lab/samples/register', element: app(<LabSampleRegisterPage />, [ROLES.LAB_TECHNICIAN]) },
      { path: 'app/lab/samples', element: app(<LabSamplesPage />, [ROLES.LAB_TECHNICIAN]) },
      { path: 'app/lab/samples/:id', element: app(<LabSampleDetailPage />, [ROLES.LAB_TECHNICIAN]) },
      { path: 'app/lab/sample-tests', element: app(<LabSampleTestsPage />, [ROLES.LAB_TECHNICIAN]) },
      { path: 'app/lab/results/entry', element: app(<LabResultEntryPage />, [ROLES.LAB_TECHNICIAN]) },
      { path: 'app/lab/results/drafts', element: app(<LabDraftResultsPage />, [ROLES.LAB_TECHNICIAN]) },
      { path: 'app/lab/results/publish', element: app(<LabPublishResultsPage />, [ROLES.LAB_TECHNICIAN]) },
      { path: 'app/lab/results/corrections', element: app(<LabResultCorrectionsPage />, [ROLES.LAB_TECHNICIAN]) },
      { path: 'app/lab/results/:id/edit', element: app(<LabResultEditPage />, [ROLES.LAB_TECHNICIAN]) },
      { path: 'app/lab/results/:id/history', element: app(<LabResultHistoryPage />, [ROLES.LAB_TECHNICIAN]) },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
