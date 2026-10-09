import { ResourceListPage } from '../../components/pages/ResourceListPage'
import { EntityDetailPage } from '../../components/pages/EntityDetailPage'
import { MockFormPage } from '../../components/pages/MockFormPage'
import { DashboardStats } from '../../components/pages/DashboardStats'
import { PageHeader } from '../../components/layout/PageHeader'
import { MockBanner } from '../../components/feedback/MockBanner'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { FormField } from '../../components/ui/FormField'
import { TextInput } from '../../components/ui/TextInput'
import { DataTable } from '../../components/data-display/DataTable'
import { useRouter } from '../../lib/router/RouterContext'
import {
  findById,
  mockAppointments,
  mockOrderItems,
  mockOrders,
  mockPatients,
  mockPayments,
} from '../../mocks/fixtures'
import { NotFoundPage } from '../shared/NotFoundPage'

export function ReceptionDashboardPage() {
  return (
    <>
      <PageHeader title="Reception dashboard" description="Front desk workflow (mock)." />
      <MockBanner />
      <DashboardStats
        stats={[
          { label: 'Patients today', value: mockPatients.length },
          { label: 'Open orders', value: mockOrders.filter((o) => o.status === 'PENDING').length },
          { label: 'Appointments today', value: 1 },
          { label: 'Pending payments', value: 1 },
        ]}
      />
    </>
  )
}

export function ReceptionPatientsPage() {
  return (
    <ResourceListPage
      title="Patients"
      description="Search and register patients (mock)."
      createTo="/app/reception/patients/new"
      createLabel="Register patient"
      columns={[
        { key: 'mrn', header: 'MRN' },
        { key: 'fullName', header: 'Name' },
        { key: 'phone', header: 'Phone' },
        { key: 'email', header: 'Email' },
      ]}
      rows={mockPatients}
      onRowTo={(row) => `/app/reception/patients/${row.id}`}
    />
  )
}

export function ReceptionPatientNewPage() {
  return (
    <MockFormPage
      title="Register patient"
      description="Patient may exist without user account — verify data model."
      submitLabel="Save patient (mock)"
    >
      <FormField id="fullName" label="Full name" required>
        <TextInput id="fullName" required />
      </FormField>
      <FormField id="mrn" label="MRN">
        <TextInput id="mrn" />
      </FormField>
      <FormField id="phone" label="Phone">
        <TextInput id="phone" type="tel" />
      </FormField>
      <FormField id="email" label="Email">
        <TextInput id="email" type="email" />
      </FormField>
    </MockFormPage>
  )
}

export function ReceptionPatientDetailPage() {
  const { params } = useRouter()
  const patient = findById(mockPatients, params.id)
  if (!patient) return <NotFoundPage />
  return (
    <EntityDetailPage
      title={patient.fullName}
      description={patient.mrn}
      backTo="/app/reception/patients"
      fields={[
        { label: 'Date of birth', value: patient.dateOfBirth },
        { label: 'Phone', value: patient.phone },
        { label: 'Email', value: patient.email },
      ]}
    />
  )
}

export function ReceptionOrdersPage() {
  return (
    <ResourceListPage
      title="Test orders"
      description="Create and manage orders (mock)."
      createTo="/app/reception/orders/new"
      createLabel="New order"
      columns={[
        { key: 'id', header: 'Order' },
        { key: 'patientName', header: 'Patient' },
        {
          key: 'status',
          header: 'Status',
          render: (r) => <StatusBadge status={r.status} />,
        },
        { key: 'totalAmount', header: 'Total', render: (r) => `$${r.totalAmount}` },
      ]}
      rows={mockOrders}
      onRowTo={(row) => `/app/reception/orders/${row.id}`}
    />
  )
}

export function ReceptionOrderNewPage() {
  return (
    <MockFormPage
      title="Create order"
      description="Reception order entry (mock)."
      submitLabel="Create order (mock)"
    >
      <FormField id="patientId" label="Patient ID" required>
        <TextInput id="patientId" defaultValue="pat-1001" required />
      </FormField>
      <FormField id="tests" label="Tests">
        <TextInput id="tests" defaultValue="CBC" />
      </FormField>
    </MockFormPage>
  )
}

export function ReceptionOrderDetailPage() {
  const { params } = useRouter()
  const order = findById(mockOrders, params.id)
  if (!order) return <NotFoundPage />
  const items = mockOrderItems.filter((i) => i.orderId === order.id)
  return (
    <EntityDetailPage
      title={`Order ${order.id}`}
      description={order.patientName}
      backTo="/app/reception/orders"
      fields={[
        { label: 'Status', value: order.status },
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

export function ReceptionAppointmentsPage() {
  return (
    <ResourceListPage
      title="Appointments"
      description="Schedule sample collection (mock)."
      columns={[
        { key: 'patientName', header: 'Patient' },
        { key: 'date', header: 'Date' },
        { key: 'time', header: 'Time' },
        {
          key: 'status',
          header: 'Status',
          render: (r) => <StatusBadge status={r.status} />,
        },
      ]}
      rows={mockAppointments}
    />
  )
}

export function ReceptionPaymentsPage() {
  return (
    <ResourceListPage
      title="Payments"
      description="Record payments (mock — staff recording, not gateway)."
      columns={[
        { key: 'orderId', header: 'Order' },
        { key: 'amount', header: 'Amount', render: (r) => `$${r.amount}` },
        {
          key: 'status',
          header: 'Status',
          render: (r) => <StatusBadge status={r.status} />,
        },
        { key: 'method', header: 'Method' },
      ]}
      rows={mockPayments}
    />
  )
}
