import { createPortalSampleData } from './portalSampleData.js'
import { addHistorySamples } from './historySampleData.js'

const key = 'smart-lims.dev-portal.v1'
let workspace
function draftPreferences(state) {
  const draft = state.checkout
  if (!draft || draft.stage === 'complete') return undefined
  const tests = Array.isArray(draft.tests) ? [...new Set(draft.tests)].filter(id => state.tests.some(test => test.id === id)) : []
  return {
    stage: ['reviewed', 'pending'].includes(draft.stage) ? draft.stage : draft.stage === 'processing' ? 'pending' : 'editing',
    date: /^\d{4}-\d{2}-\d{2}$/.test(draft.date || '') ? draft.date : '',
    time: /^\d{2}:\d{2}$/.test(draft.time || '') ? draft.time : '',
    type: ['collection', 'consultation'].includes(draft.type) ? draft.type : 'collection',
    method: ['online', 'laboratory'].includes(draft.method) ? draft.method : '',
    requestId: /^[a-f0-9-]{36}$/i.test(draft.requestId || '') ? draft.requestId : null,
    orderId: state.orders.some(order => order.id === draft.orderId) ? draft.orderId : '',
    tests,
    failure: ['paymentUnavailable', 'bookingUnavailable'].includes(draft.failure) ? draft.failure : undefined,
  }
}
function safePage(value) {
  return typeof value === 'string' && /^(dashboard|tests|orders|appointments|results|history|notifications|profile|review|book|payment|booking-confirmation)(\/[A-Za-z0-9-]+)?$/.test(value) ? value : 'dashboard'
}
function readPreferences() {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch { return {} }
}
export function developmentWorkspace() {
  if (!import.meta.env.DEV) throw new Error('Development workspace unavailable')
  if (!workspace) {
    workspace = addHistorySamples(createPortalSampleData())
    const preferences = readPreferences()
    // Persist only original fixture IDs/UI preferences, never entered profile
    // values, medical results, passwords, tokens, or authentication flags.
    if (Array.isArray(preferences.cart)) workspace.cart = workspace.tests.filter(test => preferences.cart.includes(test.id)).map(test => test.id)
    if (Array.isArray(preferences.read)) workspace.notifications = workspace.notifications.map(item => ({ ...item, read: item.read || preferences.read.includes(item.id) }))
    if (preferences.draft && typeof preferences.draft === 'object') workspace.checkout = draftPreferences({ ...workspace, checkout: preferences.draft })
  }
  return workspace
}
export function retainDevelopmentWorkspace(state) {
  if (!import.meta.env.DEV) return
  workspace = state
  try { sessionStorage.setItem(key, JSON.stringify({ ...readPreferences(), cart: state.cart, read: state.notifications.filter(item => item.read).map(item => item.id), draft: draftPreferences(state) })) } catch { /* In-memory navigation still works when storage is blocked. */ }
}
export function developmentPortalRoute() { return safePage(readPreferences().page) }
export function retainDevelopmentRoute(page) {
  if (!import.meta.env.DEV) return
  try { sessionStorage.setItem(key, JSON.stringify({ ...readPreferences(), page: safePage(page) })) } catch { /* Route still works in memory. */ }
}
