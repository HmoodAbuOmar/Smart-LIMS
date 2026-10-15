import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth/AuthContext'
import { useMockData } from '../../mock-data/MockDataProvider'
import { useListControls } from '../../hooks/useListControls'
import { validatePatientForm, todayIsoDate } from '../../features/reception/validation'
import { PageHeader } from '../../components/layout/PageHeader'
import { DashboardStats } from '../../components/pages/DashboardStats'
import { ResourceListPage } from '../../components/pages/ResourceListPage'
import { EntityDetailPage } from '../../components/pages/EntityDetailPage'
import { DemoSessionNotice } from '../../components/feedback/DemoSessionNotice'
import { EmptyState } from '../../components/feedback/EmptyState'
import { ConfirmDialog } from '../../components/layout/ConfirmDialog'
import { Modal } from '../../components/ui/Modal'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { FormField } from '../../components/ui/FormField'
import { TextInput } from '../../components/ui/TextInput'
import { Select } from '../../components/ui/Select'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { DataTable } from '../../components/data-display/DataTable'
import { NotFoundPage } from '../shared/NotFoundPage'

function sortedOrders(orders) {
  return [...orders].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
}

export function ReceptionDashboardPage() {
  const { state } = useMockData()
  const today = todayIsoDate()
  const todayAppts = state.appointments.filter((a) => a.date === today && a.status !== 'CANCELLED')
  const recentOrders = sortedOrders(state.orders).slice(0, 5)
  const pendingPayments = state.payments.filter((p) => p.status === 'PENDING')

  return (
    <>
      <PageHeader
        title="Reception dashboard"
        description="Front desk overview — demo data for today's workflow."
      />
      <DashboardStats
        stats={[
          { label: 'Registered patients', value: state.patients.length },
          { label: "Today's appointments", value: todayAppts.length },
          { label: 'Pending orders', value: state.orders.filter((o) => o.status === 'PENDING').length },
          { label: 'Pending payments', value: pendingPayments.length },
        ]}
      />

      <div className="sl-row" style={{ margin: 'var(--sl-space-6) 0' }}>
        <Link to="/app/reception/patients/new">
          <Button variant="primary">Register patient</Button>
        </Link>
        <Link to="/app/reception/orders/new">
          <Button variant="secondary">Create order</Button>
        </Link>
        <Link to="/app/reception/appointments">
          <Button variant="secondary">Manage appointments</Button>
        </Link>
        <Link to="/app/reception/check-in">
          <Button variant="secondary">Check-in</Button>
        </Link>
      </div>

      <div className="sl-grid-3">
        <Card title={`Today's appointments (${today})`}>
          {todayAppts.length ? (
            <DataTable
              columns={[
                { key: 'patientName', header: 'Patient' },
                { key: 'time', header: 'Time' },
                { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              ]}
              rows={todayAppts}
            />
          ) : (
            <EmptyState title="No appointments today" description="Schedule visits from the appointments page." />
          )}
        </Card>

        <Card title="Recent orders">
          {recentOrders.length ? (
            <DataTable
              columns={[
                { key: 'id', header: 'Order' },
                { key: 'patientName', header: 'Patient' },
                { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              ]}
              rows={recentOrders}
            />
          ) : (
            <EmptyState title="No orders yet" />
          )}
          <Link to="/app/reception/orders">View all orders →</Link>
        </Card>

        <Card title="Payment follow-up">
          {pendingPayments.length ? (
            <DataTable
              columns={[
                { key: 'orderId', header: 'Order' },
                { key: 'amount', header: 'Amount', render: (r) => `$${r.amount}` },
              ]}
              rows={pendingPayments.slice(0, 5)}
            />
          ) : (
            <EmptyState title="No pending payments" description="Record payments when patients settle orders." />
          )}
          <Link to="/app/reception/payments">Open payments →</Link>
        </Card>
      </div>
    </>
  )
}

export function ReceptionPatientsPage() {
  const { state } = useMockData()
  const list = useListControls(state.patients, { searchKeys: ['fullName', 'mrn', 'phone', 'email'] })

  return (
    <ResourceListPage
      title="Patients"
      description="Search, filter, and open patient records."
      createTo="/app/reception/patients/new"
      createLabel="Register patient"
      columns={[
        { key: 'mrn', header: 'MRN' },
        { key: 'fullName', header: 'Name' },
        { key: 'phone', header: 'Phone' },
        { key: 'email', header: 'Email' },
      ]}
      rows={list.rows}
      onRowTo={(row) => `/app/reception/patients/${row.id}`}
      toolbar={{
        search: list.search,
        onSearchChange: (v) => {
          list.setSearch(v)
          list.resetPage()
        },
        placeholder: 'Search by name, MRN, phone, or email',
      }}
      pagination={{ page: list.page, totalPages: list.totalPages, onPageChange: list.setPage }}
    />
  )
}

function PatientForm({ defaultValues, onSubmit, submitLabel }) {
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState(null)

  const handleSubmit = (e) => {
    e.preventDefault()
    setSubmitError(null)
    const fd = new FormData(e.target)
    const payload = {
      fullName: fd.get('fullName'),
      phone: fd.get('phone'),
      email: fd.get('email'),
      dateOfBirth: fd.get('dob'),
      gender: fd.get('gender'),
      address: fd.get('address'),
    }
    const validation = validatePatientForm(payload)
    setErrors(validation)
    if (Object.keys(validation).length) return
    onSubmit(payload, setSubmitError)
  }

  return (
    <Card>
      <DemoSessionNotice />
      {submitError ? <div className="sl-form-error-summary">{submitError}</div> : null}
      <form onSubmit={handleSubmit} noValidate>
        <FormField id="fullName" label="Full name" required error={errors.fullName}>
          <TextInput
            id="fullName"
            name="fullName"
            defaultValue={defaultValues?.fullName}
            required
            error={errors.fullName}
          />
        </FormField>
        <FormField id="phone" label="Phone" error={errors.phone}>
          <TextInput id="phone" name="phone" defaultValue={defaultValues?.phone} error={errors.phone} />
        </FormField>
        <FormField id="email" label="Email" error={errors.email}>
          <TextInput
            id="email"
            name="email"
            type="email"
            defaultValue={defaultValues?.email}
            error={errors.email}
          />
        </FormField>
        <FormField id="dob" label="Date of birth">
          <TextInput id="dob" name="dob" type="date" defaultValue={defaultValues?.dateOfBirth} />
        </FormField>
        <FormField id="gender" label="Gender">
          <Select id="gender" name="gender" defaultValue={defaultValues?.gender ?? 'Female'}>
            <option value="Female">Female</option>
            <option value="Male">Male</option>
          </Select>
        </FormField>
        <FormField id="address" label="Address">
          <TextInput id="address" name="address" defaultValue={defaultValues?.address} />
        </FormField>
        <Button type="submit" variant="primary">
          {submitLabel}
        </Button>
      </form>
    </Card>
  )
}

export function ReceptionPatientNewPage() {
  const { addPatient } = useMockData()
  const { user } = useAuth()
  const navigate = useNavigate()

  return (
    <>
      <PageHeader title="Register patient" description="Create a new patient record (demo session)." />
      <PatientForm
        submitLabel="Save patient"
        onSubmit={(payload, setSubmitError) => {
          try {
            const row = addPatient(payload, user?.email)
            navigate(`/app/reception/patients/${row.id}`)
          } catch {
            setSubmitError('Could not save patient in demo mode.')
          }
        }}
      />
    </>
  )
}

export function ReceptionPatientDetailPage() {
  const { id } = useParams()
  const { findPatient } = useMockData()
  const patient = findPatient(id)
  if (!patient) return <NotFoundPage />
  return (
    <EntityDetailPage
      title={patient.fullName}
      description={patient.mrn}
      backTo="/app/reception/patients"
      editTo={`/app/reception/patients/${patient.id}/edit`}
      fields={[
        { label: 'Phone', value: patient.phone },
        { label: 'Email', value: patient.email },
        { label: 'Date of birth', value: patient.dateOfBirth },
        { label: 'Gender', value: patient.gender },
        { label: 'Address', value: patient.address },
      ]}
    />
  )
}

export function ReceptionPatientEditPage() {
  const { id } = useParams()
  const { findPatient, updatePatient } = useMockData()
  const { user } = useAuth()
  const navigate = useNavigate()
  const patient = findPatient(id)
  if (!patient) return <NotFoundPage />

  return (
    <>
      <PageHeader title="Edit patient" description={patient.mrn} />
      <PatientForm
        defaultValues={patient}
        submitLabel="Save changes"
        onSubmit={(payload, setSubmitError) => {
          updatePatient(id, payload, user?.email)
          setSubmitError(null)
          navigate(`/app/reception/patients/${id}`)
        }}
      />
    </>
  )
}

export function ReceptionOrderNewPage() {
  const { state, createOrder } = useMockData()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [patientId, setPatientId] = useState('')
  const [selectedTests, setSelectedTests] = useState([])
  const [error, setError] = useState(null)

  const total = useMemo(
    () =>
      state.labTests
        .filter((t) => selectedTests.includes(t.id))
        .reduce((sum, t) => sum + t.price, 0),
    [state.labTests, selectedTests],
  )

  const toggleTest = (testId) => {
    setSelectedTests((prev) =>
      prev.includes(testId) ? prev.filter((id) => id !== testId) : [...prev, testId],
    )
  }

  const onSubmit = (e) => {
    e.preventDefault()
    setError(null)
    if (!patientId) {
      setError('Select a patient.')
      return
    }
    if (!selectedTests.length) {
      setError('Select at least one laboratory test.')
      return
    }
    const order = createOrder({
      patientId,
      testIds: selectedTests,
      createdBy: user?.email,
    })
    navigate(`/app/reception/orders/${order.id}`)
  }

  return (
    <>
      <PageHeader
        title="Create order"
        description="Select patient and tests — total calculated on the client (demo)."
        actions={
          <Link to="/app/reception/orders">
            <Button variant="secondary">Back to orders</Button>
          </Link>
        }
      />
      <DemoSessionNotice message="Orders are stored in this browser demo session only — not sent to a server." />
      {error ? <div className="sl-form-error-summary">{error}</div> : null}
      <Card>
        <form onSubmit={onSubmit}>
          <FormField id="patientId" label="Patient" required>
            <Select id="patientId" value={patientId} onChange={(e) => setPatientId(e.target.value)} required>
              <option value="">Select patient…</option>
              {state.patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName} ({p.mrn})
                </option>
              ))}
            </Select>
          </FormField>

          <fieldset style={{ border: 'none', padding: 0, margin: '0 0 16px' }}>
            <legend className="sl-label">Laboratory tests</legend>
            {state.labTests.map((t) => (
              <label key={t.id} className="sl-row" style={{ marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={selectedTests.includes(t.id)}
                  onChange={() => toggleTest(t.id)}
                />
                <span>
                  {t.code} — {t.name} (${t.price})
                </span>
              </label>
            ))}
          </fieldset>

          <p style={{ fontWeight: 700, color: 'var(--sl-primary-600)' }}>
            Mock total: ${total.toFixed(2)}
          </p>
          <Button type="submit" variant="primary" disabled={!patientId || !selectedTests.length}>
            Create order
          </Button>
        </form>
      </Card>
    </>
  )
}

export function ReceptionOrdersPage() {
  const { state } = useMockData()
  const orders = sortedOrders(state.orders)
  const list = useListControls(orders, { searchKeys: ['id', 'patientName', 'createdAt'], pageSize: 10 })

  return (
    <ResourceListPage
      title="Orders"
      description="All laboratory orders with search and status filters."
      createTo="/app/reception/orders/new"
      createLabel="Create order"
      columns={[
        { key: 'id', header: 'Order ID' },
        { key: 'patientName', header: 'Patient' },
        { key: 'createdAt', header: 'Date' },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        { key: 'totalAmount', header: 'Total', render: (r) => `$${r.totalAmount}` },
      ]}
      rows={list.rows}
      onRowTo={(row) => `/app/reception/orders/${row.id}`}
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

export function ReceptionOrderDetailPage() {
  const { id } = useParams()
  const { findOrder, state, updateOrderStatus } = useMockData()
  const { user } = useAuth()
  const order = findOrder(id)
  if (!order) return <NotFoundPage />
  const items = state.orderItems.filter((i) => i.orderId === order.id)
  const payment = state.payments.find((p) => p.orderId === order.id)

  return (
    <EntityDetailPage
      title={`Order ${order.id}`}
      description={order.patientName}
      backTo="/app/reception/orders"
      fields={[
        { label: 'Order date', value: order.createdAt },
        { label: 'Status', value: order.status },
        { label: 'Total', value: `$${order.totalAmount}` },
        { label: 'Payment', value: payment ? `${payment.status} ($${payment.amount})` : 'Not recorded' },
      ]}
    >
      <div className="sl-row" style={{ marginBottom: 12 }}>
        {order.status === 'PENDING' ? (
          <Button variant="secondary" onClick={() => updateOrderStatus(order.id, 'COMPLETED', user?.email)}>
            Mark completed
          </Button>
        ) : null}
        <Link to="/app/reception/payments">
          <Button variant="ghost">Record payment</Button>
        </Link>
      </div>
      <h3>Order items</h3>
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

export function ReceptionOrderItemsPage() {
  const { id } = useParams()
  const { findOrder, state } = useMockData()
  const order = findOrder(id)
  if (!order) return <NotFoundPage />
  const items = state.orderItems.filter((i) => i.orderId === order.id)
  return (
    <EntityDetailPage title="Order items" description={order.id} backTo={`/app/reception/orders/${order.id}`}>
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
  const { state, bookAppointment, cancelAppointment, rescheduleAppointment } = useMockData()
  const { user } = useAuth()
  const [patientId, setPatientId] = useState('')
  const [slotId, setSlotId] = useState('')
  const [formMessage, setFormMessage] = useState(null)
  const [formError, setFormError] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [rescheduleTarget, setRescheduleTarget] = useState(null)
  const [newSlotId, setNewSlotId] = useState('')
  const [viewDate, setViewDate] = useState('')

  const openSlots = state.appointmentSlots.filter((s) => s.booked < s.capacity)

  const filteredAppointments = useMemo(() => {
    let rows = [...state.appointments]
    if (viewDate) rows = rows.filter((a) => a.date === viewDate)
    return rows.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
  }, [state.appointments, viewDate])

  const list = useListControls(filteredAppointments, { searchKeys: ['patientName', 'date', 'status'] })

  const groupedByDate = useMemo(() => {
    const map = new Map()
    for (const appt of filteredAppointments) {
      if (!map.has(appt.date)) map.set(appt.date, [])
      map.get(appt.date).push(appt)
    }
    return [...map.entries()]
  }, [filteredAppointments])

  const onCreate = (e) => {
    e.preventDefault()
    setFormError(null)
    setFormMessage(null)
    const result = bookAppointment({ patientId, slotId, actor: user?.email })
    if (!result.ok) {
      setFormError(result.message)
      return
    }
    setFormMessage('Appointment created in demo session.')
    setPatientId('')
    setSlotId('')
  }

  return (
    <>
      <PageHeader title="Appointments" description="Schedule, reschedule, or cancel visits (demo)." />
      <DemoSessionNotice message="Appointment changes apply to mock session state only." />

      <Card title="Create appointment">
        <form onSubmit={onCreate}>
          <FormField id="patientId" label="Patient" required>
            <Select id="patientId" value={patientId} onChange={(e) => setPatientId(e.target.value)} required>
              <option value="">Select patient…</option>
              {state.patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="slotId" label="Available slot" required>
            <Select id="slotId" value={slotId} onChange={(e) => setSlotId(e.target.value)} required>
              <option value="">Select slot…</option>
              {openSlots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.date} {s.startTime}–{s.endTime} ({s.capacity - s.booked} left)
                </option>
              ))}
            </Select>
          </FormField>
          <Button type="submit" variant="primary">
            Create appointment
          </Button>
        </form>
        {formError ? <div className="sl-form-error-summary">{formError}</div> : null}
        {formMessage ? <div className="sl-alert sl-alert--info">{formMessage}</div> : null}
      </Card>

      <div className="sl-row" style={{ margin: 'var(--sl-space-4) 0' }}>
        <FormField id="viewDate" label="Calendar filter (by date)">
          <TextInput id="viewDate" type="date" value={viewDate} onChange={(e) => setViewDate(e.target.value)} />
        </FormField>
        {viewDate ? (
          <Button variant="ghost" onClick={() => setViewDate('')}>
            Clear date filter
          </Button>
        ) : null}
      </div>

      {viewDate && groupedByDate.length ? (
        groupedByDate.map(([date, appts]) => (
          <Card key={date} title={date} className="sl-feature-card">
            <DataTable
              columns={[
                { key: 'patientName', header: 'Patient' },
                { key: 'time', header: 'Time' },
                { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              ]}
              rows={appts}
            />
          </Card>
        ))
      ) : null}

      <ResourceListPage
        title="All appointments"
        columns={[
          { key: 'patientName', header: 'Patient' },
          { key: 'date', header: 'Date' },
          { key: 'time', header: 'Time' },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          {
            key: 'actions',
            header: 'Actions',
            render: (r) =>
              r.status === 'CANCELLED' ? (
                '—'
              ) : (
                <div className="sl-row">
                  <Button size="sm" variant="ghost" onClick={() => setRescheduleTarget(r)}>
                    Reschedule
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setCancelTarget(r)}>
                    Cancel
                  </Button>
                </div>
              ),
          },
        ]}
        rows={list.rows}
        toolbar={{
          search: list.search,
          onSearchChange: list.setSearch,
          status: list.status,
          onStatusChange: list.setStatus,
          statusOptions: ['SCHEDULED', 'CHECKED_IN', 'CANCELLED'],
        }}
        pagination={{ page: list.page, totalPages: list.totalPages, onPageChange: list.setPage }}
      />

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancel appointment"
        message={`Cancel appointment for ${cancelTarget?.patientName} on ${cancelTarget?.date} at ${cancelTarget?.time}? This demo action updates session state only.`}
        danger
        confirmLabel="Cancel appointment"
        onCancel={() => setCancelTarget(null)}
        onConfirm={() => {
          cancelAppointment(cancelTarget.id, user?.email)
          setCancelTarget(null)
        }}
      />

      <Modal
        open={Boolean(rescheduleTarget)}
        title="Reschedule appointment"
        onClose={() => {
          setRescheduleTarget(null)
          setNewSlotId('')
        }}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRescheduleTarget(null)}>
              Close
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const result = rescheduleAppointment(rescheduleTarget.id, newSlotId, user?.email)
                if (!result.ok) {
                  setFormError(result.message)
                  return
                }
                setRescheduleTarget(null)
                setNewSlotId('')
                setFormMessage('Appointment rescheduled (demo).')
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <p>
          {rescheduleTarget?.patientName} — current slot {rescheduleTarget?.date} {rescheduleTarget?.time}
        </p>
        <FormField id="newSlot" label="New slot">
          <Select id="newSlot" value={newSlotId} onChange={(e) => setNewSlotId(e.target.value)}>
            <option value="">Select…</option>
            {openSlots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.date} {s.startTime} ({s.capacity - s.booked} left)
              </option>
            ))}
          </Select>
        </FormField>
      </Modal>
    </>
  )
}

export function ReceptionCheckInPage() {
  const { state, checkInAppointment, findPatient } = useMockData()
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    return state.appointments.filter((a) => {
      if (a.status === 'CANCELLED') return false
      if (!q) return !a.checkedIn
      const patient = findPatient(a.patientId)
      return (
        !a.checkedIn &&
        (a.patientName?.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q) ||
          patient?.mrn?.toLowerCase().includes(q))
      )
    })
  }, [state.appointments, query, findPatient])

  const selected = state.appointments.find((a) => a.id === selectedId)

  const onCheckIn = () => {
    setError(null)
    setMessage(null)
    const result = checkInAppointment(selectedId, user?.email)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setMessage('Patient checked in (demo session).')
  }

  return (
    <>
      <PageHeader title="Check-in" description="Find today's appointment and mark arrival." />
      <DemoSessionNotice />
      <Card>
        <FormField id="search" label="Search patient, MRN, or appointment ID">
          <TextInput id="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Start typing…" />
        </FormField>
        <FormField id="appointment" label="Appointment">
          <Select id="appointment" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">Select appointment…</option>
            {candidates.map((a) => (
              <option key={a.id} value={a.id}>
                {a.date} {a.time} — {a.patientName} ({a.status})
              </option>
            ))}
          </Select>
        </FormField>
        {selected ? (
          <dl style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
            <div>
              <dt style={{ color: 'var(--sl-text-muted)', fontSize: 'var(--sl-text-xs)' }}>Patient</dt>
              <dd style={{ margin: 0 }}>{selected.patientName}</dd>
            </div>
            <div>
              <dt style={{ color: 'var(--sl-text-muted)', fontSize: 'var(--sl-text-xs)' }}>Schedule</dt>
              <dd style={{ margin: 0 }}>
                {selected.date} at {selected.time}
              </dd>
            </div>
            <div>
              <dt style={{ color: 'var(--sl-text-muted)', fontSize: 'var(--sl-text-xs)' }}>Status</dt>
              <dd style={{ margin: 0 }}>
                <StatusBadge status={selected.status} />
              </dd>
            </div>
          </dl>
        ) : (
          <EmptyState title="Select an appointment" description="Search then choose a row to check in." />
        )}
        <Button variant="primary" disabled={!selectedId} onClick={onCheckIn}>
          Mark checked in
        </Button>
        {error ? <div className="sl-form-error-summary">{error}</div> : null}
        {message ? <div className="sl-alert sl-alert--info">{message}</div> : null}
      </Card>
    </>
  )
}

export function ReceptionPaymentsPage() {
  const { state, recordPayment, findOrder } = useMockData()
  const { user } = useAuth()
  const [orderId, setOrderId] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('CASH')
  const [notice, setNotice] = useState(null)
  const [error, setError] = useState(null)

  const order = findOrder(orderId)
  const pendingOrders = state.orders.filter(
    (o) => !state.payments.some((p) => p.orderId === o.id && p.status === 'PAID'),
  )

  const onRecord = (e) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    const result = recordPayment({ orderId, amount, method, actor: user?.email })
    if (!result.ok) {
      setError(result.message)
      return
    }
    setNotice(`Payment recorded in demo session (ID ${result.payment.id}).`)
    setAmount('')
  }

  const fillOrderTotal = () => {
    if (order) setAmount(String(order.totalAmount))
  }

  const list = useListControls(state.payments, { searchKeys: ['orderId', 'id', 'status'] })

  return (
    <>
      <PageHeader title="Payments" description="Record mock payments — no payment gateway." />
      <DemoSessionNotice message="Payments are simulated in the frontend session only." />
      <Card title="Record payment">
        <form onSubmit={onRecord}>
          <FormField id="orderId" label="Order" required>
            <Select id="orderId" value={orderId} onChange={(e) => setOrderId(e.target.value)} required>
              <option value="">Select order…</option>
              {pendingOrders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.id} — {o.patientName} (${o.totalAmount})
                </option>
              ))}
            </Select>
          </FormField>
          {order ? (
            <p style={{ fontSize: 'var(--sl-text-sm)', color: 'var(--sl-text-muted)' }}>
              Order total: ${order.totalAmount}.{' '}
              <button type="button" className="sl-btn sl-btn--ghost sl-btn--sm" onClick={fillOrderTotal}>
                Use order total
              </button>
            </p>
          ) : null}
          <FormField id="amount" label="Amount" required>
            <TextInput id="amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </FormField>
          <FormField id="method" label="Payment method">
            <Select id="method" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="INSURANCE">Insurance</option>
            </Select>
          </FormField>
          <Button type="submit" variant="primary">
            Record payment
          </Button>
        </form>
        {error ? <div className="sl-form-error-summary">{error}</div> : null}
        {notice ? <div className="sl-alert sl-alert--info">{notice}</div> : null}
      </Card>
      <ResourceListPage
        title="Payment history"
        columns={[
          { key: 'orderId', header: 'Order' },
          { key: 'amount', header: 'Amount', render: (r) => `$${r.amount}` },
          { key: 'method', header: 'Method' },
          { key: 'recordedAt', header: 'Date' },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ]}
        rows={list.rows}
        toolbar={{ search: list.search, onSearchChange: list.setSearch }}
        pagination={{ page: list.page, totalPages: list.totalPages, onPageChange: list.setPage }}
      />
    </>
  )
}

export function ReceptionRefundsPage() {
  const { state, refundPayment, findPayment } = useMockData()
  const { user } = useAuth()
  const [paymentId, setPaymentId] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState(null)
  const [error, setError] = useState(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const eligible = state.payments.filter((p) => {
    const remaining = p.amount - (p.refundedAmount ?? 0)
    return remaining > 0 && (p.status === 'PAID' || p.status === 'PARTIAL_REFUND')
  })

  const selected = findPayment(paymentId)
  const remaining = selected ? selected.amount - (selected.refundedAmount ?? 0) : 0

  const submitRefund = () => {
    setError(null)
    const result = refundPayment(paymentId, Number(amount), reason, user?.email)
    if (!result.ok) {
      setError(result.message)
      setConfirmOpen(false)
      return
    }
    setNotice('Refund simulated in demo session — not processed by a payment provider.')
    setConfirmOpen(false)
    setAmount('')
    setReason('')
  }

  return (
    <>
      <PageHeader title="Refunds" description="Simulate refunds against recorded demo payments." />
      <DemoSessionNotice message="Refunds update mock payment status only." />
      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setError(null)
            if (!paymentId || !amount || !reason.trim()) {
              setError('Complete all fields before confirming refund.')
              return
            }
            setConfirmOpen(true)
          }}
        >
          <FormField id="paymentId" label="Eligible payment" required>
            <Select id="paymentId" value={paymentId} onChange={(e) => setPaymentId(e.target.value)} required>
              <option value="">Select payment…</option>
              {eligible.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} — order {p.orderId} (${p.amount - (p.refundedAmount ?? 0)} remaining)
                </option>
              ))}
            </Select>
          </FormField>
          {selected ? (
            <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <dt style={{ fontSize: 'var(--sl-text-xs)', color: 'var(--sl-text-muted)' }}>Original amount</dt>
                <dd style={{ margin: 0 }}>${selected.amount}</dd>
              </div>
              <div>
                <dt style={{ fontSize: 'var(--sl-text-xs)', color: 'var(--sl-text-muted)' }}>Refundable</dt>
                <dd style={{ margin: 0 }}>${remaining}</dd>
              </div>
              <div>
                <dt style={{ fontSize: 'var(--sl-text-xs)', color: 'var(--sl-text-muted)' }}>Method</dt>
                <dd style={{ margin: 0 }}>{selected.method}</dd>
              </div>
              <div>
                <dt style={{ fontSize: 'var(--sl-text-xs)', color: 'var(--sl-text-muted)' }}>Status</dt>
                <dd style={{ margin: 0 }}>{selected.status}</dd>
              </div>
            </dl>
          ) : null}
          <FormField id="amount" label="Refund amount" required>
            <TextInput id="amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </FormField>
          <FormField id="reason" label="Reason" required>
            <TextInput id="reason" value={reason} onChange={(e) => setReason(e.target.value)} required />
          </FormField>
          <Button type="submit" variant="danger">
            Review refund
          </Button>
        </form>
        {error ? <div className="sl-form-error-summary">{error}</div> : null}
        {notice ? <div className="sl-alert sl-alert--info">{notice}</div> : null}
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm refund"
        message={`Refund $${amount} for payment ${paymentId}? Reason: ${reason}. Demo only — no real money movement.`}
        danger
        confirmLabel="Confirm refund"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={submitRefund}
      />
    </>
  )
}
