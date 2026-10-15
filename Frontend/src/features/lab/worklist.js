/**
 * Derives laboratory worklist rows from shared mock state.
 */
export function buildWorklist(state) {
  const rows = []
  for (const item of state.orderItems) {
    const order = state.orders.find((o) => o.id === item.orderId)
    const sample =
      state.samples.find(
        (s) => s.orderId === item.orderId && !['REJECTED', 'REPLACED'].includes(s.status),
      ) ?? null
    const sampleTest =
      sample &&
      state.sampleTests.find(
        (st) => st.sampleId === sample.id && (st.testId === item.testId || st.testCode === item.testCode),
      )

    const status = sampleTest?.status ?? (sample ? 'PENDING' : 'AWAITING_SAMPLE')
    const needsAttention =
      !sample ||
      !['ACCEPTED'].includes(sample.status) ||
      status === 'AWAITING_SAMPLE' ||
      status === 'PENDING' ||
      status === 'IN_PROGRESS'

    rows.push({
      id: `wl-${item.id}`,
      orderId: item.orderId,
      orderItemId: item.id,
      orderDate: order?.createdAt ?? '—',
      patientName: order?.patientName ?? '—',
      testCode: item.testCode,
      testName: item.testName,
      sampleId: sample?.id ?? null,
      sampleBarcode: sample?.barcode ?? '—',
      sampleStatus: sample?.status ?? 'PENDING',
      sampleTestId: sampleTest?.id ?? null,
      priority: sampleTest?.priority ?? 'ROUTINE',
      status,
      needsAttention,
    })
  }
  return rows
}

export function sortWorklistRows(rows, sortKey) {
  const copy = [...rows]
  switch (sortKey) {
    case 'orderDate-asc':
      return copy.sort((a, b) => String(a.orderDate).localeCompare(String(b.orderDate)))
    case 'orderDate-desc':
      return copy.sort((a, b) => String(b.orderDate).localeCompare(String(a.orderDate)))
    case 'patient-asc':
      return copy.sort((a, b) => a.patientName.localeCompare(b.patientName))
    case 'test-asc':
      return copy.sort((a, b) => a.testName.localeCompare(b.testName))
    case 'priority':
    default:
      return copy.sort((a, b) => {
        const pri = (p) => (p === 'STAT' ? 0 : 1)
        const d = pri(a.priority) - pri(b.priority)
        if (d !== 0) return d
        return String(b.orderDate).localeCompare(String(a.orderDate))
      })
  }
}
