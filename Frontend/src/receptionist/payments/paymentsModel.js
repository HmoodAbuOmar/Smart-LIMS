import { inPeriod, REPORT_TIME_ZONE, transactionDate } from '../../admin/operationsPayments/operationsPaymentsModel.js'
import { balances } from '../orders/ordersModel.js'
import { money } from '../walk-in/walkInModel.js'

// Methods recorded by the local preview for payments already collected at the desk.
export const paymentMethods = ['CASH', 'CARD']

export function eligibleBalance(order) {
  if (!order || order.status === 'CANCELLED' || order.currency !== 'ILS') return null
  const balance = balances(order)
  return balance?.outstanding > 0 ? balance : null
}

export function paymentCents(value) {
  value = value.replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace('٫', '.')
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null
}

export function formatPaymentDate(transaction, language) {
  const timestamp = transactionDate(transaction)
  const date = timestamp ? new Date(timestamp) : null
  return date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(language === 'ar' ? 'ar-PS' : 'en-GB', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: REPORT_TIME_ZONE,
  }).format(date) : '—'
}

export function transactionCents(transaction) {
  return transaction.amountCents ?? Math.round(transaction.amount * 100)
}

export function paymentAmount(transaction, language) {
  return money(transactionCents(transaction), language)
}

export function filterPayments(rows, { query, type, from, to }) {
  const term = query.trim().toLocaleLowerCase()
  return rows.filter(({ transaction, order, patient }) => {
    if (type && transaction.type !== type) return false
    const date = transactionDate(transaction)
    if ((from || to) && (!date || !inPeriod(date, { from, to }))) return false
    return [order.orderNumber, patient.fullName, patient.nameEn, patient.nameAr]
      .some(value => value?.toLocaleLowerCase().includes(term))
  }).sort((a, b) => (transactionDate(b.transaction) || '').localeCompare(transactionDate(a.transaction) || ''))
}
