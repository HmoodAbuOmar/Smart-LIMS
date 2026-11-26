export const SAMPLE_STATUS_FILTERS = ['ALL', 'REGISTERED', 'RECEIVED', 'REJECTED']

export function orderPatient(row) {
  const order = row.orderNumber || ''
  const patient = row.patientName || ''
  if (order && patient) return `${order} · ${patient}`
  return order || patient
}

export function sampleListAction(row) {
  if (row?.status === 'REJECTED') return 'replace'
  if (row?.status === 'REGISTERED' || row?.status === 'RECEIVED') return 'reject'
  return 'open'
}

export function rejectionVersion(value) {
  const version = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN
  return Number.isInteger(version) && version >= 0 ? version : null
}

export function detailActions(sample) {
  const status = sample?.status
  return {
    receive: status === 'REGISTERED',
    reject: status === 'REGISTERED' || status === 'RECEIVED',
    replace: status === 'REJECTED',
  }
}

export function linkedTests(sample, names = new Map()) {
  const source = sample?.tests?.length ? sample.tests : (sample?.attestations || []).map(link => ({
    orderItemId: link.orderItemId,
    testName: names.get(String(link.orderItemId)) || '',
  }))
  const tests = []
  const seen = new Set()
  for (const test of source || []) {
    if (!test?.orderItemId) continue
    const orderItemId = String(test.orderItemId)
    if (seen.has(orderItemId)) continue
    seen.add(orderItemId)
    tests.push({ orderItemId, testName: test.testName || names.get(orderItemId) || '' })
  }
  return tests
}

export function replacementReference(sample, samples) {
  const id = String(sample?.id || '')
  const successor = (samples || []).find(item => String(item?.replacesSampleId || '') === id)
  const replaced = (samples || []).find(item => String(item?.id || '') === String(sample?.replacesSampleId || ''))
  return (successor || replaced)?.barcode || ''
}

export function typeContainer(row) {
  if (row.sampleType && row.containerType) return `${row.sampleType} / ${row.containerType}`
  return row.sampleType || row.containerType || ''
}

export function filterSamples(rows, { search = '', status = 'ALL' } = {}) {
  const query = search.trim().toLowerCase()
  return rows.filter(row => {
    const matchesQuery = !query || [row.barcode, row.orderNumber, row.orderId].some(value => String(value || '').toLowerCase().includes(query))
    return matchesQuery && (status === 'ALL' || row.status === status)
  })
}

export function formatClock(value, language) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar' : 'en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}
