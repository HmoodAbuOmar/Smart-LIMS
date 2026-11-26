const ELIGIBLE_ORDER_STATUS = new Set(['IN_PROGRESS', 'COMPLETED'])
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'

function eligibleOrder(item) {
  return !item.orderStatus || ELIGIBLE_ORDER_STATUS.has(item.orderStatus)
}

export function groupCollectionOrders(items) {
  const orders = new Map()
  for (const item of items || []) {
    if (!item?.orderId || !item?.orderItemId || !eligibleOrder(item)) continue
    const orderId = String(item.orderId)
    const orderItemId = String(item.orderItemId)
    let order = orders.get(orderId)
    if (!order) {
      order = { orderId, orderNumber: item.orderNumber || '', patientName: item.patientName || '', tests: [] }
      orders.set(orderId, order)
    }
    if (!order.tests.some(test => test.orderItemId === orderItemId)) {
      order.tests.push({ orderItemId, testName: item.testName || '' })
    }
  }
  return [...orders.values()]
}

// The replacement request records the specimen and the rejected sample ID.
// It does not accept a test selection, so a subset cannot be saved.
export const REPLACEMENT_ALLOWS_PARTIAL = false

export function normalizeReplacement(sample, names = new Map()) {
  if (!sample?.id || sample.status !== 'REJECTED') return null
  const tests = []
  const seen = new Set()
  const linked = sample.tests?.length ? sample.tests : (sample.attestations || []).map(link => ({
    orderItemId: link.orderItemId,
    testName: names.get(String(link.orderItemId)) || '',
  }))
  for (const test of linked) {
    if (!test?.orderItemId) continue
    const orderItemId = String(test.orderItemId)
    if (seen.has(orderItemId)) continue
    seen.add(orderItemId)
    tests.push({ orderItemId, testName: test.testName || names.get(orderItemId) || '' })
  }
  return {
    id: String(sample.id),
    barcode: sample.barcode || '',
    visitId: sample.visitId ? String(sample.visitId) : '',
    orderId: sample.orderId ? String(sample.orderId) : '',
    orderNumber: sample.orderNumber || '',
    patientName: sample.patientName || '',
    sampleType: sample.sampleType || '',
    rejectionReason: sample.rejectionReason || '',
    tests,
  }
}

export function filterCollectionOrders(orders, query) {
  const text = String(query || '').trim().toLowerCase()
  if (!text) return orders
  return orders.filter(order => [order.orderNumber, order.patientName].some(value => String(value || '').toLowerCase().includes(text)))
}

export function formatCollectionTime(value, language) {
  if (value == null || value === '') return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat(language === 'ar' ? 'ar' : 'en-GB', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    numberingSystem: language === 'ar' ? 'arab' : 'latn',
  }).formatToParts(date)
  const part = type => parts.find(item => item.type === type)?.value || ''
  const hour = part('hour') === '24' ? '00' : part('hour')
  return `${part('day')}/${part('month')}/${part('year')} · ${hour}:${part('minute')}`
}

function zoneOffset(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date)
  const value = type => Number(parts.find(part => part.type === type)?.value)
  const hour = value('hour') === 24 ? 0 : value('hour')
  return Date.UTC(value('year'), value('month') - 1, value('day'), hour, value('minute'), value('second')) - date.getTime()
}

function wallTime(year, month, day, hour, minute) {
  const utc = Date.UTC(year, month - 1, day, hour, minute)
  const instant = new Date(utc - zoneOffset(new Date(utc - zoneOffset(new Date(utc), 'Asia/Jerusalem')), 'Asia/Jerusalem'))
  return Number.isNaN(instant.getTime()) ? '' : instant.toISOString()
}

export function parseCollectionTime(value) {
  const text = String(value || '').trim().replace(/[٠-٩]/g, digit => String(ARABIC_DIGITS.indexOf(digit)))
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s·\s|\s+)(\d{2}):(\d{2})$/)
  if (!match) return ''
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return ''
  const instant = wallTime(year, month, day, hour, minute)
  if (!instant || formatCollectionTime(instant, 'en') !== `${match[1]}/${match[2]}/${match[3]} · ${match[4]}:${match[5]}`) return ''
  return instant
}

// Save stays unavailable until one eligible order, one of its tests, a sample
// type, a container, and a collection time that is not in the future are present.
export function collectionReady({ orderId, sampleType = '', containerType = '', selectedIds = [], collectedAt = '' }) {
  const type = String(sampleType).trim()
  const container = String(containerType).trim()
  const collected = new Date(collectedAt)
  return Boolean(orderId)
    && selectedIds.length > 0
    && type.length > 0
    && type.length <= 40
    && container.length > 0
    && container.length <= 60
    && !Number.isNaN(collected.getTime())
    && collected.getTime() <= Date.now()
}
