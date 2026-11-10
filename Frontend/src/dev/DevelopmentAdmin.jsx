import AdminDashboard from '../admin/AdminDashboard.jsx'

// Same compile-time boundary as the existing patient development previews.
// This module only renders fictional Admin records; it creates no auth session.
export default function DevelopmentAdmin({ page = 'overview' }) {
  if (!import.meta.env.DEV) return null
  const initialPage = ['overview', 'users', 'patients', 'tests', 'parameters', 'referenceRanges', 'bookingSlots', 'operationsPayments', 'auditLog', 'reports'].includes(page) ? page : 'overview'
  return <AdminDashboard initialPage={initialPage} developmentPreview />
}
