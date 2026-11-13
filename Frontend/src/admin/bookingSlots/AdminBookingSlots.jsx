import { useEffect, useRef, useState } from 'react'
import { CalendarClock, ChevronLeft, ChevronRight, Pencil, Power } from 'lucide-react'
import { bookingSlotsCopy } from './bookingSlotsCopy.js'
import { bookingSlotsService } from './bookingSlotsService.js'
import { available, formatSlotTime, localDate, schedulingDate, occupancy, shiftDate, slotStatus } from './bookingSlotsModel.js'
import BookingSlotForm, { SlotDialog } from './BookingSlotForm.jsx'
import './bookingSlots.css'

export default function AdminBookingSlots({language,service=bookingSlotsService}) {
  const copy=bookingSlotsCopy[language],rtl=language==='ar',today=schedulingDate()
  const [selected,setSelected]=useState(today),[month,setMonth]=useState(today.slice(0,7)),[data,setData]=useState({slots:[],appointments:[]}),[load,setLoad]=useState('loading'),[attempt,setAttempt]=useState(0)
  const [dialog,setDialog]=useState(null),[createdSlot,setCreatedSlot]=useState(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[failed,setFailed]=useState(false)
  const actionLock=useRef(false),calendar=useRef(null),focusDate=useRef(false),createPanel=useRef(null)
  const date=value=>new Intl.DateTimeFormat(language,{dateStyle:'long'}).format(new Date(`${value}T12:00:00`))
  const time=value=>formatSlotTime(value,language)
  const number=value=>new Intl.NumberFormat(language).format(value)
  useEffect(()=>{let alive=true;service.load().then(value=>{if(alive){setData(value);setLoad('ready')}}).catch(()=>{if(alive)setLoad('error')});return()=>{alive=false}},[service,attempt])
  useEffect(()=>{if(focusDate.current){calendar.current?.querySelector(`[data-date="${selected}"]`)?.focus({preventScroll:true});focusDate.current=false}},[selected])
  useEffect(()=>{if(!notice)return undefined;const timer=setTimeout(()=>setNotice(''),4500);return()=>clearTimeout(timer)},[notice])
  const daySlots=data.slots.filter(slot=>slot.date===selected).sort((a,b)=>a.startTime.localeCompare(b.startTime)||a.id.localeCompare(b.id))
  const first=new Date(`${month}-01T12:00:00`),offset=(first.getDay()+6)%7,days=new Date(first.getFullYear(),first.getMonth()+1,0).getDate(),cells=Math.ceil((offset+days)/7)*7
  const datesWithSlots=new Set(data.slots.map(slot=>slot.date))
  function select(value){setSelected(value);setMonth(value.slice(0,7))}
  function changeMonth(step){const value=new Date(`${month}-01T12:00:00`);value.setMonth(value.getMonth()+step);setMonth(localDate(value).slice(0,7))}
  function dateKey(event,value){
    const weekday=(new Date(`${value}T12:00:00`).getDay()+6)%7
    const delta={ArrowLeft:rtl?1:-1,ArrowRight:rtl?-1:1,ArrowUp:-7,ArrowDown:7,Home:-weekday,End:6-weekday}[event.key]
    if(delta===undefined)return;event.preventDefault();focusDate.current=true;select(shiftDate(value,delta))
  }
  function saved(record,message='saved'){setData(current=>({...current,slots:current.slots.some(slot=>slot.id===record.id)?current.slots.map(slot=>slot.id===record.id?record:slot):[...current.slots,record]}));setNotice(message);if(message==='created')setCreatedSlot(record);setDialog(null);setBusy(false);select(record.date)}
  async function toggle(slot){
    if(actionLock.current)return
    if(slot.active){setFailed(false);setDialog({kind:'deactivate',slot});return}
    actionLock.current=true;setBusy(true);setFailed(false)
    try{saved(await service.setActive(slot.id,true))}catch{setNotice('saveError')}finally{actionLock.current=false;setBusy(false)}
  }
  async function deactivate(){
    if(actionLock.current)return;actionLock.current=true;setBusy(true);setFailed(false)
    try{saved(await service.setActive(dialog.slot.id,false))}catch{setFailed(true)}finally{actionLock.current=false;setBusy(false)}
  }
  const headings=['time','capacity','booked','available','status','actions']
  function cell(key,content){return <td key={key} role="cell" headers={`bs-column-${key}`}><span className="bs-cell-label" aria-hidden="true">{copy[key]}</span><div className="bs-cell-value">{content}</div></td>}
  return <section className="admin-booking-slots" aria-label={copy.title}>
    <div className="bs-heading"><span aria-hidden="true"><CalendarClock size={23}/></span><div><h2>{copy.title}</h2><p>{copy.subtitle}</p></div></div>
    {notice&&<p className={notice==='saveError'?'bs-error':'bs-notice'} role="status">{copy[notice]}</p>}
    {load==='loading'?<p role="status">{copy.loading}</p>:load==='error'?<div className="bs-empty" role="alert"><p>{copy.loadError}</p><button type="button" onClick={()=>{setLoad('loading');setAttempt(value=>value+1)}}>{copy.retry}</button></div>:<>
      <div className="bs-workspace"><section className="bs-calendar bs-panel" aria-label={copy.calendar} ref={calendar}>
        <div className="bs-month-heading"><button type="button" aria-label={copy.previousMonth} disabled={busy} onClick={()=>changeMonth(-1)}>{rtl?<ChevronRight size={18}/>:<ChevronLeft size={18}/>}</button><h3 aria-live="polite">{new Intl.DateTimeFormat(language,{month:'long',year:'numeric'}).format(first)}</h3><button type="button" aria-label={copy.nextMonth} disabled={busy} onClick={()=>changeMonth(1)}>{rtl?<ChevronLeft size={18}/>:<ChevronRight size={18}/>}</button></div>
        <div className="bs-weekdays" aria-hidden="true">{Array.from({length:7},(_,index)=><span key={index}>{new Intl.DateTimeFormat(language,{weekday:'short'}).format(new Date(2024,0,1+index))}</span>)}</div>
        <div className="bs-dates">{Array.from({length:cells},(_,index)=>{const day=index-offset+1;if(day<1||day>days)return <span key={index}/>;const value=`${month}-${String(day).padStart(2,'0')}`;return <button type="button" key={value} disabled={busy} data-date={value} className={`${value===selected?'bs-selected ':''}${value===today?'bs-today':''}`} aria-current={value===today?'date':undefined} aria-pressed={value===selected} aria-label={`${date(value)}${datesWithSlots.has(value)?` · ${copy.hasSlots}`:''}`} tabIndex={value===selected||selected.slice(0,7)!==month&&day===1?0:-1} onClick={()=>select(value)} onKeyDown={event=>dateKey(event,value)}><span>{number(day)}</span>{datesWithSlots.has(value)&&<i aria-hidden="true"/>}</button>})}</div>
        <button type="button" className="bs-today-action" disabled={busy} onClick={()=>select(today)}>{copy.today}</button>
      </section>
      <section className="bs-list bs-panel" aria-labelledby="bs-list-title"><h3 id="bs-list-title">{copy.slotsFor} <time dateTime={selected}>{date(selected)}</time></h3>{!daySlots.length?<p className="bs-empty" role="status">{copy.empty}</p>:<div className="bs-table-container"><table role="table"><caption className="bs-sr-only">{copy.slotsFor} {date(selected)}</caption><thead role="rowgroup"><tr role="row">{headings.map(key=><th scope="col" role="columnheader" id={`bs-column-${key}`} key={key}>{copy[key]}</th>)}</tr></thead><tbody role="rowgroup">{daySlots.map(slot=>{const count=occupancy(slot.id,data.appointments),status=slotStatus(slot,data.appointments);return <tr role="row" key={slot.id} data-slot={slot.id}>
        {cell('time',<bdi>{time(slot.startTime)} – {time(slot.endTime)}</bdi>)}{cell('capacity',number(slot.capacity))}{cell('booked',<div className="bs-occupancy"><span>{number(count)} / {number(slot.capacity)}</span><div role="meter" aria-label={copy.occupancy} aria-valuemin={0} aria-valuemax={slot.capacity} aria-valuenow={count}><span style={{inlineSize:`${count/slot.capacity*100}%`}}/></div></div>)}{cell('available',number(available(slot,data.appointments)))}{cell('status',<span className={`bs-badge bs-${status}`}>{copy[status==='available'?'availableStatus':status]}</span>)}{cell('actions',<div className="bs-actions"><button type="button" disabled={busy} aria-label={`${copy.edit}: ${time(slot.startTime)}`} onClick={()=>{setBusy(false);setDialog({kind:'edit',slot})}}><Pencil size={13} aria-hidden="true"/>{copy.edit}</button><button type="button" disabled={busy} aria-label={`${slot.active?copy.deactivate:copy.activate}: ${time(slot.startTime)}`} onClick={()=>toggle(slot)}><Power size={13} aria-hidden="true"/>{slot.active?copy.deactivate:copy.activate}</button></div>)}
      </tr>})}</tbody></table></div>}</section></div>
      <section className="bs-panel bs-create" ref={createPanel}><h3>{copy.create}</h3><BookingSlotForm key={selected} date={selected} data={data} service={service} copy={copy} onBusyChange={setBusy} onSaved={record=>saved(record,'created')}/></section>
    </>}
    {createdSlot&&<SlotDialog title={copy.createdTitle} copy={copy} onClose={()=>setCreatedSlot(null)} onRestoreFocus={()=>createPanel.current?.querySelector('select')?.focus({preventScroll:true})}><div className="bs-result bs-result-success"><p><time dateTime={createdSlot.date}>{date(createdSlot.date)}</time></p><p className="bs-result-time"><bdi>{time(createdSlot.startTime)} – {time(createdSlot.endTime)}</bdi></p><div className="bs-form-actions"><button type="button" className="bs-primary" data-result-action onClick={()=>setCreatedSlot(null)}>{copy.ok}</button></div></div></SlotDialog>}
    {dialog&&<SlotDialog title={dialog.kind==='edit'?copy.editSlot:copy.deactivateTitle} copy={copy} busy={busy} onClose={()=>{if(!busy)setDialog(null)}}>{dialog.kind==='edit'?<BookingSlotForm slot={dialog.slot} date={selected} data={data} service={service} copy={copy} onBusyChange={setBusy} onSaved={saved} onCancel={()=>setDialog(null)}/>:<div className="bs-deactivate"><p><bdi>{date(dialog.slot.date)} · {time(dialog.slot.startTime)} – {time(dialog.slot.endTime)}</bdi></p><p>{copy.deactivateHint}</p>{failed&&<p className="bs-error" role="alert">{copy.saveError}</p>}<div className="bs-form-actions"><button type="button" disabled={busy} onClick={()=>setDialog(null)}>{copy.cancel}</button><button type="button" className="bs-primary" disabled={busy} onClick={deactivate}>{busy?copy.saving:copy.deactivate}</button></div></div>}</SlotDialog>}
  </section>
}
