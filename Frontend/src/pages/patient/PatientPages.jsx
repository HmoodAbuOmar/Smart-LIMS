import { ResourceListPage } from '../../components/pages/ResourceListPage'
import { EntityDetailPage } from '../../components/pages/EntityDetailPage'
import { MockFormPage } from '../../components/pages/MockFormPage'
import { DashboardStats } from '../../components/pages/DashboardStats'
import { PageHeader } from '../../components/layout/PageHeader'
import { MockBanner } from '../../components/feedback/MockBanner'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { FormField } from '../../components/ui/FormField'
import { TextInput } from '../../components/ui/TextInput'
import { Card } from '../../components/ui/Card'
import { DataTable } from '../../components/data-display/DataTable'
import { useRouter } from '../../lib/router/RouterContext'
import {
  findById,
  mockAppointments,
  mockAssessments,
  mockLabTests,
  mockNotifications,
  mockOrders,
  mockOrderItems,
  mockPayments,
  mockResultValues,
  mockSuggestedTests,
  mockTestResults,
} from '../../mocks/fixtures'
import { NotFoundPage } from '../shared/NotFoundPage'

export function PatientDashboardPage() {
  return (
    <>
      <PageHeader
        title="Patient dashboard"
        description="Your orders, appointments, and results (mock)."
      />
      <MockBanner />
      <DashboardStats
        stats={[
          { label: 'Open orders', value: 1 },
          { label: 'Upcoming appointments', value: 1 },
          { label: 'Unread notifications', value: 1 },
          { label: 'Published results', value: 1 },
        ]}
      />
    </>
  )
}

export function PatientAssessmentNewPage() {
  return (
    <MockFormPage
      title="Symptom assessment"
      description="Submit symptoms for suggested tests (mock — backend generates recommendations)."
      submitLabel="Submit assessment"
    >
      <FormField id="symptoms" label="Describe your symptoms" required>
        <TextInput id="symptoms" name="symptoms" required />
      </FormField>
      <FormField id="duration" label="Duration (days)">
        <TextInput id="duration" name="duration" type="number" min="1" />
      </FormField>
    </MockFormPage>
  )
}

export function PatientAssessmentDetailPage() {
  const { params } = useRouter()
  const item = findById(mockAssessments, params.id)
  if (!item) return <NotFoundPage />
  return (
    <EntityDetailPage
      title="Assessment"
      description={item.id}
      backTo="/app/patient/dashboard"
      fields={[
        { label: 'Summary', value: item.summary },
        { label: 'Created', value: item.createdAt },
        { label: 'Status', value: item.status },
      ]}
    />
  )
}

export function PatientSuggestedTestsPage() {
  return (
    <>
      <PageHeader
        title="Suggested tests"
        description="Review recommendations before creating an order (mock)."
      />
      <MockBanner />
      <Card title="From latest assessment">
        <DataTable
          columns={[
            { key: 'testCode', header: 'Code' },
            { key: 'testName', header: 'Test' },
            {
              key: 'selected',
              header: 'Selected',
              render: (r) => (r.selected ? 'Yes' : 'No'),
            },
          ]}
          rows={mockSuggestedTests}
        />
      </Card>
    </>
  )
}

export function PatientCatalogPage() {
  return (
    <ResourceListPage
      title="Test catalog"
      description="Browse available laboratory tests (mock)."
      columns={[
        { key: 'code', header: 'Code' },
        { key: 'name', header: 'Name' },
        { key: 'price', header: 'Price', render: (r) => `$${r.price}` },
      ]}
      rows={mockLabTests}
    />
  )
}

export function PatientOrdersPage() {
  return (
    <ResourceListPage
      title="Test orders"
      description="Your order history (mock)."
      createTo="/app/patient/orders/new"
      createLabel="New order"
      columns={[
        { key: 'id', header: 'Order' },
        { key: 'createdAt', header: 'Date' },
        {
          key: 'status',
          header: 'Status',
          render: (r) => <StatusBadge status={r.status} />,
        },
        { key: 'totalAmount', header: 'Total', render: (r) => `$${r.totalAmount}` },
      ]}
      rows={mockOrders.filter((o) => o.patientId === 'pat-1001')}
      onRowTo={(row) => `/app/patient/orders/${row.id}`}
    />
  )
}

export function PatientOrderNewPage() {
  return (
    <MockFormPage
      title="Create test order"
      description="Select tests — totals must come from backend when integrated."
      submitLabel="Create order (mock)"
    >
      <FormField id="tests" label="Test codes (comma-separated)" hint="e.g. CBC, LIPID">
        <TextInput id="tests" name="tests" defaultValue="CBC, LIPID" />
      </FormField>
    </MockFormPage>
  )
}

export function PatientOrderDetailPage() {
  const { params } = useRouter()
  const order = findById(mockOrders, params.id)
  if (!order) return <NotFoundPage />
  const items = mockOrderItems.filter((i) => i.orderId === order.id)
  return (
    <EntityDetailPage
      title={`Order ${order.id}`}
      description="Order details and items (mock)."
      backTo="/app/patient/orders"
      fields={[
        { label: 'Status', value: order.status },
        { label: 'Created', value: order.createdAt },
        { label: 'Total', value: `$${order.totalAmount}` },
      ]}
    >
      <h3>Items</h3>
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

export function PatientAppointmentsPage() {
  return (
    <ResourceListPage
      title="Appointments"
      description="Booking history (mock)."
      columns={[
        { key: 'date', header: 'Date' },
        { key: 'time', header: 'Time' },
        {
          key: 'status',
          header: 'Status',
          render: (r) => <StatusBadge status={r.status} />,
        },
      ]}
      rows={mockAppointments.filter((a) => a.patientId === 'pat-1001')}
    />
  )
}

export function PatientPaymentsPage() {
  return (
    <ResourceListPage
      title="Payments"
      description="Payment status and history (mock — no gateway)."
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

export function PatientResultsPage() {
  return (
    <ResourceListPage
      title="Test results"
      description="Published results available to you (mock)."
      columns={[
        { key: 'id', header: 'Result' },
        { key: 'orderId', header: 'Order' },
        {
          key: 'status',
          header: 'Status',
          render: (r) => <StatusBadge status={r.status} />,
        },
        { key: 'publishedAt', header: 'Published' },
      ]}
      rows={mockTestResults.filter((r) => r.status === 'PUBLISHED' || r.patientName === 'Sam Patient')}
      onRowTo={(row) => `/app/patient/results/${row.id}`}
    />
  )
}

export function PatientResultDetailPage() {
  const { params } = useRouter()
  const result = findById(mockTestResults, params.id)
  if (!result) return <NotFoundPage />
  const values = mockResultValues.filter((v) => v.resultId === result.id)
  return (
    <EntityDetailPage
      title={`Result ${result.id}`}
      description="Published result values (mock)."
      backTo="/app/patient/results"
      fields={[
        { label: 'Order', value: result.orderId },
        { label: 'Status', value: result.status },
        { label: 'Published', value: result.publishedAt ?? '—' },
      ]}
    >
      <DataTable
        columns={[
          { key: 'parameterCode', header: 'Parameter' },
          { key: 'value', header: 'Value' },
          { key: 'unit', header: 'Unit' },
          { key: 'flag', header: 'Flag' },
        ]}
        rows={values}
      />
    </EntityDetailPage>
  )
}

export function PatientNotificationsPage() {
  return (
    <ResourceListPage
      title="Notifications"
      description="Inbox (mock)."
      columns={[
        { key: 'title', header: 'Title' },
        { key: 'body', header: 'Message' },
        {
          key: 'read',
          header: 'Read',
          render: (r) => (r.read ? 'Yes' : 'No'),
        },
      ]}
      rows={mockNotifications}
    />
  )
}
