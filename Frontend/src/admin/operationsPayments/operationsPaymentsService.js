import { offsetDate, reportDate } from './operationsPaymentsModel.js'
export function createOperationsData(today=reportDate()){
 const names=[['Lina Nasser','لينا ناصر'],['Omar Khalil','عمر خليل'],['Maya Saleh','مايا صالح'],['Adam Hassan','آدم حسن'],['Noor Ahmad','نور أحمد'],['Sara Hamdan','سارة حمدان'],['Yousef Ali','يوسف علي'],['Dana Mansour','دانا منصور']]
 const patients=names.map(([nameEn,nameAr],index)=>({id:`op-patient-${index+1}`,nameEn,nameAr}))
 const tests=[{id:'op-test-cbc',code:'CBC',nameEn:'Complete Blood Count',nameAr:'تعداد الدم الكامل',priceCents:4500},{id:'op-test-glu',code:'GLU',nameEn:'Glucose',nameAr:'سكر الدم',priceCents:2500},{id:'op-test-lipid',code:'LIPID',nameEn:'Lipid Profile',nameAr:'دهون الدم',priceCents:8000},{id:'op-test-tsh',code:'TSH',nameEn:'Thyroid Stimulating Hormone',nameAr:'الهرمون المنبه للغدة الدرقية',priceCents:6500}]
 const orders=[],transactions=[];let sequence=8000
 const transaction=(order,type,status,amountCents,date,confirmedDate=date)=>{const id=++sequence;transactions.push({id:`op-transaction-${id}`,reference:`${type==='REFUND'?'RF':'TX'}-${id}`,orderId:order.id,type,status,amountCents,currency:'ILS',recordedAt:`${date}T08:00:00Z`,confirmedAt:status==='CONFIRMED'?`${confirmedDate}T10:00:00Z`:null})}
 for(let index=0;index<42;index++){
  const date=offsetDate(today,-index),phase=index%6,items=[tests[index%tests.length],...(index%3===0?[tests[(index+1)%tests.length]]:[])]
  const order={id:`op-order-${index+1}`,number:`ORD-${3001+index}`,patient:patients[index%patients.length],tests:items.map(test=>({...test})),totalCents:items.reduce((sum,test)=>sum+test.priceCents,0),currency:'ILS',status:['COMPLETED','NEW','IN_PROGRESS','CANCELLED','COMPLETED','COMPLETED'][phase],createdAt:`${date}T07:00:00Z`};orders.push(order)
  const confirmedDate=index?offsetDate(date,1):date
  if(phase===0)transaction(order,'PAYMENT','CONFIRMED',order.totalCents,date,confirmedDate)
  if(phase===1)transaction(order,'PAYMENT','PENDING',order.totalCents,date)
  if(phase===2)transaction(order,'PAYMENT','FAILED',order.totalCents,date)
  if(phase===3)transaction(order,'PAYMENT','CANCELLED',order.totalCents,date)
  if(phase===4){transaction(order,'PAYMENT','CONFIRMED',order.totalCents,date);transaction(order,'REFUND','CONFIRMED',index%12===4?Math.round(order.totalCents/2):order.totalCents,date,confirmedDate)}
  if(phase===5){const first=Math.round(order.totalCents*.4);transaction(order,'PAYMENT','CONFIRMED',first,date);transaction(order,'PAYMENT','CONFIRMED',order.totalCents-first,date,confirmedDate)}
 }
 return {orders,transactions}
}
export function createOperationsService(initial=createOperationsData(),{delay=140}={}){
 const data=structuredClone(initial)
 return {async load(){await new Promise(resolve=>setTimeout(resolve,delay));return structuredClone(data)}}
}
export const operationsPaymentsService=createOperationsService()
