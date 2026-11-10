import assert from 'node:assert/strict'
import { createOperationsData, createOperationsService } from './operationsPaymentsService.js'
import { defaultPeriod, filterOrders, filterTransactions, inPeriod, orderPaymentStatus, periodErrors, periodRecords, reportDate, summarize, transactionDate } from './operationsPaymentsModel.js'
import { operationsPaymentsCopy } from './operationsPaymentsCopy.js'
const data=createOperationsData('2026-11-10'),period=defaultPeriod('2026-11-10')
assert.equal(periodRecords(data,period).orders.length,30);assert.equal(data.orders.length,42)
assert.equal(new Set(data.orders.map(record=>record.id)).size,data.orders.length)
assert.equal(new Set(data.transactions.map(record=>record.id)).size,data.transactions.length)
assert.ok(data.transactions.every(record=>data.orders.some(order=>order.id===record.orderId)&&Number.isSafeInteger(record.amountCents)&&record.amountCents>0))
for(const order of data.orders){assert.equal(order.totalCents,order.tests.reduce((sum,test)=>sum+test.priceCents,0));const owned=data.transactions.filter(transaction=>transaction.orderId===order.id);const paid=owned.filter(t=>t.type==='PAYMENT'&&t.status==='CONFIRMED').reduce((sum,t)=>sum+t.amountCents,0),refunded=owned.filter(t=>t.type==='REFUND'&&t.status==='CONFIRMED').reduce((sum,t)=>sum+t.amountCents,0);assert.ok(refunded<=paid)}
assert.ok(filterOrders(data.orders,'Lina','all').length>0);assert.ok(filterOrders(data.orders,'لينا','all').length>0)
assert.equal(filterOrders(data.orders,'ORD-3002','all').length,1)
assert.ok(filterOrders(data.orders,'Glucose','all').length>0);assert.ok(filterOrders(data.orders,'سكر الدم','all').length>0)
assert.ok(filterOrders(data.orders,'','NEW').every(order=>order.status==='NEW'))
assert.ok(filterTransactions(data.transactions,data.orders,'RF-','REFUND','CONFIRMED').every(t=>t.type==='REFUND'&&t.status==='CONFIRMED'))
assert.ok(filterTransactions(data.transactions,data.orders,'ORD-3005','all','all').every(t=>t.orderId==='op-order-5'))
const order=(id,createdAt,totalCents)=>({id,createdAt,totalCents})
const transaction=(id,orderId,type,status,amountCents,recordedAt,confirmedAt=null)=>({id,orderId,type,status,amountCents,recordedAt,confirmedAt})
const controlled={orders:[order('one','2026-11-01',10000),order('two','2026-11-03',5000),order('older','2026-10-31',1000)],transactions:[transaction('a','one','PAYMENT','CONFIRMED',10000,'2026-11-01','2026-11-02'),transaction('b','one','REFUND','CONFIRMED',2000,'2026-11-02','2026-11-03'),transaction('c','two','PAYMENT','PENDING',5000,'2026-11-03'),transaction('d','two','PAYMENT','FAILED',30000,'2026-11-03'),transaction('e','two','PAYMENT','CANCELLED',40000,'2026-11-03'),transaction('f','one','REFUND','PENDING',8000,'2026-11-03'),transaction('g','older','PAYMENT','CONFIRMED',1000,'2026-11-02','2026-11-03')]}
assert.deepEqual(summarize(periodRecords(controlled,{from:'2026-11-01',to:'2026-11-03'})),{orders:2,receiptsCents:11000,refundsCents:2000,pendingCents:5000,netCents:9000})
assert.deepEqual(summarize(periodRecords(controlled,{from:'2026-11-03',to:'2026-11-03'})),{orders:1,receiptsCents:1000,refundsCents:2000,pendingCents:5000,netCents:-1000})
assert.equal(summarize({orders:[controlled.orders[0],controlled.orders[0]],transactions:[]}).orders,1)
assert.equal(inPeriod('2026-11-03',{from:'2026-11-03',to:'2026-11-03'}),true)
assert.equal(reportDate('2026-11-02T22:30:00Z'),'2026-11-03')
assert.equal(transactionDate(controlled.transactions[0]),'2026-11-02');assert.equal(transactionDate(controlled.transactions[2]),'2026-11-03')
assert.deepEqual(periodErrors({from:'2026-11-04',to:'2026-11-03'}),{to:'dateOrder'});assert.equal(periodErrors({from:'2026-02-30',to:''}).from,'invalidDate')
assert.equal(periodRecords(controlled,{from:'2026-11-04',to:'2026-11-03'}).orders.length,0)
assert.equal(orderPaymentStatus(controlled.orders[0],controlled.transactions),'PARTIALLY_REFUNDED');assert.equal(orderPaymentStatus(controlled.orders[1],controlled.transactions),'PENDING');assert.equal(orderPaymentStatus(controlled.orders[2],controlled.transactions),'PAID')
assert.equal(orderPaymentStatus(controlled.orders[0],[controlled.transactions[0],{...controlled.transactions[1],amountCents:10000}]),'REFUNDED')
const before=structuredClone(data),service=createOperationsService(data,{delay:0});const snapshot=await service.load();snapshot.orders[0].totalCents=0;assert.deepEqual(await service.load(),before);assert.deepEqual(Object.keys(service),['load'])
assert.deepEqual(Object.keys(operationsPaymentsCopy.en),Object.keys(operationsPaymentsCopy.ar))
console.log('PASS: stable relationships, bilingual order/test searches, transaction searches/filters, exact integer-cent gross/refund/pending/net totals, unique order counts, period boundaries/confirmation dates/timezone, transactions on older orders, refund-aware payment labels, invalid dates, read-only isolation and bilingual copy.')
