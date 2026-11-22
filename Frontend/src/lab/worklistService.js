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

export async function loadWorklist(options) {
  const items = await listApi('/api/results/work-items', {}, options)
  const orderIds = [...new Set(items.map(item => item.orderId).filter(Boolean))]
  const groups = await mapPool(orderIds, 6, async orderId => {
    try {
      return await listApi('/api/samples', { orderId }, options)
    } catch (error) {
      if (error?.status === 404) return []
      throw error
    }
  })
  return { items, samples: groups.flat() }
}
