import { useMockData } from '../../mock-data/MockDataProvider'
import { useListControls } from '../../hooks/useListControls'
import { ResourceListPage } from '../../components/pages/ResourceListPage'
import { StatusBadge } from '../../components/ui/StatusBadge'

export function AdminTestsPage() {
  const { state } = useMockData()
  const list = useListControls(state.labTests, { searchKeys: ['name', 'code'] })
  return (
    <ResourceListPage
      title="Laboratory tests"
      description="Catalog management (demo)."
      columns={[
        { key: 'code', header: 'Code' },
        { key: 'name', header: 'Name' },
        { key: 'category', header: 'Category' },
        { key: 'price', header: 'Price', render: (r) => `$${r.price}` },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      ]}
      rows={list.rows}
      toolbar={{
        search: list.search,
        onSearchChange: (v) => {
          list.setSearch(v)
          list.resetPage()
        },
      }}
      pagination={{ page: list.page, totalPages: list.totalPages, onPageChange: list.setPage }}
    />
  )
}

export function AdminTestParametersPage() {
  const { state } = useMockData()
  const list = useListControls(state.testParameters, { searchKeys: ['code', 'name'] })
  return (
    <ResourceListPage
      title="Test parameters"
      description="Parameters linked to tests (demo)."
      columns={[
        { key: 'code', header: 'Code' },
        { key: 'name', header: 'Name' },
        { key: 'unit', header: 'Unit' },
        { key: 'testId', header: 'Test ID' },
      ]}
      rows={list.rows}
      toolbar={{ search: list.search, onSearchChange: list.setSearch }}
      pagination={{ page: list.page, totalPages: list.totalPages, onPageChange: list.setPage }}
    />
  )
}

export function AdminReferenceRangesPage() {
  const { state } = useMockData()
  const list = useListControls(state.referenceRanges, { searchKeys: ['label', 'parameterId'] })
  return (
    <ResourceListPage
      title="Reference ranges"
      description="Interpretation ranges (demo)."
      columns={[
        { key: 'label', header: 'Label' },
        { key: 'parameterId', header: 'Parameter' },
        { key: 'min', header: 'Min' },
        { key: 'max', header: 'Max' },
        { key: 'unit', header: 'Unit' },
      ]}
      rows={list.rows}
      toolbar={{ search: list.search, onSearchChange: list.setSearch }}
      pagination={{ page: list.page, totalPages: list.totalPages, onPageChange: list.setPage }}
    />
  )
}

export function AdminAppointmentSlotsPage() {
  const { state } = useMockData()
  const list = useListControls(state.appointmentSlots, { searchKeys: ['date'] })
  return (
    <ResourceListPage
      title="Appointment slots"
      description="Capacity management (demo)."
      columns={[
        { key: 'date', header: 'Date' },
        { key: 'startTime', header: 'Start' },
        { key: 'endTime', header: 'End' },
        { key: 'booked', header: 'Booked', render: (r) => `${r.booked}/${r.capacity}` },
      ]}
      rows={list.rows}
      toolbar={{ search: list.search, onSearchChange: list.setSearch }}
      pagination={{ page: list.page, totalPages: list.totalPages, onPageChange: list.setPage }}
    />
  )
}

export function AdminAuditLogsPage() {
  const { state } = useMockData()
  const list = useListControls(state.auditLogs, { searchKeys: ['action', 'actor', 'resource'] })
  return (
    <ResourceListPage
      title="Audit logs"
      description="Read-only audit trail (demo)."
      columns={[
        { key: 'timestamp', header: 'Time' },
        { key: 'action', header: 'Action' },
        { key: 'actor', header: 'Actor' },
        { key: 'resource', header: 'Resource' },
      ]}
      rows={list.rows}
      toolbar={{ search: list.search, onSearchChange: list.setSearch }}
      pagination={{ page: list.page, totalPages: list.totalPages, onPageChange: list.setPage }}
    />
  )
}
