import AdminDashboard from './AdminDashboard.jsx'
import { demoDate } from './adminDemoData.js'
import { laboratoryPreviewAlerts } from './adminAlertPreviewData.js'
import * as overviewModel from './adminOverviewModel.js'
import { adminUsersData } from './adminUsersData.js'
import { bookingSlotsService } from './bookingSlots/bookingSlotsService.js'
import { auditLogService } from './auditLog/auditLogService.js'
import { operationsPaymentsService } from './operationsPayments/operationsPaymentsService.js'
import { adminPatientsService } from './patients/adminPatientsService.js'
import { reportsService } from './reports/reportsService.js'
import { adminCatalogService } from './catalog/adminCatalogService.js'

const preview = {
  overview: { ...overviewModel, demoDate, laboratoryPreviewAlerts }, users: adminUsersData,
  slots: bookingSlotsService, audit: auditLogService, operations: operationsPaymentsService,
  patients: adminPatientsService, reports: reportsService, catalog: adminCatalogService,
}

// Same compile-time boundary as the existing patient development previews.
// This module only renders fictional Admin records; it creates no auth session.
export default function AdminPreview({ page = 'overview' }) {
  if (!import.meta.env.DEV) return null
  const initialPage = ['overview', 'users', 'patients', 'tests', 'parameters', 'referenceRanges', 'bookingSlots', 'operationsPayments', 'auditLog', 'reports'].includes(page) ? page : 'overview'
  return <AdminDashboard initialPage={initialPage} developmentPreview preview={preview} />
}
