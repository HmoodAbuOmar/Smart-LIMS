import { checkoutDraft, reduceCheckout } from './bookingModel.js'

export const todayValue = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export function dateAtOffset(days, now = new Date()) { const date = new Date(now); date.setDate(date.getDate() + days); return todayValue(date) }
export const timeSlots = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '13:00', '13:30', '14:00', '14:30']
export function validSlot(date, time, appointments, excludeId, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !timeSlots.includes(time)) return false
  const selected = new Date(`${date}T${time}:00`)
  return Number.isFinite(selected.getTime()) && todayValue(selected) === date && date <= dateAtOffset(180, now) && selected > now && selected.getDay() !== 5 && !appointments.some(a => a.id !== excludeId && a.status === 'confirmed' && a.date === date && a.time === time)
}
export function validateProfile(profile) {
  const errors = {}
  if (!profile.name?.trim() || profile.name.trim().length < 2 || profile.name.trim().length > 100) errors.name = 'invalidName'
  const date = new Date(`${profile.dateOfBirth}T12:00:00`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(profile.dateOfBirth || '') || !Number.isFinite(date.getTime()) || todayValue(date) !== profile.dateOfBirth || profile.dateOfBirth > todayValue() || profile.dateOfBirth < '1900-01-01') errors.dateOfBirth = 'invalidDate'
  if (!['male', 'female'].includes(profile.gender)) errors.gender = 'fieldRequired'
  if (!/^\+?[\d\s()-]{7,24}$/.test(profile.phone || '') || !/^\d{7,15}$/.test((profile.phone || '').replace(/\D/g, ''))) errors.phone = 'invalidPhone'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email || '')) errors.email = 'invalidEmail'
  if ((profile.address || '').length > 200) errors.address = 'invalidAddress'
  return errors
}
export function totalPrice(ids, tests) { return ids.reduce((sum, id) => sum + (tests.find(test => test.id === id)?.price || 0), 0) }
export function portalReducer(state, action) {
  if (action.type.startsWith('CHECKOUT_')) return reduceCheckout(state, action)
  if (checkoutDraft(state).stage === 'processing' && ['ADD', 'REMOVE', 'ORDER'].includes(action.type)) return state
  switch (action.type) {
    case 'SERVER_RECORD': {
      const records = state[action.collection]
      if (!Array.isArray(records) || !action.record?.id) return state
      return { ...state, [action.collection]: [action.record, ...records.filter(record => record.id !== action.record.id)], ...(action.collection === 'orders' ? { cart: [] } : {}) }
    }
    case 'ADD': return state.tests.some(t => t.id === action.id) && !state.cart.includes(action.id) ? { ...state, cart: [...state.cart, action.id], checkout: { ...(checkoutDraft(state).stage === 'complete' ? checkoutDraft({}) : checkoutDraft(state)), stage: 'editing', requestId: null } } : state
    case 'REMOVE': return { ...state, cart: state.cart.filter(id => id !== action.id), checkout: { ...checkoutDraft(state), stage: 'editing', requestId: null } }
    case 'ORDER': return !state.cart.length ? state : { ...state, cart: [], orders: [{ id: action.id, date: action.date, tests: [...state.cart], status: 'pending', stage: 0, total: totalPrice(state.cart, state.tests) }, ...state.orders] }
    case 'APPOINTMENT': return { ...state, appointments: action.existing ? state.appointments.map(a => a.id === action.existing && a.status === 'confirmed' ? { ...action.appointment, id: a.id } : a) : [action.appointment, ...state.appointments] }
    case 'CANCEL': return { ...state, appointments: state.appointments.map(a => a.id === action.id && a.status === 'confirmed' ? { ...a, status: 'cancelled' } : a) }
    case 'READ': return { ...state, notifications: state.notifications.map(n => action.id === 'all' || n.id === action.id ? { ...n, read: true } : n) }
    case 'PROFILE': return { ...state, profile: { ...state.profile, ...action.profile } }
    default: return state
  }
}
