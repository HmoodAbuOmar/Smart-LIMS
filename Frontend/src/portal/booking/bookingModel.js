import { dateAtOffset, totalPrice, validSlot } from '../portalModel.js'

export function checkoutDraft(state) {
  return state.checkout || { date: dateAtOffset(1), time: '', type: 'collection', orderId: '', method: '', stage: 'editing', requestId: null }
}
export function selectedBookingTests(state, draft = checkoutDraft(state)) {
  const existing = state.orders.find(order => order.id === draft.orderId && order.status !== 'cancelled')
  return [...new Set(state.cart.length ? state.cart : existing?.tests || [])].filter(id => state.tests.some(test => test.id === id))
}
export function bookingDraftError(state, draft = checkoutDraft(state)) {
  if (!selectedBookingTests(state, draft).length) return 'bookingTestsRequired'
  if (!validSlot(draft.date, draft.time, state.appointments) || !['collection', 'consultation'].includes(draft.type)) return 'invalidSlot'
  if (draft.orderId && !state.orders.some(order => order.id === draft.orderId && order.status !== 'cancelled')) return 'notFound'
  return null
}

// Pure draft/transaction state. Only the DEV adapter can supply sample receipts.
export function reduceCheckout(state, action) {
  const draft = checkoutDraft(state)
  if (action.type === 'CHECKOUT_EDIT') {
    if (draft.stage === 'processing') return state
    const patch = Object.fromEntries(Object.entries(action.patch).filter(([key]) => ['date', 'time', 'type', 'orderId'].includes(key)))
    return { ...state, checkout: { ...draft, ...patch, stage: 'editing', requestId: null } }
  }
  if (action.type === 'CHECKOUT_REVIEW') {
    if (draft.stage === 'processing' || bookingDraftError(state, draft)) return state
    return { ...state, checkout: { ...draft, stage: 'reviewed', requestId: action.requestId, tests: selectedBookingTests(state, draft) } }
  }
  if (action.type === 'CHECKOUT_METHOD') {
    if (draft.stage !== 'reviewed' || !['online', 'laboratory'].includes(action.method)) return state
    return { ...state, checkout: { ...draft, method: action.method } }
  }
  if (action.type === 'CHECKOUT_START') {
    if (draft.stage !== 'reviewed' || !draft.requestId || !['online', 'laboratory'].includes(draft.method) || bookingDraftError(state)) return state
    return { ...state, checkout: { ...draft, stage: 'processing' } }
  }
  if (action.type === 'CHECKOUT_FAILED') {
    return draft.stage === 'processing' && draft.requestId === action.requestId ? { ...state, checkout: { ...draft, stage: 'reviewed' } } : state
  }
  if (action.type === 'CHECKOUT_PENDING') {
    return draft.stage === 'processing' && draft.requestId === action.requestId ? { ...state, checkout: { ...draft, stage: 'pending', failure: ['paymentUnavailable', 'bookingUnavailable'].includes(action.failure) ? action.failure : undefined } } : state
  }
  if (action.type === 'CHECKOUT_RETRY') return draft.stage === 'pending' ? { ...state, checkout: { ...draft, stage: 'reviewed' } } : state
  if (action.type === 'CHECKOUT_SERVER_COMPLETE') {
    if (draft.stage !== 'processing' || draft.requestId !== action.requestId || action.appointment?.serverConfirmed !== true || action.appointment?.source !== 'server') return state
    const merge = (records, record) => [record, ...records.filter(item => item.id !== record.id)]
    return { ...state, cart: [], checkout: { ...draft, stage: 'complete', bookingId: action.appointment.id }, appointments: merge(state.appointments, action.appointment), orders: merge(state.orders, action.order) }
  }
  if (action.type === 'CHECKOUT_COMPLETE') {
    const receipt = action.receipt
    if (draft.stage !== 'processing' || !draft.requestId || draft.requestId !== receipt?.requestId || receipt.source !== 'development-simulator' || receipt.method !== draft.method || receipt.outcome !== 'approved' || bookingDraftError(state)) return state
    if (state.appointments.some(appointment => appointment.requestId === draft.requestId)) return state
    const tests = selectedBookingTests(state, draft), total = totalPrice(tests, state.tests)
    const paymentStatus = draft.method === 'online' ? 'simulatedPaid' : 'pending'
    // Reuse a related order only when its test set matches exactly. Otherwise this
    // is a new selection/order; never append tests silently to an existing order.
    const related = state.orders.find(order => order.id === draft.orderId && order.tests.length === tests.length && order.tests.every(id => tests.includes(id)))
    const orderId = related?.id || action.orderId
    const payment = { paymentMethod: draft.method, paymentStatus, total, requestId: draft.requestId, source: 'development' }
    const appointment = { id: action.bookingId, date: draft.date, time: draft.time, type: draft.type, orderId, tests, status: 'confirmed', patientName: state.profile.name, ...payment }
    const order = { id: orderId, date: action.date, tests, status: 'pending', stage: 0, ...payment }
    return { ...state, cart: [], checkout: { ...draft, stage: 'complete', bookingId: appointment.id },
      orders: related ? state.orders.map(item => item.id === related.id ? { ...item, ...payment } : item) : [order, ...state.orders],
      appointments: [appointment, ...state.appointments],
      notifications: [{ id: action.notificationId, category: 'appointments', key: 'appointmentNotice', date: action.timestamp, target: `appointments/${appointment.id}`, read: false }, ...state.notifications],
    }
  }
  if (action.type === 'CHECKOUT_NEW') return { ...state, checkout: undefined }
  return state
}
