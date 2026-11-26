import { listApi } from '../services/apiQuery.js'

async function mapPool(items, limit, task) {
  const results = new Array(items.length)
  let index = 0
  async function worker() {
    while (index < items.length) {
      const current = index
      index += 1
      results[current] = await task(items[current])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// Samples can only be listed for one known order. Order and patient names come
// from the technician worklist, which is the existing order index for this role.
export async function loadSampleList(options) {
  const items = await listApi('/api/results/work-items', {}, options)
  const orders = new Map()
  for (const item of items) {
    if (item.orderId && !orders.has(item.orderId)) orders.set(item.orderId, item)
  }
  const groups = await mapPool([...orders.values()], 6, async order => {
    try {
      const samples = await listApi('/api/samples', { orderId: order.orderId }, options)
      return samples.map(sample => ({ ...sample, orderNumber: order.orderNumber, patientName: order.patientName }))
    } catch (error) {
      if (error?.status === 404) return []
      throw error
    }
  })
  return groups.flat()
}
