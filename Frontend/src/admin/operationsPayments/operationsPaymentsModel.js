export const ORDER_STATUSES=['NEW','IN_PROGRESS','COMPLETED','CANCELLED']
export const TRANSACTION_STATUSES=['CONFIRMED','PENDING','FAILED','CANCELLED']
export const TRANSACTION_TYPES=['PAYMENT','REFUND']
export const REPORT_TIME_ZONE='Asia/Jerusalem'
export const localizedName=(record,language)=>record[language==='ar'?'nameAr':'nameEn'] || ''
export function reportDate(value=new Date()) {
  if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:REPORT_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value)).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
export function offsetDate(date,offset){const value=new Date(`${date}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+offset);return value.toISOString().slice(0,10)}
export function defaultPeriod(today=reportDate()){return {from:offsetDate(today,-29),to:today}}
export function validDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'0001-01-01')return false;const date=new Date(`${value}T12:00:00Z`);return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value}
export function periodErrors(period){const errors={};for(const key of ['from','to'])if(period[key]&&!validDate(period[key]))errors[key]='invalidDate';if(!errors.from&&!errors.to&&period.from&&period.to&&period.to<period.from)errors.to='dateOrder';return errors}
export function inPeriod(value,period){if(Object.keys(periodErrors(period)).length)return false;const date=reportDate(value);return (!period.from||date>=period.from)&&(!period.to||date<=period.to)}
export const transactionDate=transaction=>transaction.status==='CONFIRMED'&&transaction.confirmedAt?transaction.confirmedAt:transaction.recordedAt
export function periodRecords(data,period){return {orders:data.orders.filter(order=>inPeriod(order.createdAt,period)),transactions:data.transactions.filter(transaction=>inPeriod(transactionDate(transaction),period))}}
export function summarize(records){
 const total=(type,status)=>records.transactions.filter(transaction=>transaction.type===type&&transaction.status===status).reduce((sum,transaction)=>sum+transaction.amountCents,0)
 const receiptsCents=total('PAYMENT','CONFIRMED'),refundsCents=total('REFUND','CONFIRMED')
 return {orders:new Set(records.orders.map(order=>order.id)).size,receiptsCents,refundsCents,pendingCents:total('PAYMENT','PENDING'),netCents:receiptsCents-refundsCents}
}
export function orderPaymentStatus(order,transactions){
 const owned=transactions.filter(transaction=>transaction.orderId===order.id)
 const paid=owned.filter(transaction=>transaction.type==='PAYMENT'&&transaction.status==='CONFIRMED').reduce((sum,transaction)=>sum+transaction.amountCents,0)
 const refunded=owned.filter(transaction=>transaction.type==='REFUND'&&transaction.status==='CONFIRMED').reduce((sum,transaction)=>sum+transaction.amountCents,0)
 if(refunded>0)return refunded>=paid?'REFUNDED':'PARTIALLY_REFUNDED'
 if(paid>=order.totalCents)return 'PAID'
 if(paid>0)return 'PARTIALLY_PAID'
 if(owned.some(transaction=>transaction.type==='PAYMENT'&&transaction.status==='PENDING'))return 'PENDING'
 const last=[...owned].filter(transaction=>transaction.type==='PAYMENT').sort((a,b)=>b.recordedAt.localeCompare(a.recordedAt)||b.id.localeCompare(a.id))[0]
 return last&&['FAILED','CANCELLED'].includes(last.status)?last.status:'PENDING'
}
export function filterOrders(orders,query,status){const term=query.trim().toLocaleLowerCase();return orders.filter(order=>(status==='all'||order.status===status)&&[order.number,order.patient.nameEn,order.patient.nameAr,...order.tests.flatMap(test=>[test.nameEn,test.nameAr])].some(value=>value.toLocaleLowerCase().includes(term)))}
export function filterTransactions(transactions,orders,query,type,status){const term=query.trim().toLocaleLowerCase(),byId=new Map(orders.map(order=>[order.id,order]));return transactions.filter(transaction=>(type==='all'||transaction.type===type)&&(status==='all'||transaction.status===status)&&[transaction.reference,byId.get(transaction.orderId)?.number||''].some(value=>value.toLocaleLowerCase().includes(term)))}
