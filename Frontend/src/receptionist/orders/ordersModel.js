export function balances(order) {
  if (!Array.isArray(order.transactions)) return null
  if (!Number.isFinite(Number(order.totalAmount)) || Number(order.totalAmount) < 0) return null
  const cents = amount => Math.round(Number(amount) * 100)
  let receipts = 0, refunds = 0
  for (const entry of order.transactions) {
    if (entry.status !== 'CONFIRMED') continue
    if (!Number.isFinite(Number(entry.amount)) || Number(entry.amount) < 0) return null
    if (entry.type === 'PAYMENT') receipts += cents(entry.amount)
    if (entry.type === 'REFUND') refunds += cents(entry.amount)
  }
  const paid = receipts - refunds, total = cents(order.totalAmount)
  return { total, paid, outstanding: Math.max(0, total - paid), receipts, refunds }
}
export function ordersRoute(id) { return `/__receptionist/orders${id ? `?orderId=${encodeURIComponent(id)}` : ''}` }
