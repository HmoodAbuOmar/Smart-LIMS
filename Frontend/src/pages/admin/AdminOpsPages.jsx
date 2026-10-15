import { useParams } from 'react-router-dom'
import { useMockData } from '../../mock-data/MockDataProvider'
import { useListControls } from '../../hooks/useListControls'
import { ResourceListPage } from '../../components/pages/ResourceListPage'
import { EntityDetailPage } from '../../components/pages/EntityDetailPage'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { DataTable } from '../../components/data-display/DataTable'
import { NotFoundPage } from '../shared/NotFoundPage'

export function AdminPatientsPage() {
  const { state } = useMockData()
  const list = useListControls(state.patients, {
    searchKeys: ['fullName', 'mrn', 'email'],
  })
  return (
    <ResourceListPage
      title="Patients"
      description="Patient records overview (demo)."
      columns={[
        { key: 'mrn', header: 'MRN' },
        { key: 'fullName', header: 'Name' },
        { key: 'phone', header: 'Phone' },
        { key: 'email', header: 'Email' },
      ]}
      rows={list.rows}
      onRowTo={(row) => `/app/admin/patients/${row.id}`}
      toolbar={{
        search: list.search,
        onSearchChange: (v) => {
          list.setSearch(v)
          list.resetPage()
        },
        placeholder: 'Search patients',
      }}
      pagination={{ page: list.page, totalPages: list.totalPages, onPageChange: list.setPage }}
    />
  )
}

export function AdminPatientDetailPage() {
  const { id } = useParams()
  const { findPatient } = useMockData()
  const patient = findPatient(id)
  if (!patient) return <NotFoundPage />
  return (
    <EntityDetailPage
      title={patient.fullName}
      description={patient.mrn}
      backTo="/app/admin/patients"
      fields={[
        { label: 'Date of birth', value: patient.dateOfBirth },
        { label: 'Gender', value: patient.gender },
        { label: 'Phone', value: patient.phone },
        { label: 'Email', value: patient.email },
        { label: 'Address', value: patient.address },
      ]}
    />
  )
}

export function AdminOrdersPage() {
  const { state } = useMockData()
  const list = useListControls(state.orders, {
    searchKeys: ['id', 'patientName'],
    pageSize: 8,
  })
  return (
    <ResourceListPage
      title="Orders overview"
      description="All laboratory orders (demo)."
      columns={[
        { key: 'id', header: 'Order' },
        { key: 'patientName', header: 'Patient' },
        { key: 'createdAt', header: 'Created' },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        { key: 'totalAmount', header: 'Total', render: (r) => `$${r.totalAmount}` },
      ]}
      rows={list.rows}
      onRowTo={(row) => `/app/admin/orders/${row.id}`}
      toolbar={{
        search: list.search,
        onSearchChange: (v) => {
          list.setSearch(v)
          list.resetPage()
        },
        status: list.status,
        onStatusChange: (v) => {
          list.setStatus(v)
          list.resetPage()
        },
        statusOptions: ['PENDING', 'COMPLETED'],
      }}
      pagination={{ page: list.page, totalPages: list.totalPages, onPageChange: list.setPage }}
    />
  )
}

export function AdminOrderDetailPage() {
  const { id } = useParams()
  const { findOrder, state } = useMockData()
  const order = findOrder(id)
  if (!order) return <NotFoundPage />
  const items = state.orderItems.filter((i) => i.orderId === order.id)
  return (
    <EntityDetailPage
      title={`Order ${order.id}`}
      description={order.patientName}
      backTo="/app/admin/orders"
      fields={[
        { label: 'Status', value: order.status },
        { label: 'Created', value: order.createdAt },
        { label: 'Total', value: `$${order.totalAmount}` },
      ]}
    >
      <DataTable
        columns={[
          { key: 'testCode', header: 'Code' },
          { key: 'testName', header: 'Test' },
          { key: 'price', header: 'Price', render: (r) => `$${r.price}` },
        ]}
        rows={items}
      />
    </EntityDetailPage>
  )
}

export function AdminPaymentsPage() {
  const { state } = useMockData()
  const list = useListControls(state.payments, {
    searchKeys: ['id', 'orderId'],
  })
  return (
    <ResourceListPage
      title="Payments overview"
      description="Recorded payments (demo)."
      columns={[
        { key: 'orderId', header: 'Order' },
        { key: 'amount', header: 'Amount', render: (r) => `$${r.amount}` },
        { key: 'method', header: 'Method' },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        { key: 'recordedAt', header: 'Date' },
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
