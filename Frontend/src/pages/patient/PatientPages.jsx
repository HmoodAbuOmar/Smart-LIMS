import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth/AuthContext'
import { useMockData } from '../../mock-data/MockDataProvider'
import { useListControls } from '../../hooks/useListControls'
import {
  filterForPatient,
  isUpcomingAppointment,
  patientIdFromAuth,
} from '../../features/patients/patientScope'
import { PageHeader } from '../../components/layout/PageHeader'
import { DashboardStats } from '../../components/pages/DashboardStats'
import { ResourceListPage } from '../../components/pages/ResourceListPage'
import { EntityDetailPage } from '../../components/pages/EntityDetailPage'
import { DemoSessionNotice } from '../../components/feedback/DemoSessionNotice'
import { EmptyState } from '../../components/feedback/EmptyState'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { FormField } from '../../components/ui/FormField'
import { TextInput } from '../../components/ui/TextInput'
import { Select } from '../../components/ui/Select'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { DataTable } from '../../components/data-display/DataTable'
import { NotFoundPage } from '../shared/NotFoundPage'

function usePatientContext() {
  const { user } = useAuth()
  const patientId = patientIdFromAuth(user)
  return { user, patientId }
}

export function PatientDashboardPage() {
  const { user, patientId } = usePatientContext()
  const { state } = useMockData()

  const orders = filterForPatient(state.orders, patientId)
  const appointments = filterForPatient(state.appointments, patientId)
  const upcoming = appointments.filter(isUpcomingAppointment)
  const results = filterForPatient(state.testResults, patientId).filter(
    (r) => r.status === 'PUBLISHED',
  )
  const notifications = state.notifications.filter((n) => n.userId === user?.id)
  const unread = notifications.filter((n) => !n.read)

  return (
    <>
      <PageHeader
        title="Patient dashboard"
        description="Your appointments, lab orders, results, and updates (demo portal)."
      />
      <DashboardStats
        stats={[
          { label: 'Upcoming appointments', value: upcoming.length },
          { label: 'Lab orders', value: orders.length },
          { label: 'Published results', value: results.length },
          { label: 'Unread notifications', value: unread.length },
        ]}
      />

      <div className="sl-grid-3" style={{ marginTop: 'var(--sl-space-6)' }}>
        <Card title="Upcoming appointments">
          {upcoming.length ? (
            <DataTable
              columns={[
                { key: 'date', header: 'Date' },
                { key: 'time', header: 'Time' },
                { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              ]}
              rows={upcoming.slice(0, 5)}
            />
          ) : (
            <EmptyState
              title="No upcoming appointments"
              description="Book a sample collection slot when ready."
              action={
                <Link to="/app/patient/appointments/book">
                  <Button variant="primary">Book appointment</Button>
                </Link>
              }
            />
          )}
          <Link to="/app/patient/appointments" style={{ fontSize: 'var(--sl-text-sm)' }}>
            View all appointments →
          </Link>
        </Card>

        <Card title="Recent lab orders">
          {orders.length ? (
            <DataTable
              columns={[
                { key: 'id', header: 'Order' },
                { key: 'createdAt', header: 'Date' },
                { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              ]}
              rows={[...orders].slice(0, 5)}
            />
          ) : (
            <EmptyState title="No lab orders yet" description="Orders placed by clinic staff will appear here." />
          )}
          <Link to="/app/patient/orders" style={{ fontSize: 'var(--sl-text-sm)' }}>
            View all orders →
          </Link>
        </Card>

        <Card title="Latest results & alerts">
          {results.length ? (
            <DataTable
              columns={[
                { key: 'id', header: 'Result' },
                { key: 'publishedAt', header: 'Published' },
              ]}
              rows={results.slice(0, 3)}
            />
          ) : (
            <EmptyState title="No published results" description="Results will appear after laboratory release." />
          )}
          {unread.length ? (
            <p style={{ marginTop: 12, fontSize: 'var(--sl-text-sm)' }}>
              {unread.length} unread notification{unread.length > 1 ? 's' : ''}.{' '}
              <Link to="/app/patient/notifications">Open inbox</Link>
            </p>
          ) : null}
          <Link to="/app/patient/results" style={{ fontSize: 'var(--sl-text-sm)' }}>
            View all results →
          </Link>
        </Card>
      </div>
    </>
  )
}

export function PatientProfilePage() {
  const { user, patientId } = usePatientContext()
  const { findPatient, updatePatient } = useMockData()
  const patient = findPatient(patientId)
  const [notice, setNotice] = useState(null)

  if (!patient) return <NotFoundPage />

  const onSubmit = (e) => {
    e.preventDefault()
    const fd = new FormData(e.target)
    updatePatient(
      patientId,
      {
        fullName: fd.get('fullName'),
        phone: fd.get('phone'),
        email: fd.get('email'),
        dateOfBirth: fd.get('dob'),
        gender: fd.get('gender'),
        address: fd.get('address'),
      },
      user?.email,
    )
    setNotice('Profile updated in this demo session only.')
  }

  return (
    <>
      <PageHeader
        title="My profile"
        description="View and update your personal information."
      />
      <DemoSessionNotice />
      {notice ? <div className="sl-alert sl-alert--info">{notice}</div> : null}
      <Card>
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 12,
            marginBottom: 24,
          }}
        >
          <div>
            <dt style={{ fontSize: 'var(--sl-text-xs)', color: 'var(--sl-text-muted)' }}>MRN</dt>
            <dd style={{ margin: 0 }}>{patient.mrn}</dd>
          </div>
        </dl>
        <form onSubmit={onSubmit}>
          <FormField id="fullName" label="Full name" required>
            <TextInput id="fullName" name="fullName" defaultValue={patient.fullName} required />
          </FormField>
          <FormField id="phone" label="Phone">
            <TextInput id="phone" name="phone" defaultValue={patient.phone} />
          </FormField>
          <FormField id="email" label="Email">
            <TextInput id="email" name="email" type="email" defaultValue={patient.email} />
          </FormField>
          <FormField id="dob" label="Date of birth">
            <TextInput id="dob" name="dob" type="date" defaultValue={patient.dateOfBirth} />
          </FormField>
          <FormField id="gender" label="Gender">
            <Select id="gender" name="gender" defaultValue={patient.gender ?? 'Female'}>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
            </Select>
          </FormField>
          <FormField id="address" label="Address">
            <TextInput id="address" name="address" defaultValue={patient.address} />
          </FormField>
          <Button type="submit" variant="primary">
            Save profile
          </Button>
        </form>
      </Card>
    </>
  )
}

export function PatientAppointmentsPage() {
  const { patientId } = usePatientContext()
  const { state } = useMockData()
  const [view, setView] = useState('all')

  const rows = useMemo(() => {
    const mine = filterForPatient(state.appointments, patientId)
    if (view === 'upcoming') return mine.filter(isUpcomingAppointment)
    if (view === 'past') return mine.filter((a) => !isUpcomingAppointment(a))
    return mine
  }, [state.appointments, patientId, view])

  const list = useListControls(rows, { searchKeys: ['date', 'time', 'status'] })

  return (
    <>
      <PageHeader
        title="My appointments"
        description="Upcoming and past sample collection appointments."
        actions={
          <Link to="/app/patient/appointments/book">
            <Button variant="primary">Book appointment</Button>
          </Link>
        }
      />
      <div className="sl-row" style={{ marginBottom: 'var(--sl-space-4)' }}>
        <label htmlFor="appt-view" className="sl-label">
          Show
        </label>
        <Select id="appt-view" value={view} onChange={(e) => setView(e.target.value)}>
          <option value="all">All appointments</option>
          <option value="upcoming">Upcoming only</option>
          <option value="past">Past only</option>
        </Select>
      </div>
      <ResourceListPage
        title="Appointment list"
        description="Search by date, time, or status."
        columns={[
          { key: 'date', header: 'Date' },
          { key: 'time', header: 'Time' },
          {
            key: 'status',
            header: 'Status',
            render: (r) => <StatusBadge status={r.status} />,
          },
          {
            key: 'checkedIn',
            header: 'Check-in',
            render: (r) => (r.checkedIn ? 'Checked in' : '—'),
          },
        ]}
        rows={list.rows}
        toolbar={{
          search: list.search,
          onSearchChange: (v) => {
            list.setSearch(v)
            list.resetPage()
          },
          placeholder: 'Search by date or status',
        }}
        pagination={{
          page: list.page,
          totalPages: list.totalPages,
          onPageChange: list.setPage,
        }}
      />
    </>
  )
}

export function PatientBookAppointmentPage() {
  const { user, patientId } = usePatientContext()
  const { state, bookAppointment } = useMockData()
  const navigate = useNavigate()
  const [slotId, setSlotId] = useState('')
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const openSlots = state.appointmentSlots.filter((s) => s.booked < s.capacity)

  const onSubmit = (e) => {
    e.preventDefault()
    setError(null)
    const result = bookAppointment({ patientId, slotId, actor: user?.email })
    if (!result.ok) {
      setError(result.message)
      return
    }
    setMessage('Booking request recorded in this demo session.')
    setTimeout(() => navigate('/app/patient/appointments'), 800)
  }

  return (
    <>
      <PageHeader
        title="Book appointment"
        description="Choose an available date and time for sample collection."
        actions={
          <Link to="/app/patient/appointments">
            <Button variant="secondary">Back to appointments</Button>
          </Link>
        }
      />
      <DemoSessionNotice message="Booking requests are simulated for UI preview — not sent to a real scheduling system." />
      {error ? <div className="sl-form-error-summary">{error}</div> : null}
      {message ? <div className="sl-alert sl-alert--info">{message}</div> : null}
      <Card>
        {openSlots.length ? (
          <form onSubmit={onSubmit}>
            <FormField id="slot" label="Available slot" required>
              <Select id="slot" value={slotId} onChange={(e) => setSlotId(e.target.value)} required>
                <option value="">Select date and time…</option>
                {openSlots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.date} · {s.startTime}–{s.endTime} ({s.capacity - s.booked} seats left)
                  </option>
                ))}
              </Select>
            </FormField>
            <Button type="submit" variant="primary">
              Submit booking request
            </Button>
          </form>
        ) : (
          <EmptyState
            title="No slots available"
            description="Try again later or contact the laboratory reception (demo)."
          />
        )}
      </Card>
    </>
  )
}

export function PatientOrdersPage() {
  const { patientId } = usePatientContext()
  const { state } = useMockData()
  const list = useListControls(filterForPatient(state.orders, patientId), {
    searchKeys: ['id', 'status', 'createdAt'],
    pageSize: 8,
  })

  return (
    <ResourceListPage
      title="My lab orders"
      description="Track order dates, status, and totals for your tests."
      columns={[
        { key: 'id', header: 'Order ID' },
        { key: 'createdAt', header: 'Order date' },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        { key: 'totalAmount', header: 'Total', render: (r) => `$${r.totalAmount}` },
      ]}
      rows={list.rows}
      onRowTo={(row) => `/app/patient/orders/${row.id}`}
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
        placeholder: 'Search orders',
      }}
      pagination={{ page: list.page, totalPages: list.totalPages, onPageChange: list.setPage }}
    />
  )
}

export function PatientOrderDetailPage() {
  const { id } = useParams()
  const { patientId } = usePatientContext()
  const { findOrder, state } = useMockData()
  const order = findOrder(id)
  if (!order || order.patientId !== patientId) return <NotFoundPage />
  const items = state.orderItems.filter((i) => i.orderId === order.id)

  return (
    <EntityDetailPage
      title={`Lab order ${order.id}`}
      description={`Placed on ${order.createdAt}`}
      backTo="/app/patient/orders"
      fields={[
        { label: 'Status', value: order.status },
        { label: 'Order date', value: order.createdAt },
        { label: 'Total amount', value: `$${order.totalAmount}` },
      ]}
    >
      <h3>Tests on this order</h3>
      {items.length ? (
        <DataTable
          columns={[
            { key: 'testCode', header: 'Code' },
            { key: 'testName', header: 'Test name' },
            { key: 'price', header: 'Price', render: (r) => `$${r.price}` },
          ]}
          rows={items}
        />
      ) : (
        <EmptyState title="No line items" description="Order items will appear when added in the demo workflow." />
      )}
    </EntityDetailPage>
  )
}

export function PatientResultsPage() {
  const { patientId } = usePatientContext()
  const { state } = useMockData()
  const published = filterForPatient(state.testResults, patientId).filter(
    (r) => r.status === 'PUBLISHED',
  )

  const list = useListControls(published, { searchKeys: ['id', 'orderId'] })

  const rowsWithSummary = list.rows.map((r) => {
    const valueCount = state.resultValues.filter((v) => v.resultId === r.id).length
    return { ...r, parameterCount: valueCount }
  })

  return (
    <ResourceListPage
      title="My results"
      description="Published laboratory results with reference ranges on the detail view."
      columns={[
        { key: 'id', header: 'Result ID' },
        { key: 'orderId', header: 'Lab order' },
        { key: 'publishedAt', header: 'Released' },
        { key: 'parameterCount', header: 'Parameters' },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      ]}
      rows={rowsWithSummary}
      onRowTo={(row) => `/app/patient/results/${row.id}`}
      toolbar={{
        search: list.search,
        onSearchChange: (v) => {
          list.setSearch(v)
          list.resetPage()
        },
        placeholder: 'Search by result or order ID',
      }}
      pagination={{ page: list.page, totalPages: list.totalPages, onPageChange: list.setPage }}
    />
  )
}

export function PatientResultDetailPage() {
  const { id } = useParams()
  const { patientId } = usePatientContext()
  const { findResult, state } = useMockData()
  const result = findResult(id)
  if (!result || result.patientId !== patientId) return <NotFoundPage />
  if (result.status !== 'PUBLISHED') {
    return (
      <>
        <PageHeader title="Result not available" description="This result is not published yet." />
        <EmptyState
          title="Pending release"
          description="Your care team will notify you when results are ready (demo)."
          action={
            <Link to="/app/patient/results">
              <Button variant="secondary">Back to results</Button>
            </Link>
          }
        />
      </>
    )
  }

  const values = state.resultValues.filter((v) => v.resultId === result.id)

  return (
    <EntityDetailPage
      title="Result details"
      description={`Result ${result.id} · Order ${result.orderId}`}
      backTo="/app/patient/results"
      className="sl-result-published"
      fields={[
        { label: 'Patient', value: result.patientName },
        { label: 'Published on', value: result.publishedAt ?? '—' },
        { label: 'Status', value: result.status },
      ]}
    >
      <h3>Measured values</h3>
      {values.length ? (
        <DataTable
          columns={[
            { key: 'parameterCode', header: 'Analyte' },
            { key: 'value', header: 'Your value' },
            { key: 'unit', header: 'Unit' },
            {
              key: 'range',
              header: 'Reference range',
              render: (r) => `${r.refMin} – ${r.refMax} ${r.unit}`,
            },
            { key: 'flag', header: 'Flag', render: (r) => <StatusBadge status={r.flag} /> },
          ]}
          rows={values}
        />
      ) : (
        <EmptyState title="No result values" description="Values are not available in the demo dataset." />
      )}
    </EntityDetailPage>
  )
}

export function PatientPaymentsPage() {
  const { patientId } = usePatientContext()
  const { state } = useMockData()
  const list = useListControls(filterForPatient(state.payments, patientId), {
    searchKeys: ['orderId', 'id', 'status'],
  })

  return (
    <ResourceListPage
      title="Payments"
      description="Payment history and status for your laboratory orders."
      columns={[
        { key: 'orderId', header: 'Lab order' },
        { key: 'amount', header: 'Amount', render: (r) => `$${r.amount}` },
        { key: 'method', header: 'Method' },
        { key: 'recordedAt', header: 'Date' },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      ]}
      rows={list.rows}
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
        statusOptions: ['PENDING', 'PAID', 'REFUNDED', 'PARTIAL_REFUND'],
        placeholder: 'Search payments',
      }}
      pagination={{ page: list.page, totalPages: list.totalPages, onPageChange: list.setPage }}
    />
  )
}

export function PatientNotificationsPage() {
  const { user } = usePatientContext()
  const { state, markNotificationRead, markAllNotificationsRead } = useMockData()
  const rows = state.notifications.filter((n) => n.userId === user?.id)
  const list = useListControls(rows, { searchKeys: ['title', 'body'] })

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Appointment reminders, result updates, and other messages."
        actions={
          <Button variant="secondary" onClick={() => markAllNotificationsRead(user?.id)}>
            Mark all read
          </Button>
        }
      />
      <ResourceListPage
        title="Inbox"
        columns={[
          { key: 'title', header: 'Subject' },
          { key: 'body', header: 'Message' },
          {
            key: 'createdAt',
            header: 'Received',
            render: (r) => new Date(r.createdAt).toLocaleString(),
          },
          { key: 'read', header: 'Read', render: (r) => (r.read ? 'Yes' : 'No') },
          {
            key: 'actions',
            header: '',
            render: (r) =>
              !r.read ? (
                <Button size="sm" variant="ghost" onClick={() => markNotificationRead(r.id)}>
                  Mark read
                </Button>
              ) : null,
          },
        ]}
        rows={list.rows}
        toolbar={{
          search: list.search,
          onSearchChange: list.setSearch,
          placeholder: 'Search notifications',
        }}
        pagination={{ page: list.page, totalPages: list.totalPages, onPageChange: list.setPage }}
      />
    </>
  )
}
