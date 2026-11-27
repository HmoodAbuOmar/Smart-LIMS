import { formatCollectionTime } from './collectSampleModel.js'
import { referenceLabel, versionMark } from './draftResultModel.js'
import { reviewValueText, sampleReference } from './reviewResultModel.js'

const STATUSES = new Set(['DRAFT', 'APPROVED', 'PUBLISHED'])

function routeId(resultId) {
  const id = String(resultId || '').trim()
  if (!id || id === '.' || id === '..' || /[/?#]/.test(id)) return ''
  return id
}

export function publishedReportHash(resultId, preview = false) {
  const id = routeId(resultId)
  if (!id) return ''
  return `${preview ? '/__lab' : '/lab-technician'}/published/${encodeURIComponent(id)}`
}

export function publishedListHash(preview = false) {
  return `${preview ? '/__lab' : '/lab-technician'}/published`
}

// The list opens the current publication. A correction draft keeps its own
// working id and must not replace the published result id.
export function publishedListRows(items) {
  return (items || [])
    .filter(item => routeId(item?.currentResultId))
    .map(item => ({
      orderItemId: String(item.orderItemId || ''),
      resultId: routeId(item.currentResultId),
      testName: item.testName || '',
      patientName: item.patientName || '',
      patientNumber: item.patientNumber || '',
      orderNumber: item.orderNumber || '',
    }))
    .sort((left, right) => left.orderNumber.localeCompare(right.orderNumber) || left.testName.localeCompare(right.testName) || left.resultId.localeCompare(right.resultId))
}

function versionNumber(value) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(number) && number >= 0 ? number : -1
}

function clock(value, language) {
  return formatCollectionTime(value, language)
}

export function publishedReportView(result, language) {
  if (result?.status !== 'PUBLISHED' || !routeId(result?.id)) return null
  const rows = [...(result.values || [])]
    .sort((left, right) => (left?.displayOrder - right?.displayOrder) || String(left?.code || '').localeCompare(String(right?.code || '')) || String(left?.parameterId || '').localeCompare(String(right?.parameterId || '')))
    .map(value => ({
      parameterId: String(value?.parameterId || ''),
      name: value?.name || '',
      valueText: reviewValueText(value),
      unit: value?.unit || '',
      reference: referenceLabel(value),
      flag: value?.flag || '',
      notes: value?.notes || '',
    }))
  return {
    id: routeId(result.id),
    orderItemId: routeId(result.orderItemId),
    testName: result.testName || '',
    patientName: result.patient?.name || '',
    patientNumber: result.patient?.number || '',
    orderNumber: result.orderNumber || '',
    versionLabel: versionMark(result.versionNumber),
    sampleReference: sampleReference(result.specimens),
    approvedAt: clock(result.approvedAt, language),
    publishedAt: clock(result.publishedAt, language),
    rows,
  }
}

export function publishedHistoryRows(versions, language, { includeDrafts = true } = {}) {
  return (versions || [])
    .filter(version => version && typeof version === 'object')
    .filter(version => includeDrafts || version.status !== 'DRAFT')
    .map(version => {
      const number = versionNumber(version.versionNumber)
      const status = STATUSES.has(version.status) ? version.status : ''
      return {
        id: String(version.id || `${number}:${status}`),
        versionNumber: number,
        versionLabel: versionMark(number),
        status,
        // Only the publication the server still marks current carries Current.
        // A newer draft keeps isCurrent false and must not take that place.
        current: status === 'PUBLISHED' && version.isCurrent === true,
        approvedAt: clock(version.approvedAt, language),
        publishedAt: clock(version.publishedAt, language),
        samples: sampleReference(version.specimens),
      }
    })
    .sort((left, right) => right.versionNumber - left.versionNumber || left.id.localeCompare(right.id))
}
