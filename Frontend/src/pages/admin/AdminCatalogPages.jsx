import { ResourceListPage } from '../../components/pages/ResourceListPage'
import { StatusBadge } from '../../components/ui/StatusBadge'
import {
  mockAppointmentSlots,
  mockAuditLogs,
  mockLabTests,
  mockReferenceRanges,
  mockTestParameters,
} from '../../mocks/fixtures'

export function AdminTestsPage() {
  return (
    <ResourceListPage
      title="Laboratory tests"
      description="Catalog management (mock)."
      columns={[
        { key: 'code', header: 'Code' },
        { key: 'name', header: 'Name' },
        { key: 'price', header: 'Price', render: (r) => `$${r.price}` },
        {
          key: 'status',
          header: 'Status',
          render: (r) => <StatusBadge status={r.status} />,
        },
      ]}
      rows={mockLabTests}
    />
  )
}

export function AdminTestParametersPage() {
  return (
    <ResourceListPage
      title="Test parameters"
      description="Parameters linked to laboratory tests (mock)."
      columns={[
        { key: 'code', header: 'Code' },
        { key: 'name', header: 'Name' },
        { key: 'unit', header: 'Unit' },
        { key: 'testId', header: 'Test ID' },
      ]}
      rows={mockTestParameters}
    />
  )
}

export function AdminReferenceRangesPage() {
  return (
    <ResourceListPage
      title="Reference ranges"
      description="Interpretation ranges (mock)."
      columns={[
        { key: 'label', header: 'Label' },
        { key: 'parameterId', header: 'Parameter' },
        { key: 'min', header: 'Min' },
        { key: 'max', header: 'Max' },
        { key: 'unit', header: 'Unit' },
      ]}
      rows={mockReferenceRanges}
    />
  )
}

export function AdminAppointmentSlotsPage() {
  return (
    <ResourceListPage
      title="Appointment slots"
      description="Capacity and booking counts (mock)."
      columns={[
        { key: 'date', header: 'Date' },
        { key: 'startTime', header: 'Start' },
        { key: 'endTime', header: 'End' },
        { key: 'booked', header: 'Booked', render: (r) => `${r.booked}/${r.capacity}` },
      ]}
      rows={mockAppointmentSlots}
    />
  )
}

export function AdminAuditLogsPage() {
  return (
    <ResourceListPage
      title="Audit logs"
      description="Read-only audit trail (mock)."
      columns={[
        { key: 'timestamp', header: 'Time' },
        { key: 'action', header: 'Action' },
        { key: 'actor', header: 'Actor' },
        { key: 'resource', header: 'Resource' },
      ]}
      rows={mockAuditLogs}
    />
  )
}
