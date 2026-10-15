import { createContext, useCallback, useContext, useMemo, useReducer } from 'react'
import { createInitialDemoState } from './initialData'
import { nextId } from '../utils/id'
import { computeFlag } from '../utils/listControls'
import { validateDraftValues } from '../features/lab/validation'

function referenceRangeForParameter(state, parameterId) {
  return state.referenceRanges.find((r) => r.parameterId === parameterId) ?? null
}

function buildResultValuesForTest(state, resultId, testId) {
  const params = state.testParameters.filter((p) => p.testId === testId)
  return params.map((p) => {
    const rr = referenceRangeForParameter(state, p.id)
    return {
      id: nextId('rv'),
      resultId,
      parameterId: p.id,
      parameterCode: p.code,
      value: '',
      unit: p.unit,
      flag: 'PENDING',
      refMin: rr?.min ?? 0,
      refMax: rr?.max ?? 999,
      valueType: p.valueType ?? 'numeric',
    }
  })
}

/** Bump when demo schema changes so browsers load fresh lab workflow data. */
const STORAGE_KEY = 'smart_lims_demo_state_v3'

const MockDataContext = createContext(null)

function loadState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return createInitialDemoState()
}

function persistState(state) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

function reducer(state, action) {
  let next = state
  switch (action.type) {
    case 'RESET':
      next = createInitialDemoState()
      break
    case 'PATCH':
      next = { ...state, ...action.payload }
      break
    default:
      next = state
  }
  persistState(next)
  return next
}

export function MockDataProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState)

  const addAudit = useCallback((entry) => {
    dispatch({
      type: 'PATCH',
      payload: {
        auditLogs: [
          {
            id: nextId('aud'),
            timestamp: new Date().toISOString(),
            ...entry,
          },
          ...state.auditLogs,
        ],
      },
    })
  }, [state.auditLogs])

  const api = useMemo(() => {
    const patch = (partial) => dispatch({ type: 'PATCH', payload: partial })

    return {
      state,
      resetDemo: () => dispatch({ type: 'RESET' }),

      findPatient: (id) => state.patients.find((p) => p.id === id),
      findTest: (id) => state.labTests.find((t) => t.id === id || t.code === id),
      findOrder: (id) => state.orders.find((o) => o.id === id),
      findAppointment: (id) => state.appointments.find((a) => a.id === id),
      findPayment: (id) => state.payments.find((p) => p.id === id),
      findSample: (id) => state.samples.find((s) => s.id === id),
      findSampleTest: (id) => state.sampleTests.find((st) => st.id === id),
      findResult: (id) => state.testResults.find((r) => r.id === id),

      addPatient: (patient, actor) => {
        const row = { id: nextId('pat'), mrn: `MRN-${Math.floor(Math.random() * 9000 + 1000)}`, ...patient }
        patch({ patients: [...state.patients, row] })
        addAudit({ action: 'PATIENT_CREATED', actor, resource: row.fullName })
        return row
      },

      updatePatient: (id, updates, actor) => {
        patch({
          patients: state.patients.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        })
        addAudit({ action: 'PATIENT_UPDATED', actor, resource: id })
      },

      addUser: (user, actor) => {
        const row = { id: nextId('usr'), status: 'ACTIVE', ...user }
        patch({ users: [...state.users, row] })
        addAudit({ action: 'USER_CREATED', actor, resource: row.email })
        return row
      },

      createOrder: ({ patientId, testIds, createdBy }) => {
        const patient = state.patients.find((p) => p.id === patientId)
        const tests = state.labTests.filter((t) => testIds.includes(t.id))
        const orderId = nextId('ord')
        const items = tests.map((t) => ({
          id: nextId('oi'),
          orderId,
          testId: t.id,
          testCode: t.code,
          testName: t.name,
          price: t.price,
        }))
        const totalAmount = items.reduce((sum, i) => sum + i.price, 0)
        const order = {
          id: orderId,
          patientId,
          patientName: patient?.fullName ?? 'Unknown',
          status: 'PENDING',
          createdAt: new Date().toISOString().slice(0, 10),
          totalAmount,
        }
        patch({
          orders: [order, ...state.orders],
          orderItems: [...state.orderItems, ...items],
        })
        addAudit({ action: 'ORDER_CREATED', actor: createdBy, resource: orderId })
        return order
      },

      updateOrderStatus: (orderId, status, actor) => {
        patch({
          orders: state.orders.map((o) => (o.id === orderId ? { ...o, status } : o)),
        })
        addAudit({ action: 'ORDER_STATUS', actor, resource: `${orderId} → ${status}` })
      },

      bookAppointment: ({ patientId, slotId, actor }) => {
        const patient = state.patients.find((p) => p.id === patientId)
        const slot = state.appointmentSlots.find((s) => s.id === slotId)
        if (!slot || slot.booked >= slot.capacity) {
          return { ok: false, message: 'Slot is full (demo validation).' }
        }
        const appt = {
          id: nextId('appt'),
          patientId,
          patientName: patient?.fullName,
          slotId,
          status: 'SCHEDULED',
          date: slot.date,
          time: slot.startTime,
          checkedIn: false,
        }
        patch({
          appointments: [...state.appointments, appt],
          appointmentSlots: state.appointmentSlots.map((s) =>
            s.id === slotId ? { ...s, booked: s.booked + 1 } : s,
          ),
        })
        addAudit({ action: 'APPOINTMENT_BOOKED', actor, resource: appt.id })
        return { ok: true, appointment: appt }
      },

      checkInAppointment: (appointmentId, actor) => {
        const appt = state.appointments.find((a) => a.id === appointmentId)
        if (!appt) return { ok: false, message: 'Appointment not found.' }
        if (appt.checkedIn || appt.status === 'CHECKED_IN') {
          return { ok: false, message: 'Patient is already checked in.' }
        }
        if (appt.status === 'CANCELLED') {
          return { ok: false, message: 'Cannot check in a cancelled appointment.' }
        }
        patch({
          appointments: state.appointments.map((a) =>
            a.id === appointmentId ? { ...a, checkedIn: true, status: 'CHECKED_IN' } : a,
          ),
        })
        addAudit({ action: 'APPOINTMENT_CHECKIN', actor, resource: appointmentId })
        return { ok: true }
      },

      cancelAppointment: (appointmentId, actor) => {
        const appt = state.appointments.find((a) => a.id === appointmentId)
        if (!appt) return { ok: false, message: 'Appointment not found.' }
        if (appt.status === 'CANCELLED') return { ok: false, message: 'Already cancelled.' }
        patch({
          appointments: state.appointments.map((a) =>
            a.id === appointmentId ? { ...a, status: 'CANCELLED', checkedIn: false } : a,
          ),
          appointmentSlots: state.appointmentSlots.map((s) =>
            s.id === appt.slotId ? { ...s, booked: Math.max(0, s.booked - 1) } : s,
          ),
        })
        addAudit({ action: 'APPOINTMENT_CANCELLED', actor, resource: appointmentId })
        return { ok: true }
      },

      rescheduleAppointment: (appointmentId, newSlotId, actor) => {
        const appt = state.appointments.find((a) => a.id === appointmentId)
        const newSlot = state.appointmentSlots.find((s) => s.id === newSlotId)
        if (!appt) return { ok: false, message: 'Appointment not found.' }
        if (appt.status === 'CANCELLED') {
          return { ok: false, message: 'Cannot reschedule a cancelled appointment.' }
        }
        if (!newSlot || newSlot.booked >= newSlot.capacity) {
          return { ok: false, message: 'Selected slot is full.' }
        }
        const oldSlotId = appt.slotId
        patch({
          appointments: state.appointments.map((a) =>
            a.id === appointmentId
              ? {
                  ...a,
                  slotId: newSlotId,
                  date: newSlot.date,
                  time: newSlot.startTime,
                  status: 'SCHEDULED',
                }
              : a,
          ),
          appointmentSlots: state.appointmentSlots.map((s) => {
            if (s.id === oldSlotId) return { ...s, booked: Math.max(0, s.booked - 1) }
            if (s.id === newSlotId) return { ...s, booked: s.booked + 1 }
            return s
          }),
        })
        addAudit({ action: 'APPOINTMENT_RESCHEDULED', actor, resource: appointmentId })
        return { ok: true }
      },

      recordPayment: ({ orderId, amount, method, actor }) => {
        const order = state.orders.find((o) => o.id === orderId)
        if (!order) return { ok: false, message: 'Order not found in demo data.' }
        const numericAmount = Number(amount)
        if (!numericAmount || numericAmount <= 0) {
          return { ok: false, message: 'Enter a valid payment amount.' }
        }
        const payment = {
          id: nextId('pay'),
          orderId,
          patientId: order?.patientId,
          amount: numericAmount,
          method,
          status: 'PAID',
          recordedAt: new Date().toISOString().slice(0, 10),
          refundedAmount: 0,
          refundReason: null,
        }
        patch({ payments: [payment, ...state.payments] })
        addAudit({ action: 'PAYMENT_RECORDED', actor, resource: payment.id })
        return { ok: true, payment }
      },

      refundPayment: (paymentId, amount, reason, actor) => {
        const payment = state.payments.find((p) => p.id === paymentId)
        if (!payment) return { ok: false, message: 'Payment not found.' }
        const numericAmount = Number(amount)
        const alreadyRefunded = payment.refundedAmount ?? 0
        const remaining = payment.amount - alreadyRefunded
        if (!numericAmount || numericAmount <= 0) {
          return { ok: false, message: 'Refund amount must be greater than zero.' }
        }
        if (numericAmount > remaining) {
          return { ok: false, message: `Maximum refundable amount is $${remaining}.` }
        }
        if (!reason?.trim()) {
          return { ok: false, message: 'Refund reason is required.' }
        }
        patch({
          payments: state.payments.map((p) => {
            if (p.id !== paymentId) return p
            const refundedAmount = alreadyRefunded + numericAmount
            return {
              ...p,
              refundedAmount,
              refundReason: reason.trim(),
              status: refundedAmount >= p.amount ? 'REFUNDED' : 'PARTIAL_REFUND',
            }
          }),
        })
        addAudit({ action: 'PAYMENT_REFUND', actor, resource: `${paymentId}: ${reason}` })
        return { ok: true }
      },

      registerSample: ({ orderId, patientId, sampleType, collectionNotes, collectedAt, actor }) => {
        const order = state.orders.find((o) => o.id === orderId)
        const resolvedPatientId = patientId ?? order?.patientId
        if (!orderId || !resolvedPatientId) {
          return { ok: false, message: 'Select a valid order and patient.' }
        }
        const sample = {
          id: nextId('smp'),
          orderId,
          patientId: resolvedPatientId,
          barcode: `SL-${Math.floor(Math.random() * 9000 + 1000)}`,
          sampleType: sampleType?.trim() || 'Whole blood',
          status: 'REGISTERED',
          collectedAt: collectedAt || new Date().toISOString(),
          receivedAt: null,
          acceptedAt: null,
          collectionNotes: collectionNotes?.trim() || '',
          rejectionReason: null,
          replacedBySampleId: null,
        }
        patch({ samples: [sample, ...state.samples] })
        addAudit({ action: 'SAMPLE_REGISTERED', actor, resource: sample.barcode })
        return { ok: true, sample }
      },

      updateSample: (sampleId, updates, actor, auditAction = 'SAMPLE_UPDATED') => {
        patch({
          samples: state.samples.map((s) => (s.id === sampleId ? { ...s, ...updates } : s)),
        })
        addAudit({ action: auditAction, actor, resource: sampleId })
      },

      receiveSample: (sampleId, actor) => {
        const sample = state.samples.find((s) => s.id === sampleId)
        if (!sample) return { ok: false, message: 'Sample not found.' }
        if (sample.status === 'REJECTED') {
          return { ok: false, message: 'Rejected samples cannot be received.' }
        }
        patch({
          samples: state.samples.map((s) =>
            s.id === sampleId
              ? { ...s, status: 'RECEIVED', receivedAt: new Date().toISOString() }
              : s,
          ),
        })
        addAudit({ action: 'SAMPLE_RECEIVED', actor, resource: sampleId })
        return { ok: true }
      },

      acceptSample: (sampleId, actor) => {
        const sample = state.samples.find((s) => s.id === sampleId)
        if (!sample) return { ok: false, message: 'Sample not found.' }
        if (sample.status === 'REJECTED') {
          return { ok: false, message: 'Sample is already rejected.' }
        }
        if (sample.status === 'ACCEPTED') {
          return { ok: false, message: 'Sample is already accepted.' }
        }
        patch({
          samples: state.samples.map((s) =>
            s.id === sampleId
              ? {
                  ...s,
                  status: 'ACCEPTED',
                  acceptedAt: new Date().toISOString(),
                  receivedAt: s.receivedAt ?? new Date().toISOString(),
                }
              : s,
          ),
        })
        addAudit({ action: 'SAMPLE_ACCEPTED', actor, resource: sampleId })
        return { ok: true }
      },

      rejectSample: (sampleId, reason, actor) => {
        if (!reason?.trim()) {
          return { ok: false, message: 'Rejection reason is required.' }
        }
        const sample = state.samples.find((s) => s.id === sampleId)
        if (!sample) return { ok: false, message: 'Sample not found.' }
        if (sample.status === 'REJECTED') {
          return { ok: false, message: 'Sample is already rejected.' }
        }
        patch({
          samples: state.samples.map((s) =>
            s.id === sampleId
              ? { ...s, status: 'REJECTED', rejectionReason: reason.trim() }
              : s,
          ),
          sampleTests: state.sampleTests.map((st) =>
            st.sampleId === sampleId ? { ...st, status: 'CANCELLED' } : st,
          ),
        })
        addAudit({ action: 'SAMPLE_REJECTED', actor, resource: sampleId })
        return { ok: true }
      },

      replaceSample: (sampleId, actor) => {
        const old = state.samples.find((s) => s.id === sampleId)
        if (!old) return null
        const replacement = {
          id: nextId('smp'),
          orderId: old.orderId,
          patientId: old.patientId,
          barcode: `SL-${Math.floor(Math.random() * 9000 + 1000)}`,
          sampleType: old.sampleType ?? 'Whole blood',
          status: 'REGISTERED',
          collectedAt: null,
          receivedAt: null,
          acceptedAt: null,
          collectionNotes: '',
          rejectionReason: null,
          replacedBySampleId: null,
        }
        patch({
          samples: [
            replacement,
            ...state.samples.map((s) =>
              s.id === sampleId
                ? { ...s, status: 'REPLACED', replacedBySampleId: replacement.id }
                : s,
            ),
          ],
        })
        addAudit({ action: 'SAMPLE_REPLACED', actor, resource: sampleId })
        return replacement
      },

      assignSampleTest: (sampleId, testId, priority = 'ROUTINE', actor) => {
        const sample = state.samples.find((s) => s.id === sampleId)
        if (!sample) return { ok: false, message: 'Sample not found.' }
        if (sample.status === 'REJECTED') {
          return { ok: false, message: 'Cannot assign tests to a rejected sample.' }
        }
        const test = state.labTests.find((t) => t.id === testId)
        if (!test) return { ok: false, message: 'Test not found.' }
        const exists = state.sampleTests.some(
          (st) => st.sampleId === sampleId && st.testId === testId && st.status !== 'CANCELLED',
        )
        if (exists) return { ok: false, message: 'This test is already assigned to the sample.' }
        const row = {
          id: nextId('st'),
          sampleId,
          testId,
          testCode: test.code,
          status: 'PENDING',
          priority: priority === 'STAT' ? 'STAT' : 'ROUTINE',
        }
        patch({ sampleTests: [...state.sampleTests, row] })
        addAudit({ action: 'SAMPLE_TEST_ASSIGNED', actor, resource: row.id })
        return { ok: true, sampleTest: row }
      },

      ensureDraftForSampleTest: (sampleTestId, actor) => {
        const st = state.sampleTests.find((x) => x.id === sampleTestId)
        if (!st) return { ok: false, message: 'Sample test not found.' }
        const sample = state.samples.find((s) => s.id === st.sampleId)
        if (!sample || sample.status !== 'ACCEPTED') {
          return { ok: false, message: 'Sample must be accepted before result entry.' }
        }
        const existing = state.testResults.find(
          (r) => r.sampleTestId === sampleTestId && r.status === 'DRAFT',
        )
        if (existing) return { ok: true, result: existing }

        const order = state.orders.find((o) => o.id === sample.orderId)
        const resultId = nextId('res')
        const valueRows = buildResultValuesForTest(state, resultId, st.testId)
        const result = {
          id: resultId,
          orderId: sample.orderId,
          patientId: sample.patientId,
          patientName: order?.patientName ?? 'Unknown',
          sampleTestId,
          status: 'DRAFT',
          publishedAt: null,
          version: 0,
          labNotes: '',
          correctsResultId: null,
          correctionReason: null,
        }
        patch({
          testResults: [result, ...state.testResults],
          resultValues: [...state.resultValues, ...valueRows],
          sampleTests: state.sampleTests.map((x) =>
            x.id === sampleTestId ? { ...x, status: 'IN_PROGRESS' } : x,
          ),
        })
        addAudit({ action: 'RESULT_DRAFT_CREATED', actor, resource: resultId })
        return { ok: true, result }
      },

      updateResultValue: (valueId, value, actor) => {
        patch({
          resultValues: state.resultValues.map((rv) => {
            if (rv.id !== valueId) return rv
            const flag = computeFlag(value, rv.refMin, rv.refMax)
            return { ...rv, value: String(value), flag }
          }),
        })
        addAudit({ action: 'RESULT_VALUE_EDIT', actor, resource: valueId })
      },

      saveDraftResult: (resultId, { valuesById, labNotes }, actor) => {
        const result = state.testResults.find((r) => r.id === resultId)
        if (!result) return { ok: false, message: 'Result not found.' }
        if (result.status === 'PUBLISHED' || result.status === 'CORRECTED') {
          return { ok: false, message: 'Published results are read-only. Use the correction workflow.' }
        }
        const merged = state.resultValues.map((rv) => {
          if (rv.resultId !== resultId) return rv
          const nextVal = valuesById?.[rv.id]
          if (nextVal == null) return rv
          const value = String(nextVal)
          const flag = computeFlag(value, rv.refMin, rv.refMax)
          return { ...rv, value, flag }
        })
        const slice = merged.filter((v) => v.resultId === resultId)
        const check = validateDraftValues(slice)
        if (!check.ok) return check
        patch({
          resultValues: merged,
          testResults: state.testResults.map((r) =>
            r.id === resultId
              ? { ...r, labNotes: labNotes != null ? String(labNotes) : r.labNotes }
              : r,
          ),
        })
        addAudit({ action: 'RESULT_DRAFT_SAVED', actor, resource: resultId })
        return { ok: true }
      },

      publishResult: (resultId, actor) => {
        const result = state.testResults.find((r) => r.id === resultId)
        if (!result) return { ok: false, message: 'Result not found.' }
        if (result.status !== 'DRAFT') {
          return { ok: false, message: 'Only draft results can be published.' }
        }
        const values = state.resultValues.filter((v) => v.resultId === resultId)
        const check = validateDraftValues(values)
        if (!check.ok) return check

        const isCorrection = Boolean(result.correctsResultId)
        const nextStatus = isCorrection ? 'CORRECTED' : 'PUBLISHED'
        const version = (result.version ?? 0) + 1
        const versionRow = {
          id: nextId('ver'),
          resultId,
          version,
          publishedAt: new Date().toISOString(),
          note: isCorrection
            ? `Correction published (${result.correctionReason ?? '—'})`
            : 'Published from draft',
          snapshot: values.map(({ parameterCode, value, unit, flag }) => ({
            parameterCode,
            value,
            unit,
            flag,
          })),
        }
        patch({
          testResults: state.testResults.map((r) =>
            r.id === resultId
              ? {
                  ...r,
                  status: nextStatus,
                  publishedAt: new Date().toISOString().slice(0, 10),
                  version,
                }
              : r,
          ),
          resultVersions: [versionRow, ...state.resultVersions],
          sampleTests: result.sampleTestId
            ? state.sampleTests.map((st) =>
                st.id === result.sampleTestId ? { ...st, status: 'COMPLETED' } : st,
              )
            : state.sampleTests,
          notifications: [
            {
              id: nextId('ntf'),
              userId: 'usr-patient-1',
              title: isCorrection ? 'Corrected result available' : 'Result published',
              body: `Results for order ${result.orderId} are now available (demo only — not a real medical result).`,
              read: false,
              createdAt: new Date().toISOString(),
            },
            ...state.notifications,
          ],
        })
        addAudit({ action: 'RESULT_PUBLISHED', actor, resource: resultId })
        return { ok: true }
      },

      createCorrectionDraft: (originalResultId, reason, actor) => {
        const original = state.testResults.find((r) => r.id === originalResultId)
        if (!original) return { ok: false, message: 'Result not found.' }
        if (original.status !== 'PUBLISHED') {
          return { ok: false, message: 'Only published results can be corrected.' }
        }
        if (!reason?.trim()) {
          return { ok: false, message: 'Correction reason is required.' }
        }
        const pending = state.testResults.find(
          (r) => r.correctsResultId === originalResultId && r.status === 'DRAFT',
        )
        if (pending) {
          return { ok: true, result: pending, message: 'A correction draft already exists.' }
        }

        const newId = nextId('res')
        const copiedValues = state.resultValues
          .filter((v) => v.resultId === originalResultId)
          .map((v) => ({
            ...v,
            id: nextId('rv'),
            resultId: newId,
          }))
        const correction = {
          id: newId,
          orderId: original.orderId,
          patientId: original.patientId,
          patientName: original.patientName,
          sampleTestId: original.sampleTestId,
          status: 'DRAFT',
          publishedAt: null,
          version: 0,
          labNotes: original.labNotes ?? '',
          correctsResultId: originalResultId,
          correctionReason: reason.trim(),
        }
        patch({
          testResults: [correction, ...state.testResults],
          resultValues: [...state.resultValues, ...copiedValues],
        })
        addAudit({ action: 'RESULT_CORRECTION_DRAFT', actor, resource: `${originalResultId} → ${newId}` })
        return { ok: true, result: correction }
      },

      markNotificationRead: (id) => {
        patch({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n,
          ),
        })
      },

      markAllNotificationsRead: (userId) => {
        patch({
          notifications: state.notifications.map((n) =>
            n.userId === userId ? { ...n, read: true } : n,
          ),
        })
      },

      submitAssessment: (patientId, summary, actor) => {
        const asm = {
          id: nextId('asm'),
          patientId,
          summary,
          createdAt: new Date().toISOString().slice(0, 10),
          status: 'COMPLETED',
        }
        const suggestions = [
          {
            id: nextId('sg'),
            assessmentId: asm.id,
            testId: 'tst-cbc',
            testCode: 'CBC',
            testName: 'Complete blood count',
            selected: true,
          },
          {
            id: nextId('sg'),
            assessmentId: asm.id,
            testId: 'tst-lipid',
            testCode: 'LIPID',
            testName: 'Lipid panel',
            selected: false,
          },
        ]
        patch({
          assessments: [asm, ...state.assessments],
          suggestedTests: [...suggestions, ...state.suggestedTests],
        })
        addAudit({ action: 'ASSESSMENT_SUBMITTED', actor, resource: asm.id })
        return asm
      },

      toggleSuggestedTest: (suggestionId) => {
        patch({
          suggestedTests: state.suggestedTests.map((s) =>
            s.id === suggestionId ? { ...s, selected: !s.selected } : s,
          ),
        })
      },
    }
  }, [state, addAudit])

  return (
    <MockDataContext.Provider value={api}>{children}</MockDataContext.Provider>
  )
}

export function useMockData() {
  const ctx = useContext(MockDataContext)
  if (!ctx) throw new Error('useMockData must be used within MockDataProvider')
  return ctx
}
