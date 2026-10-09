import { ResourceListPage } from '../../components/pages/ResourceListPage'
import { EntityDetailPage } from '../../components/pages/EntityDetailPage'
import { DashboardStats } from '../../components/pages/DashboardStats'
import { PageHeader } from '../../components/layout/PageHeader'
import { MockBanner } from '../../components/feedback/MockBanner'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { FormField } from '../../components/ui/FormField'
import { TextInput } from '../../components/ui/TextInput'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { DataTable } from '../../components/data-display/DataTable'
import { Link } from '../../lib/router/RouterContext'
import { useMockSubmit } from '../../hooks/useMockSubmit'
import { useRouter } from '../../lib/router/RouterContext'
import {
  findById,
  mockNotifications,
  mockResultValues,
  mockSampleTests,
  mockSamples,
  mockTestResults,
} from '../../mocks/fixtures'
import { NotFoundPage } from '../shared/NotFoundPage'

export function LabDashboardPage() {
  return (
    <>
      <PageHeader title="Laboratory dashboard" description="Processing workload (mock)." />
      <MockBanner />
      <DashboardStats
        stats={[
          { label: 'Samples in progress', value: mockSamples.length },
          { label: 'Pending sample tests', value: mockSampleTests.length },
          {
            label: 'Draft results',
            value: mockTestResults.filter((r) => r.status === 'DRAFT').length,
          },
          { label: 'Worklist items', value: 2 },
        ]}
      />
      <p style={{ marginTop: 'var(--sl-space-4)', fontSize: 'var(--sl-text-sm)' }}>
        Draft preview:{' '}
        <Link to="/app/lab/results/res-7002/edit">Edit result res-7002</Link>
      </p>
    </>
  )
}

export function LabWorklistPage() {
  const rows = mockSampleTests.map((st) => ({
    ...st,
    sampleBarcode: mockSamples.find((s) => s.id === st.sampleId)?.barcode,
  }))
  return (
    <ResourceListPage
      title="Worklist"
      description="Tests awaiting processing (mock)."
      columns={[
        { key: 'sampleBarcode', header: 'Sample' },
        { key: 'testCode', header: 'Test' },
        {
          key: 'status',
          header: 'Status',
          render: (r) => <StatusBadge status={r.status} />,
        },
      ]}
      rows={rows}
    />
  )
}

export function LabSamplesPage() {
  return (
    <ResourceListPage
      title="Samples"
      description="Sample tracking (mock)."
      columns={[
        { key: 'barcode', header: 'Barcode' },
        { key: 'orderId', header: 'Order' },
        {
          key: 'status',
          header: 'Status',
          render: (r) => <StatusBadge status={r.status} />,
        },
        { key: 'collectedAt', header: 'Collected' },
      ]}
      rows={mockSamples}
      onRowTo={(row) => `/app/lab/samples/${row.id}`}
    />
  )
}

export function LabSampleDetailPage() {
  const { params } = useRouter()
  const sample = findById(mockSamples, params.id)
  if (!sample) return <NotFoundPage />
  const tests = mockSampleTests.filter((t) => t.sampleId === sample.id)
  return (
    <EntityDetailPage
      title={sample.barcode}
      description={`Sample ${sample.id}`}
      backTo="/app/lab/samples"
      fields={[
        { label: 'Order', value: sample.orderId },
        { label: 'Status', value: sample.status },
        { label: 'Collected', value: sample.collectedAt },
      ]}
    >
      <h3>Sample tests</h3>
      <DataTable
        columns={[
          { key: 'testCode', header: 'Test' },
          { key: 'status', header: 'Status' },
        ]}
        rows={tests}
      />
    </EntityDetailPage>
  )
}

export function LabSampleTestsPage() {
  return (
    <ResourceListPage
      title="Sample tests"
      description="Manage tests per sample (mock)."
      columns={[
        { key: 'sampleId', header: 'Sample' },
        { key: 'testCode', header: 'Test' },
        {
          key: 'status',
          header: 'Status',
          render: (r) => <StatusBadge status={r.status} />,
        },
      ]}
      rows={mockSampleTests}
    />
  )
}

export function LabResultEditPage() {
  const { params } = useRouter()
  const result = findById(mockTestResults, params.id)
  const { notice, submit } = useMockSubmit()
  if (!result) return <NotFoundPage />
  const values = mockResultValues.filter((v) => v.resultId === result.id)

  return (
    <>
      <PageHeader
        title={`Edit result ${result.id}`}
        description="Draft entry — published results should be read-only per workflow (mock)."
      />
      <MockBanner message="Draft result editing is mocked. Verify publication rules with API docs." />
      {notice ? <div className="sl-alert sl-alert--warning">{notice}</div> : null}
      <Card>
        <form onSubmit={submit}>
          {values.length ? (
            values.map((v) => (
              <FormField key={v.id} id={v.id} label={`${v.parameterCode} (${v.unit})`}>
                <TextInput id={v.id} defaultValue={v.value} />
              </FormField>
            ))
          ) : (
            <FormField id="wbc" label="WBC (10^9/L)">
              <TextInput id="wbc" defaultValue="7.0" />
            </FormField>
          )}
          <Button type="submit" variant="primary">
            Save draft (mock)
          </Button>
        </form>
      </Card>
    </>
  )
}

export function LabNotificationsPage() {
  return (
    <ResourceListPage
      title="Notifications"
      description="Lab notifications (mock)."
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
