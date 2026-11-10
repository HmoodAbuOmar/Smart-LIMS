import { useEffect, useRef, useState } from 'react'
import { ClipboardList, CreditCard, ReceiptText, Undo2, Clock3, Search, Info } from 'lucide-react'
import { formatCurrency } from '../../utils/currency.js'
import { operationsPaymentsCopy } from './operationsPaymentsCopy.js'
import { operationsPaymentsService } from './operationsPaymentsService.js'
import { defaultPeriod, filterOrders, filterTransactions, localizedName, ORDER_STATUSES, orderPaymentStatus, periodErrors, periodRecords, reportDate, summarize, TRANSACTION_STATUSES, TRANSACTION_TYPES, transactionDate } from './operationsPaymentsModel.js'
import './operationsPayments.css'

function ReportingInfo({copy}) {
 const root=useRef(null)
 useEffect(()=>{function outside(event){if(root.current&&!root.current.contains(event.target))root.current.open=false}document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside)},[])
 return <details className="op-period-info" ref={root} onKeyDown={event=>{if(event.key==='Escape'&&event.currentTarget.open){event.preventDefault();event.stopPropagation();event.currentTarget.open=false;event.currentTarget.querySelector('summary').focus()}}}><summary className="op-info-button" aria-label={copy.periodInfo} aria-controls="op-period-explanation" title={copy.periodInfo}><Info size={17} aria-hidden="true"/></summary><p id="op-period-explanation">{copy.periodHint}</p></details>
}

export default function AdminOperationsPayments({language,service=operationsPaymentsService}){
 const copy=operationsPaymentsCopy[language]
 const [data,setData]=useState({orders:[],transactions:[]}),[load,setLoad]=useState('loading'),[attempt,setAttempt]=useState(0)
 const [tab,setTab]=useState('orders'),[period,setPeriod]=useState(()=>defaultPeriod())
 const [orderFilters,setOrderFilters]=useState({query:'',status:'all',page:1,size:8}),[transactionFilters,setTransactionFilters]=useState({query:'',type:'all',status:'all',page:1,size:8})
 useEffect(()=>{let alive=true;service.load().then(value=>{if(alive){setData(value);setLoad('ready')}}).catch(()=>{if(alive)setLoad('error')});return()=>{alive=false}},[service,attempt])
 const records=periodRecords(data,period),summary=summarize(records),errors=periodErrors(period)
 const orders=filterOrders(records.orders,orderFilters.query,orderFilters.status).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id))
 const transactions=filterTransactions(records.transactions,data.orders,transactionFilters.query,transactionFilters.type,transactionFilters.status).sort((a,b)=>transactionDate(b).localeCompare(transactionDate(a))||a.id.localeCompare(b.id))
 const byOrder=new Map(data.orders.map(order=>[order.id,order]))
 const filters=tab==='orders'?orderFilters:transactionFilters,rows=tab==='orders'?orders:transactions,setFilters=tab==='orders'?setOrderFilters:setTransactionFilters
 const pages=Math.max(1,Math.ceil(rows.length/filters.size)),page=Math.min(filters.page,pages),visible=rows.slice((page-1)*filters.size,page*filters.size)
 const number=value=>new Intl.NumberFormat(language).format(value),money=cents=>formatCurrency(cents/100,language)
 const date=value=>new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${reportDate(value)}T12:00:00Z`))
 function changePeriod(next){setPeriod(next);setOrderFilters(current=>({...current,page:1}));setTransactionFilters(current=>({...current,page:1}))}
 function changeFilter(key,value){setFilters(current=>({...current,[key]:value,page:1}))}
 const badge=value=><span className={`op-badge op-status-${value.toLowerCase()}`}>{copy[value]}</span>
 const orderHeaders=['orderNumber','patient','tests','total','paymentStatus','orderStatus','created'],transactionHeaders=['reference','orderNumber','type','amount','status','date'],headers=tab==='orders'?orderHeaders:transactionHeaders
 function cell(key,content,isHeader=false){const Tag=isHeader?'th':'td';return <Tag key={key} role={isHeader?'rowheader':'cell'} scope={isHeader?'row':undefined} headers={`op-column-${key}`} className={`op-cell-${key}`}><span className="op-cell-label" aria-hidden="true">{copy[key]}</span><div className="op-cell-value">{content}</div></Tag>}
 function tabKey(event){if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const buttons=[...event.currentTarget.parentElement.querySelectorAll('button')],index=buttons.indexOf(event.currentTarget),next=event.key==='Home'?0:event.key==='End'?1:1-index;buttons[next].focus();buttons[next].click()}
 function filterSelect(key,label,choices){return <label className="op-filter">{label}<select aria-label={label} value={filters[key]} onChange={event=>changeFilter(key,event.target.value)}><option value="all">{copy.all}</option>{choices.map(value=><option key={value} value={value}>{copy[value]}</option>)}</select></label>}
 return <section className="admin-operations-payments" aria-label={copy.title}>
  <div className="op-heading"><span aria-hidden="true"><CreditCard size={23}/></span><div><h2>{copy.title}</h2><p>{copy.subtitle}</p></div></div>
  {load==='loading'?<p className="op-empty" role="status">{copy.loading}</p>:load==='error'?<div className="op-panel op-empty" role="alert"><p>{copy.loadError}</p><button type="button" onClick={()=>{setLoad('loading');setAttempt(value=>value+1)}}>{copy.retry}</button></div>:<>
   <div className="op-summary">{[{key:'orders',label:'totalOrders',Icon:ClipboardList},{key:'receiptsCents',label:'receipts',Icon:ReceiptText},{key:'refundsCents',label:'refunds',Icon:Undo2},{key:'pendingCents',label:'pending',Icon:Clock3}].map(({key,label,Icon})=><article className={`op-summary-card op-summary-${key}`} key={key} aria-label={copy[label]}><div className="op-summary-label"><span className="op-summary-icon" aria-hidden="true"><Icon size={18}/></span><h3>{copy[label]}</h3></div><p data-summary={key}>{key==='orders'?number(summary[key]):<bdi>{money(summary[key])}</bdi>}</p>{label==='receipts'&&<small>{copy.grossHint}</small>}</article>)}</div>
   <section className="op-panel op-results"><div className="op-tabs" role="tablist" aria-label={copy.title}>{['orders','transactions'].map(key=><button type="button" role="tab" key={key} id={`op-tab-${key}`} aria-selected={tab===key} tabIndex={tab===key?0:-1} aria-controls="op-table-panel" onKeyDown={tabKey} onClick={()=>setTab(key)}>{copy[key]}</button>)}</div>
    <div id="op-table-panel" role="tabpanel" aria-labelledby={`op-tab-${tab}`}>
     <div className="op-toolbar"><div className="op-period" role="group" aria-label={copy.reportPeriod}>{['from','to'].map(key=><label key={key} htmlFor={`op-period-${key}`}>{copy[key]}<input id={`op-period-${key}`} type="date" value={period[key]} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key]?`op-${key}-error`:undefined} onChange={event=>changePeriod({...period,[key]:event.target.value})}/>{errors[key]&&<span className="op-error" role="alert" id={`op-${key}-error`}>{copy[errors[key]]}</span>}</label>)}<button type="button" onClick={()=>changePeriod(defaultPeriod())}>{copy.last30}</button><ReportingInfo copy={copy}/></div><label className="op-search"><Search size={17} aria-hidden="true"/><span className="op-sr-only">{tab==='orders'?copy.orderSearch:copy.transactionSearch}</span><input type="search" placeholder={tab==='orders'?copy.orderSearch:copy.transactionSearch} value={filters.query} onChange={event=>changeFilter('query',event.target.value)}/></label>{tab==='orders'?filterSelect('status',copy.orderFilter,ORDER_STATUSES):<>{filterSelect('type',copy.typeFilter,TRANSACTION_TYPES)}{filterSelect('status',copy.statusFilter,TRANSACTION_STATUSES)}</>}<p className="op-count" role="status">{copy.results}: <strong>{number(rows.length)}</strong></p></div>
     {!visible.length?<div className="op-empty" role="status"><p>{tab==='orders'?(data.orders.length?copy.noOrders:copy.emptyOrders):(data.transactions.length?copy.noTransactions:copy.emptyTransactions)}</p><button type="button" onClick={()=>setFilters(current=>({...current,query:'',status:'all',...(tab==='transactions'?{type:'all'}:{}),page:1}))}>{copy.clearFilters}</button></div>:<div className="op-table-container"><table className={`op-${tab}-table`} role="table"><caption className="op-sr-only">{copy[tab]}</caption><thead role="rowgroup"><tr role="row">{headers.map(key=><th scope="col" role="columnheader" id={`op-column-${key}`} key={key}>{copy[key]}</th>)}</tr></thead><tbody role="rowgroup">{visible.map(record=><tr key={record.id} role="row" data-record={record.id}>{tab==='orders'?<>
      {cell('orderNumber',<bdi className="op-code">{record.number}</bdi>,true)}{cell('patient',localizedName(record.patient,language))}{cell('tests',<ul className="op-test-list">{record.tests.map(test=><li key={test.id}>{localizedName(test,language)}</li>)}</ul>)}{cell('total',<bdi>{money(record.totalCents)}</bdi>)}{cell('paymentStatus',badge(orderPaymentStatus(record,data.transactions)))}{cell('orderStatus',badge(record.status))}{cell('created',<time dateTime={record.createdAt}>{date(record.createdAt)}</time>)}
     </>:<>
      {cell('reference',<bdi className="op-code">{record.reference}</bdi>,true)}{cell('orderNumber',<bdi>{byOrder.get(record.orderId)?.number}</bdi>)}{cell('type',<span className={`op-type op-type-${record.type.toLowerCase()}`}>{copy[record.type]}</span>)}{cell('amount',<bdi>{money(record.amountCents)}</bdi>)}{cell('status',badge(record.status))}{cell('date',<time dateTime={transactionDate(record)}>{date(transactionDate(record))}</time>)}
     </>}</tr>)}</tbody></table></div>}
     <footer className="op-footer"><label>{copy.pageSize}<select value={filters.size} onChange={event=>changeFilter('size',Number(event.target.value))}>{[8,16,32].map(size=><option value={size} key={size}>{number(size)}</option>)}</select></label><nav aria-label={copy[tab]}><button type="button" disabled={page===1} onClick={()=>setFilters(current=>({...current,page:page-1}))}>{copy.previous}</button><span>{copy.page} <bdi>{number(page)} {copy.of} {number(pages)}</bdi></span><button type="button" disabled={page>=pages} onClick={()=>setFilters(current=>({...current,page:page+1}))}>{copy.next}</button></nav></footer>
    </div>
   </section>
  </>}
 </section>
}
