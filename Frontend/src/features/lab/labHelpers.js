import { draftIsComplete } from './validation'

export function enrichSamples(state) {
  return state.samples.map((s) => ({
    ...s,
    patientName:
      state.patients.find((p) => p.id === s.patientId)?.fullName ??
      state.orders.find((o) => o.id === s.orderId)?.patientName ??
      '—',
  }))
}

export function resultContext(state, result) {
  const sampleTest = result.sampleTestId
    ? state.sampleTests.find((x) => x.id === result.sampleTestId)
    : null
  const sample = sampleTest
    ? state.samples.find((s) => s.id === sampleTest.sampleId)
    : null
  const test = sampleTest
    ? state.labTests.find((t) => t.id === sampleTest.testId)
    : null
  return {
    sampleTest,
    sample,
    test,
    testName: test?.name ?? sampleTest?.testCode ?? '—',
    testCode: sampleTest?.testCode ?? test?.code ?? '—',
    sampleBarcode: sample?.barcode ?? '—',
    sampleId: sample?.id ?? '—',
  }
}

export function labDashboardMetrics(state) {
  const totalSamples = state.samples.length
  const pendingSamples = state.samples.filter((s) =>
    ['REGISTERED', 'COLLECTED', 'RECEIVED'].includes(s.status),
  ).length
  const acceptedSamples = state.samples.filter((s) => s.status === 'ACCEPTED').length
  const rejectedSamples = state.samples.filter((s) => s.status === 'REJECTED').length
  const testsInProgress = state.sampleTests.filter((st) => st.status === 'IN_PROGRESS').length
  const testsAwaiting = state.sampleTests.filter((st) => st.status === 'PENDING').length
  const drafts = state.testResults.filter((r) => r.status === 'DRAFT')
  const draftResults = drafts.length
  const awaitingPublication = drafts.filter((r) => {
    const vals = state.resultValues.filter((v) => v.resultId === r.id)
    return draftIsComplete(vals)
  }).length
  return {
    totalSamples,
    pendingSamples,
    acceptedSamples,
    rejectedSamples,
    testsAwaiting,
    testsInProgress,
    draftResults,
    awaitingPublication,
  }
}

const LAB_AUDIT_ACTIONS = new Set([
  'SAMPLE_REGISTERED',
  'SAMPLE_RECEIVED',
  'SAMPLE_ACCEPTED',
  'SAMPLE_REJECTED',
  'SAMPLE_TEST_ASSIGNED',
  'RESULT_DRAFT_CREATED',
  'RESULT_DRAFT_SAVED',
  'RESULT_PUBLISHED',
  'RESULT_CORRECTION_DRAFT',
])

export function recentLabActivity(state, limit = 8) {
  return state.auditLogs.filter((a) => LAB_AUDIT_ACTIONS.has(a.action)).slice(0, limit)
}

export function enrichSampleTests(state) {
  return state.sampleTests.map((st) => {
    const sample = state.samples.find((s) => s.id === st.sampleId)
    const test = state.labTests.find((t) => t.id === st.testId)
    return {
      ...st,
      sampleBarcode: sample?.barcode ?? st.sampleId,
      testName: test?.name ?? st.testCode,
    }
  })
}
