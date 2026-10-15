import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth/AuthContext'
import { useMockData } from '../../mock-data/MockDataProvider'
import { useListControls } from '../../hooks/useListControls'
import { buildWorklist, sortWorklistRows } from '../../features/lab/worklist'
import { draftIsComplete } from '../../features/lab/validation'
import {
  enrichSamples,
  enrichSampleTests,
  labDashboardMetrics,
  recentLabActivity,
  resultContext,
} from '../../features/lab/labHelpers'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/layout/PageHeader'
import { DashboardStats } from '../../components/pages/DashboardStats'
import { ResourceListPage } from '../../components/pages/ResourceListPage'
import { EntityDetailPage } from '../../components/pages/EntityDetailPage'
import { DemoSessionNotice } from '../../components/feedback/DemoSessionNotice'
import { EmptyState } from '../../components/feedback/EmptyState'
import { ConfirmDialog } from '../../components/layout/ConfirmDialog'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { FormField } from '../../components/ui/FormField'
import { TextInput } from '../../components/ui/TextInput'
import { Select } from '../../components/ui/Select'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { DataTable } from '../../components/data-display/DataTable'
import { NotFoundPage } from '../shared/NotFoundPage'

const SAMPLE_TYPES = ['Whole blood', 'Serum', 'Plasma', 'Urine', 'Other']

function resultLabel(state, result) {
  const st = result.sampleTestId
    ? state.sampleTests.find((x) => x.id === result.sampleTestId)
    : null
  return st ? `${st.testCode} — ${result.patientName}` : `${result.id} — ${result.patientName}`
}

export function LabDashboardPage() {
  const { state, resetDemo } = useMockData()
  const navigate = useNavigate()
  const m = labDashboardMetrics(state)
  const activity = recentLabActivity(state)
  const attentionWorklist = useMemo(
    () => buildWorklist(state).filter((r) => r.needsAttention).slice(0, 6),
    [state],
  )

  return (
    <>
      <PageHeader
        title="Laboratory dashboard"
        description="Processing overview — demo data stored in this browser session only."
      />
      <DemoSessionNotice message="Laboratory values shown here are fictional demo data, not real medical results." />
      <div className="sl-row" style={{ marginBottom: 16 }}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            resetDemo()
            window.location.reload()
          }}
        >
          Reset demo data
        </Button>
        <span style={{ fontSize: 'var(--sl-text-sm)', color: 'var(--sl-text-muted)' }}>
          Use if pages look outdated or worklist data is missing.
        </span>
      </div>
      <DashboardStats
        stats={[
          { label: 'Total samples', value: m.totalSamples },
          { label: 'Pending samples', value: m.pendingSamples },
          { label: 'Accepted samples', value: m.acceptedSamples },
          { label: 'Rejected samples', value: m.rejectedSamples },
          { label: 'Tests in progress', value: m.testsInProgress },
          { label: 'Draft results', value: m.draftResults },
          { label: 'Awaiting publication', value: m.awaitingPublication },
        ]}
      />
      <div className="sl-row" style={{ margin: 'var(--sl-space-6) 0' }}>
        <Link to="/app/lab/worklist">
          <Button variant="primary">Worklist</Button>
        </Link>
        <Link to="/app/lab/samples">
          <Button variant="secondary">Samples</Button>
        </Link>
        <Link to="/app/lab/results/entry">
          <Button variant="secondary">Result entry</Button>
        </Link>
        <Link to="/app/lab/results/drafts">
          <Button variant="secondary">Draft results</Button>
        </Link>
        <Link to="/app/lab/results/publish">
          <Button variant="secondary">Publish results</Button>
        </Link>
      </div>
      <div className="sl-grid-2">
        <Card title="Samples needing attention">
          {state.samples.filter((s) => ['REGISTERED', 'RECEIVED'].includes(s.status)).length ? (
            <DataTable
              columns={[
                { key: 'barcode', header: 'Barcode' },
                { key: 'orderId', header: 'Order' },
                { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              ]}
              rows={state.samples.filter((s) => ['REGISTERED', 'RECEIVED'].includes(s.status)).slice(0, 6)}
              onRowClick={(row) => navigate(`/app/lab/samples/${row.id}`)}
            />
          ) : (
            <EmptyState title="No pending samples" description="Register samples from the Samples page." />
          )}
        </Card>
        <Card title="Draft results">
          {state.testResults.filter((r) => r.status === 'DRAFT').length ? (
            <DataTable
              columns={[
                { key: 'id', header: 'Result' },
                { key: 'patientName', header: 'Patient' },
                {
                  key: 'ready',
                  header: 'Complete',
                  render: (r) => {
                    const vals = state.resultValues.filter((v) => v.resultId === r.id)
                    return draftIsComplete(vals) ? 'Yes' : 'No'
                  },
                },
              ]}
              rows={state.testResults.filter((r) => r.status === 'DRAFT').slice(0, 6)}
              onRowClick={(row) => navigate(`/app/lab/results/${row.id}/edit`)}
            />
          ) : (
            <EmptyState title="No draft results" description="Enter results from Result entry." />
          )}
        </Card>
        <Card title="Pending tasks (worklist)">
          {attentionWorklist.length ? (
            <DataTable
              columns={[
                { key: 'orderId', header: 'Order' },
                { key: 'testName', header: 'Test' },
                { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              ]}
              rows={attentionWorklist}
              onRowClick={(row) =>
                navigate(row.sampleId ? `/app/lab/samples/${row.sampleId}` : `/app/lab/orders/${row.orderId}`)
              }
            />
          ) : (
            <EmptyState title="No urgent tasks" description="Worklist is up to date for demo data." />
          )}
          <Link to="/app/lab/worklist">Open full worklist →</Link>
        </Card>
        <Card title="Recent laboratory activity">
          {activity.length ? (
            <DataTable
              columns={[
                { key: 'timestamp', header: 'Time', render: (r) => r.timestamp?.slice(0, 19) ?? '—' },
                { key: 'action', header: 'Action' },
                { key: 'resource', header: 'Resource' },
              ]}
              rows={activity}
            />
          ) : (
            <EmptyState title="No activity yet" description="Actions in this session appear here." />
          )}
        </Card>
      </div>
    </>
  )
}

export function LabOrderDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { state, findOrder } = useMockData()
  const order = findOrder(id)
  if (!order) return <NotFoundPage />
  const items = state.orderItems.filter((oi) => oi.orderId === id)
  const samples = state.samples.filter((s) => s.orderId === id)

  return (
    <>
      <EntityDetailPage
        title={`Order ${order.id}`}
        description={`${order.patientName} — demo order summary for lab workflow.`}
        backTo="/app/lab/worklist"
        fields={[
          { label: 'Patient', value: order.patientName },
          { label: 'Status', value: <StatusBadge status={order.status} /> },
          { label: 'Order date', value: order.createdAt },
          { label: 'Total', value: `$${order.totalAmount}` },
        ]}
      >
        <DemoSessionNotice />
        <h3>Required tests</h3>
        <DataTable
          columns={[
            { key: 'testCode', header: 'Code' },
            { key: 'testName', header: 'Test' },
            { key: 'price', header: 'Price', render: (r) => `$${r.price}` },
          ]}
          rows={items}
        />
        <h3>Samples for this order</h3>
        {samples.length ? (
          <DataTable
            columns={[
              { key: 'id', header: 'Sample ID' },
              { key: 'barcode', header: 'Barcode' },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            ]}
            rows={samples}
            onRowClick={(row) => navigate(`/app/lab/samples/${row.id}`)}
          />
        ) : (
          <EmptyState title="No samples registered" description="Register a sample from the Samples page." />
        )}
        <Link to="/app/lab/samples">
          <Button variant="primary">Register sample</Button>
        </Link>
      </EntityDetailPage>
    </>
  )
}

export function LabWorklistPage() {
  const { state } = useMockData()
  const navigate = useNavigate()
  const [priority, setPriority] = useState('')
  const [sortKey, setSortKey] = useState('priority')
  const [attentionOnly, setAttentionOnly] = useState(false)
  const rows = useMemo(() => buildWorklist(state), [state])
  const filteredByPriority = useMemo(() => {
    let next = priority ? rows.filter((r) => r.priority === priority) : rows
    if (attentionOnly) next = next.filter((r) => r.needsAttention)
    return sortWorklistRows(next, sortKey)
  }, [rows, priority, sortKey, attentionOnly])
  const list = useListControls(filteredByPriority, {
    searchKeys: ['patientName', 'testCode', 'testName', 'orderId', 'sampleBarcode', 'sampleId'],
  })

  return (
    <>
      <PageHeader title="Worklist" description="Laboratory orders and required tests." />
      <DemoSessionNotice />
      <div className="sl-list-toolbar" style={{ marginBottom: 16 }}>
        <Select
          aria-label="Filter by priority"
          value={priority}
          onChange={(e) => {
            setPriority(e.target.value)
            list.setPage(1)
          }}
        >
          <option value="">All priorities</option>
          <option value="STAT">STAT</option>
          <option value="ROUTINE">ROUTINE</option>
        </Select>
        <Select
          aria-label="Sort worklist"
          value={sortKey}
          onChange={(e) => {
            setSortKey(e.target.value)
            list.setPage(1)
          }}
        >
          <option value="priority">Sort: Priority</option>
          <option value="orderDate-desc">Sort: Order date (newest)</option>
          <option value="orderDate-asc">Sort: Order date (oldest)</option>
          <option value="patient-asc">Sort: Patient name</option>
          <option value="test-asc">Sort: Test name</option>
        </Select>
        <label className="sl-row" style={{ alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={attentionOnly}
            onChange={(e) => {
              setAttentionOnly(e.target.checked)
              list.setPage(1)
            }}
          />
          Needs attention only
        </label>
        <Button variant="ghost" onClick={() => navigate('/app/lab/sample-tests')}>
          Manage sample tests →
        </Button>
      </div>
      <ResourceListPage
        title="Active worklist"
        description="Search and filter by status or priority."
        columns={[
          { key: 'orderId', header: 'Order' },
          { key: 'orderDate', header: 'Order date' },
          { key: 'patientName', header: 'Patient' },
          { key: 'sampleId', header: 'Sample ID', render: (r) => r.sampleId ?? '—' },
          { key: 'testName', header: 'Test' },
          { key: 'priority', header: 'Priority', render: (r) => <StatusBadge status={r.priority} /> },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          {
            key: 'attention',
            header: 'Attention',
            render: (r) =>
              r.needsAttention ? (
                <span className="sl-badge sl-badge--warning">Needs action</span>
              ) : (
                '—'
              ),
          },
          {
            key: 'actions',
            header: 'Open',
            render: (r) => (
              <div className="sl-row" onClick={(e) => e.stopPropagation()} role="presentation">
                <Button size="sm" variant="ghost" onClick={() => navigate(`/app/lab/orders/${r.orderId}`)}>
                  Order
                </Button>
                {r.sampleId ? (
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/app/lab/samples/${r.sampleId}`)}>
                    Sample
                  </Button>
                ) : null}
                {r.sampleTestId ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => navigate(`/app/lab/results/entry?sampleTestId=${r.sampleTestId}`)}
                  >
                    Result
                  </Button>
                ) : null}
              </div>
            ),
          },
        ]}
        rows={list.rows}
        onRowTo={(row) =>
          row.sampleId ? `/app/lab/samples/${row.sampleId}` : `/app/lab/orders/${row.orderId}`
        }
        toolbar={{
          search: list.search,
          onSearchChange: (v) => {
            list.setSearch(v)
            list.setPage(1)
          },
          status: list.status,
          onStatusChange: (v) => {
            list.setStatus(v)
            list.setPage(1)
          },
          statusOptions: ['AWAITING_SAMPLE', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
          placeholder: 'Search patient, test, order…',
        }}
        pagination={{ page: list.page, totalPages: list.totalPages, onPageChange: list.setPage }}
      />
    </>
  )
}

export function LabSamplesPage() {
  const { state, registerSample } = useMockData()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [formError, setFormError] = useState(null)
  const [formSuccess, setFormSuccess] = useState(null)
  const [orderId, setOrderId] = useState(state.orders[0]?.id ?? '')

  const sampleRows = useMemo(() => enrichSamples(state), [state])
  const list = useListControls(sampleRows, {
    searchKeys: ['id', 'barcode', 'orderId', 'sampleType', 'patientName'],
  })

  const selectedOrder = state.orders.find((o) => o.id === orderId)

  const onRegister = (e) => {
    e.preventDefault()
    setFormError(null)
    setFormSuccess(null)
    const fd = new FormData(e.target)
    const orderVal = fd.get('orderId')
    const typeVal = fd.get('sampleType')
    if (!orderVal || !typeVal) {
      setFormError('Order and sample type are required.')
      return
    }
    const res = registerSample({
      orderId: orderVal,
      patientId: selectedOrder?.patientId,
      sampleType: typeVal,
      collectionNotes: fd.get('collectionNotes'),
      collectedAt: fd.get('collectedAt'),
      actor: user?.email,
    })
    if (!res.ok) {
      setFormError(res.message)
      return
    }
    setFormSuccess(`Sample ${res.sample.barcode} registered.`)
    navigate(`/app/lab/samples/${res.sample.id}`)
  }

  return (
    <>
      <PageHeader title="Samples" description="Register and track specimen lifecycle." />
      <DemoSessionNotice message="Sample registration updates mock session state only." />
      <Card title="Register sample">
        <form onSubmit={onRegister}>
          <FormField id="orderId" label="Order" required>
            <Select
              id="orderId"
              name="orderId"
              required
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
            >
              {state.orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.id} — {o.patientName}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="patientDisplay" label="Patient">
            <TextInput id="patientDisplay" readOnly value={selectedOrder?.patientName ?? ''} />
          </FormField>
          <FormField id="sampleType" label="Sample type" required>
            <Select id="sampleType" name="sampleType" required defaultValue="Whole blood">
              {SAMPLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="collectedAt" label="Collection date/time">
            <TextInput
              id="collectedAt"
              name="collectedAt"
              type="datetime-local"
              defaultValue={new Date().toISOString().slice(0, 16)}
            />
          </FormField>
          <FormField id="collectionNotes" label="Collection notes">
            <TextInput id="collectionNotes" name="collectionNotes" placeholder="Optional notes" />
          </FormField>
          {formError ? <p className="sl-alert sl-alert--danger">{formError}</p> : null}
          {formSuccess ? <p className="sl-alert sl-alert--info">{formSuccess}</p> : null}
          <Button type="submit" variant="primary">
            Register sample
          </Button>
        </form>
      </Card>

      <ResourceListPage
        title="Registered samples"
        columns={[
          { key: 'id', header: 'Sample ID' },
          { key: 'barcode', header: 'Barcode' },
          { key: 'orderId', header: 'Order' },
          { key: 'patientName', header: 'Patient' },
          { key: 'sampleType', header: 'Type' },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'collectedAt', header: 'Collected', render: (r) => r.collectedAt?.slice(0, 16) ?? '—' },
        ]}
        rows={list.rows}
        onRowTo={(row) => `/app/lab/samples/${row.id}`}
        toolbar={{
          search: list.search,
          onSearchChange: list.setSearch,
          status: list.status,
          onStatusChange: list.setStatus,
          statusOptions: ['REGISTERED', 'RECEIVED', 'ACCEPTED', 'REJECTED', 'REPLACED'],
        }}
        pagination={{ page: list.page, totalPages: list.totalPages, onPageChange: list.setPage }}
      />
    </>
  )
}

export function LabSampleDetailPage() {
  const { id } = useParams()
  const {
    findSample,
    state,
    receiveSample,
    acceptSample,
    rejectSample,
    replaceSample,
  } = useMockData()
  const { user } = useAuth()
  const sample = findSample(id)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [acceptOpen, setAcceptOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [rejectError, setRejectError] = useState(null)
  const [actionNotice, setActionNotice] = useState(null)
  const [actionError, setActionError] = useState(null)

  if (!sample) return <NotFoundPage />

  const order = state.orders.find((o) => o.id === sample.orderId)
  const patient = state.patients.find((p) => p.id === sample.patientId)
  const tests = state.sampleTests.filter((t) => t.sampleId === sample.id && t.status !== 'CANCELLED')

  const runReceive = () => {
    setActionError(null)
    const res = receiveSample(sample.id, user?.email)
    if (res.ok) setActionNotice('Sample marked as received.')
    else setActionError(res.message)
  }

  const runAccept = () => {
    setActionError(null)
    const res = acceptSample(sample.id, user?.email)
    if (res.ok) {
      setAcceptOpen(false)
      setActionNotice('Sample accepted for processing.')
    } else setActionError(res.message)
  }

  return (
    <>
      <EntityDetailPage
        title={sample.barcode}
        description={`Sample ${sample.id} — ${patient?.fullName ?? order?.patientName ?? ''}`}
        backTo="/app/lab/samples"
        fields={[
          { label: 'Sample ID', value: sample.id },
          { label: 'Status', value: <StatusBadge status={sample.status} /> },
          { label: 'Patient', value: patient?.fullName ?? order?.patientName ?? '—' },
          {
            label: 'Order',
            value: (
              <Link to={`/app/lab/orders/${sample.orderId}`}>{sample.orderId}</Link>
            ),
          },
          { label: 'Sample type', value: sample.sampleType ?? '—' },
          { label: 'Collected', value: sample.collectedAt ?? '—' },
          { label: 'Received', value: sample.receivedAt ?? '—' },
          { label: 'Accepted', value: sample.acceptedAt ?? '—' },
          { label: 'Collection notes', value: sample.collectionNotes || '—' },
          { label: 'Rejection reason', value: sample.rejectionReason ?? '—' },
        ]}
      >
        <DemoSessionNotice />
        {actionNotice ? <p className="sl-alert sl-alert--info">{actionNotice}</p> : null}
        {actionError ? <p className="sl-alert sl-alert--danger">{actionError}</p> : null}
        <div className="sl-row" style={{ marginBottom: 16 }}>
          {['REGISTERED', 'COLLECTED'].includes(sample.status) ? (
            <Button variant="secondary" onClick={runReceive}>
              Mark received
            </Button>
          ) : null}
          {sample.status !== 'ACCEPTED' && sample.status !== 'REJECTED' ? (
            <Button variant="primary" onClick={() => setAcceptOpen(true)}>
              Accept sample
            </Button>
          ) : null}
          {sample.status !== 'REJECTED' ? (
            <Button variant="danger" onClick={() => setRejectOpen(true)}>
              Reject sample
            </Button>
          ) : null}
          {sample.status === 'REJECTED' ? (
            <Button variant="ghost" onClick={() => replaceSample(sample.id, user?.email)}>
              Create replacement sample
            </Button>
          ) : null}
          <Link to={`/app/lab/sample-tests?sampleId=${sample.id}`}>
            <Button variant="secondary">Assign tests</Button>
          </Link>
        </div>
        <h3>Processing status</h3>
        <DataTable
          columns={[
            { key: 'id', header: 'Test ID' },
            { key: 'testCode', header: 'Code' },
            {
              key: 'testName',
              header: 'Test name',
              render: (r) => state.labTests.find((t) => t.id === r.testId)?.name ?? r.testCode,
            },
            { key: 'priority', header: 'Priority' },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            {
              key: 'entry',
              header: 'Result entry',
              render: (r) =>
                sample.status === 'ACCEPTED' && !['COMPLETED', 'CANCELLED'].includes(r.status) ? (
                  <Link to={`/app/lab/results/entry?sampleTestId=${r.id}`}>Enter results</Link>
                ) : (
                  '—'
                ),
            },
          ]}
          rows={tests}
        />
        {!tests.length ? (
          <EmptyState title="No tests assigned" description="Assign required tests from Sample tests." />
        ) : null}
      </EntityDetailPage>
      <ConfirmDialog
        open={acceptOpen}
        title="Accept sample"
        message="Accept this sample for laboratory processing? Status will update across the dashboard and worklist."
        confirmLabel="Accept sample"
        onCancel={() => setAcceptOpen(false)}
        onConfirm={runAccept}
      />
      <Modal
        open={rejectOpen}
        title="Reject sample"
        onClose={() => {
          setRejectOpen(false)
          setRejectError(null)
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setRejectOpen(false)
                setRejectError(null)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const res = rejectSample(sample.id, reason, user?.email)
                if (!res.ok) {
                  setRejectError(res.message)
                  return
                }
                setRejectOpen(false)
                setActionNotice('Sample rejected.')
              }}
            >
              Reject sample
            </Button>
          </>
        }
      >
        <p>Rejected samples cannot be processed. A reason is required.</p>
        <FormField id="rejectReason" label="Rejection reason" required>
          <TextInput
            id="rejectReason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            placeholder="Required"
          />
        </FormField>
        {rejectError ? <p className="sl-alert sl-alert--danger">{rejectError}</p> : null}
      </Modal>
    </>
  )
}

export function LabSampleTestsPage() {
  const { state, assignSampleTest } = useMockData()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialSample = searchParams.get('sampleId') ?? state.samples[0]?.id ?? ''
  const [sampleId, setSampleId] = useState(initialSample)
  const [testId, setTestId] = useState('')
  const [priority, setPriority] = useState('ROUTINE')
  const [notice, setNotice] = useState(null)
  const [error, setError] = useState(null)

  const sample = state.samples.find((s) => s.id === sampleId)
  const assigned = state.sampleTests.filter((st) => st.sampleId === sampleId && st.status !== 'CANCELLED')
  const orderItems = sample
    ? state.orderItems.filter((oi) => oi.orderId === sample.orderId)
    : []

  const enrichedTests = useMemo(() => enrichSampleTests(state), [state])
  const list = useListControls(enrichedTests, {
    searchKeys: ['testCode', 'testName', 'sampleId', 'sampleBarcode'],
  })

  useEffect(() => {
    const fromUrl = searchParams.get('sampleId')
    if (fromUrl) setSampleId(fromUrl)
  }, [searchParams])

  const onAssign = (e) => {
    e.preventDefault()
    setNotice(null)
    setError(null)
    const res = assignSampleTest(sampleId, testId, priority, user?.email)
    if (!res.ok) {
      setError(res.message)
      return
    }
    setNotice(`Assigned ${res.sampleTest.testCode} to sample.`)
    setTestId('')
  }

  const assignFromOrder = (item) => {
    setNotice(null)
    setError(null)
    const res = assignSampleTest(sampleId, item.testId, priority, user?.email)
    if (!res.ok) setError(res.message)
    else setNotice(`Assigned ${item.testCode} from order.`)
  }

  return (
    <>
      <PageHeader title="Sample tests" description="Associate laboratory tests with samples." />
      <DemoSessionNotice />
      <Card title="Assign test to sample">
        <form onSubmit={onAssign} className="sl-grid-2">
          <FormField id="samplePick" label="Sample" required>
            <Select id="samplePick" value={sampleId} onChange={(e) => setSampleId(e.target.value)} required>
              {state.samples.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.barcode} — {s.status}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="testPick" label="Test" required>
            <Select id="testPick" value={testId} onChange={(e) => setTestId(e.target.value)} required>
              <option value="">Select test…</option>
              {state.labTests.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} — {t.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="priorityPick" label="Priority">
            <Select id="priorityPick" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="ROUTINE">ROUTINE</option>
              <option value="STAT">STAT</option>
            </Select>
          </FormField>
          <div style={{ alignSelf: 'end' }}>
            <Button type="submit" variant="primary">
              Assign test
            </Button>
          </div>
        </form>
        {error ? <p className="sl-alert sl-alert--danger">{error}</p> : null}
        {notice ? <p className="sl-alert sl-alert--info">{notice}</p> : null}
        {orderItems.length ? (
          <>
            <h4 style={{ marginTop: 16 }}>Required tests on order {sample?.orderId}</h4>
            <div className="sl-row">
              {orderItems.map((oi) => (
                <Button key={oi.id} type="button" variant="secondary" onClick={() => assignFromOrder(oi)}>
                  Add {oi.testCode}
                </Button>
              ))}
            </div>
          </>
        ) : null}
        {assigned.length ? (
          <>
            <h4 style={{ marginTop: 16 }}>Currently assigned</h4>
            <DataTable
              columns={[
                { key: 'id', header: 'Test ID' },
                { key: 'testCode', header: 'Code' },
                {
                  key: 'testName',
                  header: 'Name',
                  render: (r) => state.labTests.find((t) => t.id === r.testId)?.name ?? r.testCode,
                },
                { key: 'priority', header: 'Priority' },
                { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                {
                  key: 'entry',
                  header: '',
                  render: (r) => {
                    const smp = state.samples.find((s) => s.id === r.sampleId)
                    return smp?.status === 'ACCEPTED' &&
                      !['COMPLETED', 'CANCELLED'].includes(r.status) ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => navigate(`/app/lab/results/entry?sampleTestId=${r.id}`)}
                      >
                        Result entry
                      </Button>
                    ) : null
                  },
                },
              ]}
              rows={assigned}
            />
          </>
        ) : null}
      </Card>
      <ResourceListPage
        title="All sample–test links"
        columns={[
          { key: 'sampleId', header: 'Sample ID' },
          { key: 'sampleBarcode', header: 'Barcode' },
          { key: 'id', header: 'Assignment ID' },
          { key: 'testCode', header: 'Test' },
          { key: 'testName', header: 'Test name' },
          { key: 'priority', header: 'Priority' },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ]}
        rows={list.rows}
        toolbar={{
          search: list.search,
          onSearchChange: list.setSearch,
          status: list.status,
          onStatusChange: list.setStatus,
          statusOptions: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
        }}
        pagination={{ page: list.page, totalPages: list.totalPages, onPageChange: list.setPage }}
      />
    </>
  )
}

export function LabResultEntryPage() {
  const { state, ensureDraftForSampleTest, saveDraftResult } = useMockData()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const eligible = state.sampleTests.filter((st) => {
    const sample = state.samples.find((s) => s.id === st.sampleId)
    return sample?.status === 'ACCEPTED' && !['COMPLETED', 'CANCELLED'].includes(st.status)
  })
  const [sampleTestId, setSampleTestId] = useState(eligible[0]?.id ?? '')
  const [resultId, setResultId] = useState(null)
  const [values, setValues] = useState({})
  const [labNotes, setLabNotes] = useState('')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const fromUrl = searchParams.get('sampleTestId')
    if (fromUrl) setSampleTestId(fromUrl)
  }, [searchParams])

  const cancelEditing = () => {
    setResultId(null)
    setValues({})
    setLabNotes('')
    setError(null)
    setSuccess(null)
  }

  const loadDraft = () => {
    setError(null)
    setSuccess(null)
    const res = ensureDraftForSampleTest(sampleTestId, user?.email)
    if (!res.ok) {
      setError(res.message)
      setResultId(null)
      return
    }
    setResultId(res.result.id)
    setLabNotes(res.result.labNotes ?? '')
  }

  useEffect(() => {
    if (!resultId) return
    const vals = state.resultValues.filter((v) => v.resultId === resultId)
    const map = {}
    vals.forEach((v) => {
      map[v.id] = v.value
    })
    setValues(map)
    const row = state.testResults.find((r) => r.id === resultId)
    if (row) setLabNotes(row.labNotes ?? '')
  }, [resultId, state.resultValues, state.testResults])

  const resultValues = resultId
    ? state.resultValues.filter((v) => v.resultId === resultId)
    : []

  const onSave = (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    if (!resultId) {
      setError('Select a sample test and load the result form first.')
      return
    }
    setSaving(true)
    const res = saveDraftResult(
      resultId,
      { valuesById: values, labNotes },
      user?.email,
    )
    setSaving(false)
    if (!res.ok) {
      setError(res.message)
      return
    }
    setSuccess('Draft saved (demo session only — not sent to a server).')
  }

  return (
    <>
      <PageHeader title="Result entry" description="Enter values for an assigned sample test." />
      <DemoSessionNotice message="Demo values only — not for clinical use." />
      <Card>
        <FormField id="stSelect" label="Sample test" required>
          <Select
            id="stSelect"
            value={sampleTestId}
            onChange={(e) => {
              setSampleTestId(e.target.value)
              setResultId(null)
            }}
          >
            {eligible.length ? null : <option value="">No eligible tests</option>}
            {eligible.map((st) => {
              const sample = state.samples.find((s) => s.id === st.sampleId)
              return (
                <option key={st.id} value={st.id}>
                  {sample?.barcode} — {st.testCode} ({st.status})
                </option>
              )
            })}
          </Select>
        </FormField>
        <Button type="button" variant="secondary" onClick={loadDraft} disabled={!sampleTestId}>
          Load result form
        </Button>
        {resultId ? (
          <form onSubmit={onSave} style={{ marginTop: 24 }}>
            <p>
              Draft result <strong>{resultId}</strong>
            </p>
            {resultValues.map((v) => (
              <FormField
                key={v.id}
                id={v.id}
                label={`${v.parameterCode} (${v.unit}) — ref ${v.refMin}–${v.refMax}`}
                required
              >
                <TextInput
                  id={v.id}
                  type={v.valueType === 'numeric' ? 'number' : 'text'}
                  step="any"
                  value={values[v.id] ?? ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [v.id]: e.target.value }))}
                  required
                />
              </FormField>
            ))}
            <FormField id="labNotes" label="Laboratory notes">
              <TextInput
                id="labNotes"
                value={labNotes}
                onChange={(e) => setLabNotes(e.target.value)}
              />
            </FormField>
            {error ? <p className="sl-alert sl-alert--danger">{error}</p> : null}
            {success ? <p className="sl-alert sl-alert--info">{success}</p> : null}
            <div className="sl-row">
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save draft'}
              </Button>
              <Button type="button" variant="secondary" onClick={cancelEditing}>
                Cancel
              </Button>
              <Button type="button" variant="ghost" onClick={() => navigate(`/app/lab/results/${resultId}/edit`)}>
                Open in draft editor
              </Button>
            </div>
          </form>
        ) : null}
        {!resultId && error ? <p className="sl-alert sl-alert--danger">{error}</p> : null}
      </Card>
    </>
  )
}

export function LabDraftResultsPage() {
  const { state } = useMockData()
  const [completeFilter, setCompleteFilter] = useState('')
  const drafts = useMemo(() => {
    let rows = state.testResults.filter((r) => r.status === 'DRAFT')
    if (completeFilter === 'complete') {
      rows = rows.filter((r) =>
        draftIsComplete(state.resultValues.filter((v) => v.resultId === r.id)),
      )
    }
    if (completeFilter === 'incomplete') {
      rows = rows.filter(
        (r) => !draftIsComplete(state.resultValues.filter((v) => v.resultId === r.id)),
      )
    }
    return rows
  }, [state, completeFilter])
  const list = useListControls(drafts, { searchKeys: ['id', 'patientName', 'orderId'] })

  return (
    <>
      <PageHeader title="Draft results" description="Review and edit unpublished results." />
      <DemoSessionNotice />
      <div className="sl-list-toolbar" style={{ marginBottom: 16 }}>
        <Select
          aria-label="Filter by validation"
          value={completeFilter}
          onChange={(e) => setCompleteFilter(e.target.value)}
        >
          <option value="">All drafts</option>
          <option value="complete">Complete only</option>
          <option value="incomplete">Incomplete only</option>
        </Select>
      </div>
      <ResourceListPage
        title="Unpublished drafts"
        columns={[
          { key: 'id', header: 'Result ID' },
          { key: 'patientName', header: 'Patient' },
          {
            key: 'sample',
            header: 'Sample',
            render: (r) => resultContext(state, r).sampleId,
          },
          {
            key: 'test',
            header: 'Test',
            render: (r) => resultContext(state, r).testName,
          },
          { key: 'status', header: 'Status', render: () => <StatusBadge status="DRAFT" /> },
          {
            key: 'complete',
            header: 'Validated',
            render: (r) => {
              const vals = state.resultValues.filter((v) => v.resultId === r.id)
              return draftIsComplete(vals) ? 'Yes' : 'Incomplete'
            },
          },
          {
            key: 'correction',
            header: 'Type',
            render: (r) => (r.correctsResultId ? 'Correction draft' : 'New result'),
          },
        ]}
        rows={list.rows}
        onRowTo={(row) => `/app/lab/results/${row.id}/edit`}
        toolbar={{ search: list.search, onSearchChange: list.setSearch }}
        pagination={{ page: list.page, totalPages: list.totalPages, onPageChange: list.setPage }}
      />
    </>
  )
}

export function LabPublishResultsPage() {
  const { state, publishResult } = useMockData()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [selected, setSelected] = useState(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [publishing, setPublishing] = useState(false)

  const eligible = state.testResults.filter((r) => {
    if (r.status !== 'DRAFT') return false
    const vals = state.resultValues.filter((v) => v.resultId === r.id)
    return draftIsComplete(vals)
  })

  const openConfirm = (result) => {
    setSelected(result)
    setConfirmOpen(true)
    setError(null)
  }

  const doPublish = () => {
    if (!selected) return
    setPublishing(true)
    const res = publishResult(selected.id, user?.email)
    setPublishing(false)
    if (!res.ok) {
      setError(res.message)
      return
    }
    setConfirmOpen(false)
    setSuccess(
      selected.correctsResultId
        ? `Correction ${selected.id} published. Original ${selected.correctsResultId} remains on record.`
        : `Result ${selected.id} published (demo session only).`,
    )
    setSelected(null)
  }

  const reviewContext = selected ? resultContext(state, selected) : null
  const reviewValues = selected
    ? state.resultValues.filter((v) => v.resultId === selected.id)
    : []

  return (
    <>
      <PageHeader title="Publish results" description="Review complete drafts before release." />
      <DemoSessionNotice message="Publishing notifies the demo patient portal only — fictional data." />
      {success ? <p className="sl-alert sl-alert--info">{success}</p> : null}
      {error ? <p className="sl-alert sl-alert--danger">{error}</p> : null}
      <Card title="Eligible for publication">
        {eligible.length ? (
          <DataTable
            columns={[
              { key: 'id', header: 'Result' },
              { key: 'patientName', header: 'Patient' },
              {
                key: 'summary',
                header: 'Review summary',
                render: (r) => {
                  const vals = state.resultValues.filter((v) => v.resultId === r.id)
                  return vals.map((v) => `${v.parameterCode}: ${v.value} ${v.unit}`).join('; ')
                },
              },
              {
                key: 'actions',
                header: '',
                render: (r) => (
                  <Button size="sm" variant="primary" onClick={() => openConfirm(r)}>
                    Review & publish
                  </Button>
                ),
              },
            ]}
            rows={eligible}
          />
        ) : (
          <EmptyState
            title="No drafts ready to publish"
            description="Complete result entry and save validated drafts first."
          />
        )}
      </Card>
      <Modal
        open={confirmOpen}
        title="Review before publication"
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={doPublish} disabled={publishing}>
              {publishing ? 'Publishing…' : 'Confirm publish'}
            </Button>
          </>
        }
      >
        {selected && reviewContext ? (
          <>
            <p>
              <strong>Result ID:</strong> {selected.id} · <strong>Patient:</strong>{' '}
              {selected.patientName} · <strong>Order:</strong> {selected.orderId}
            </p>
            <p>
              <strong>Sample:</strong> {reviewContext.sampleBarcode} ({reviewContext.sampleId}) ·{' '}
              <strong>Test:</strong> {reviewContext.testName}
            </p>
            {selected.labNotes ? (
              <p>
                <strong>Notes:</strong> {selected.labNotes}
              </p>
            ) : null}
            <DataTable
              columns={[
                { key: 'parameterCode', header: 'Parameter' },
                { key: 'value', header: 'Value' },
                { key: 'unit', header: 'Unit' },
                {
                  key: 'range',
                  header: 'Reference',
                  render: (v) => `${v.refMin}–${v.refMax}`,
                },
                { key: 'flag', header: 'Flag' },
              ]}
              rows={reviewValues}
            />
            <p className="sl-text-muted" style={{ marginTop: 12 }}>
              Demo only — this does not publish real medical results or save to a database.
            </p>
          </>
        ) : null}
      </Modal>
      <p style={{ marginTop: 16 }}>
        <Link to="/app/lab/results/drafts">← Back to drafts</Link>
        {' · '}
        <Button variant="ghost" onClick={() => navigate('/app/lab/results/drafts')}>
          Edit drafts
        </Button>
      </p>
    </>
  )
}

export function LabResultCorrectionsPage() {
  const { state, createCorrectionDraft } = useMockData()
  const { user } = useAuth()
  const navigate = useNavigate()
  const published = state.testResults.filter((r) => r.status === 'PUBLISHED')
  const corrections = state.testResults.filter(
    (r) => r.correctsResultId || r.status === 'CORRECTED',
  )
  const list = useListControls(published, { searchKeys: ['id', 'patientName', 'orderId'] })
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [confirmOriginalId, setConfirmOriginalId] = useState(null)

  const startCorrection = (originalId) => {
    setError(null)
    setSuccess(null)
    const res = createCorrectionDraft(originalId, reason, user?.email)
    if (!res.ok) {
      setError(res.message)
      return
    }
    setConfirmOriginalId(null)
    setSuccess(`Correction draft ${res.result.id} created — edit values before publishing.`)
    navigate(`/app/lab/results/${res.result.id}/edit`)
  }

  return (
    <>
      <PageHeader
        title="Result corrections"
        description="Create a new corrected record; originals remain published."
      />
      <DemoSessionNotice message="Corrections add a separate draft — they do not overwrite published rows." />
      {error ? <p className="sl-alert sl-alert--danger">{error}</p> : null}
      {success ? <p className="sl-alert sl-alert--info">{success}</p> : null}
      <Card title="Published results">
        <FormField id="corrReason" label="Correction reason (required before starting)" required>
          <TextInput
            id="corrReason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Transcription error"
          />
        </FormField>
        <TextInput
          aria-label="Search published results"
          placeholder="Search…"
          value={list.search}
          onChange={(e) => list.setSearch(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        {list.rows.length ? (
          <DataTable
            columns={[
              { key: 'id', header: 'Result' },
              { key: 'orderId', header: 'Order' },
              { key: 'patientName', header: 'Patient' },
              { key: 'publishedAt', header: 'Published' },
              {
                key: 'act',
                header: '',
                render: (r) => (
                  <Button size="sm" variant="secondary" onClick={() => setConfirmOriginalId(r.id)}>
                    Create correction
                  </Button>
                ),
              },
            ]}
            rows={list.rows}
          />
        ) : (
          <EmptyState title="No published results" />
        )}
      </Card>
      <Card title="Original & corrected records">
        <DataTable
          columns={[
            { key: 'id', header: 'Result ID' },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'correctsResultId', header: 'Corrects', render: (r) => r.correctsResultId ?? '—' },
            { key: 'correctionReason', header: 'Reason', render: (r) => r.correctionReason ?? '—' },
            { key: 'publishedAt', header: 'Published', render: (r) => r.publishedAt ?? '—' },
            {
              key: 'view',
              header: '',
              render: (r) => (
                <Link to={`/app/lab/results/${r.id}/edit`}>
                  {r.status === 'DRAFT' ? 'Edit draft' : 'View'}
                </Link>
              ),
            },
          ]}
          rows={[...published, ...corrections].filter(
            (r, i, arr) => arr.findIndex((x) => x.id === r.id) === i,
          )}
        />
      </Card>
      <ConfirmDialog
        open={Boolean(confirmOriginalId)}
        title="Start correction"
        message={`Create a new correction draft for result ${confirmOriginalId}? The original published record will remain unchanged.${
          reason.trim() ? '' : ' Enter a correction reason above before confirming.'
        }`}
        confirmLabel="Create correction draft"
        onCancel={() => setConfirmOriginalId(null)}
        onConfirm={() => {
          if (!reason.trim()) {
            setError('Correction reason is required.')
            return
          }
          startCorrection(confirmOriginalId)
        }}
      />
    </>
  )
}

export function LabResultEditPage() {
  const { id } = useParams()
  const { findResult, state, saveDraftResult } = useMockData()
  const { user } = useAuth()
  const navigate = useNavigate()
  const result = findResult(id)
  const [values, setValues] = useState({})
  const [labNotes, setLabNotes] = useState('')
  const [notice, setNotice] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!result) return
    const rows = state.resultValues.filter((v) => v.resultId === result.id)
    const init = {}
    rows.forEach((v) => {
      init[v.id] = v.value
    })
    setValues(init)
    setLabNotes(result.labNotes ?? '')
  }, [result, state.resultValues])

  if (!result) return <NotFoundPage />

  const readOnly = result.status === 'PUBLISHED' || result.status === 'CORRECTED'
  const valueRows = state.resultValues.filter((v) => v.resultId === result.id)

  const onSave = (e) => {
    e.preventDefault()
    setNotice(null)
    setError(null)
    setSaving(true)
    const res = saveDraftResult(result.id, { valuesById: values, labNotes }, user?.email)
    setSaving(false)
    if (!res.ok) {
      setError(res.message)
      return
    }
    setNotice('Draft saved (demo session).')
  }

  const ctx = resultContext(state, result)

  return (
    <>
      <PageHeader
        title={`${readOnly ? 'View' : 'Edit'} result ${result.id}`}
        description={
          result.correctsResultId
            ? `Correction draft for published result ${result.correctsResultId}.`
            : 'Enter numeric/text values with reference flags.'
        }
      />
      <DemoSessionNotice />
      <p>
        Patient: <strong>{result.patientName}</strong> · Sample:{' '}
        <strong>{ctx.sampleBarcode}</strong> · Test: <strong>{ctx.testName}</strong>
      </p>
      {result.correctsResultId ? (
        <p className="sl-alert sl-alert--info">
          Original published result {result.correctsResultId} is preserved. Reason:{' '}
          {result.correctionReason ?? '—'}
        </p>
      ) : null}
      <Card className={readOnly ? 'sl-result-published' : 'sl-result-draft'}>
        <form onSubmit={onSave}>
          {valueRows.map((v) => (
            <FormField
              key={v.id}
              id={v.id}
              label={`${v.parameterCode} (${v.unit}) ref ${v.refMin}–${v.refMax}`}
              required={!readOnly}
            >
              <TextInput
                id={v.id}
                type={v.valueType === 'numeric' ? 'number' : 'text'}
                step="any"
                value={values[v.id] ?? v.value}
                onChange={(e) => setValues((prev) => ({ ...prev, [v.id]: e.target.value }))}
                disabled={readOnly}
                required={!readOnly}
              />
            </FormField>
          ))}
          <FormField id="editNotes" label="Laboratory notes">
            <TextInput
              id="editNotes"
              value={labNotes}
              onChange={(e) => setLabNotes(e.target.value)}
              disabled={readOnly}
            />
          </FormField>
          {!readOnly ? (
            <>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save draft'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => navigate('/app/lab/results/drafts')}>
                Cancel
              </Button>
            </>
          ) : (
            <p>Published results are read-only. Start a correction from Result corrections.</p>
          )}
        </form>
        {notice ? <p className="sl-alert sl-alert--info">{notice}</p> : null}
        {error ? <p className="sl-alert sl-alert--danger">{error}</p> : null}
        <div className="sl-row" style={{ marginTop: 16 }}>
          {!readOnly && draftIsComplete(valueRows.map((v) => ({ ...v, value: values[v.id] ?? v.value }))) ? (
            <Link to="/app/lab/results/publish">
              <Button variant="secondary">Go to publish</Button>
            </Link>
          ) : null}
          <Button variant="ghost" onClick={() => navigate('/app/lab/results/drafts')}>
            Back to drafts
          </Button>
          <Link to={`/app/lab/results/${result.id}/history`}>
            <Button variant="ghost">Version history</Button>
          </Link>
        </div>
      </Card>
    </>
  )
}

export function LabResultHistoryPage() {
  const { id } = useParams()
  const { state, findResult } = useMockData()
  const result = findResult(id)
  if (!result) return <NotFoundPage />
  const versions = state.resultVersions.filter((v) => v.resultId === id)
  return (
    <>
      <PageHeader title="Result version history" description={`Audit trail for ${id}.`} />
      <ResourceListPage
        title="Published snapshots"
        columns={[
          { key: 'version', header: 'Version' },
          { key: 'publishedAt', header: 'Timestamp' },
          { key: 'note', header: 'Note' },
        ]}
        rows={versions}
      />
      <Link to={`/app/lab/results/${id}/edit`}>← Back to result</Link>
    </>
  )
}

/** @deprecated Use LabSamplesPage registration form */
export function LabSampleRegisterPage() {
  return <Navigate to="/app/lab/samples" replace />
}
