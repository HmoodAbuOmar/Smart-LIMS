import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { from24Hour, occupancy, to24Hour, validateSlot } from './bookingSlotsModel.js'

export function SlotDialog({title,copy,busy=false,onClose,onRestoreFocus,children}) {
  const root=useRef(null)
  const restore=useRef(onRestoreFocus)
  useEffect(()=>{restore.current=onRestoreFocus},[onRestoreFocus])
  useEffect(()=>{
    const dialog=root.current,focus=document.activeElement,overflow=document.body.style.overflow
    dialog.showModal();document.body.style.overflow='hidden'
    ;(dialog.querySelector('[data-result-action]')||dialog.querySelector('button,input,select'))?.focus()
    return()=>{dialog.close();document.body.style.overflow=overflow;if(restore.current)restore.current();else if(focus?.isConnected)focus.focus({preventScroll:true})}
  },[])
  return <dialog ref={root} className="bs-dialog" aria-labelledby="bs-dialog-title" onCancel={event=>{event.preventDefault();if(!busy)onClose()}} onKeyDown={event=>{
    if(event.key!=='Tab')return
    const controls=[...event.currentTarget.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')],first=controls[0],last=controls.at(-1)
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
  }}><header><h3 id="bs-dialog-title">{title}</h3><button type="button" aria-label={copy.close} disabled={busy} onClick={onClose}><X size={18} aria-hidden="true" /></button></header>{children}</dialog>
}
const emptyTimes=()=>({startTime:from24Hour(''),endTime:from24Hour('')})
export default function BookingSlotForm({date,slot,data,service,copy,onSaved,onCancel,onBusyChange}) {
  const [values,setValues]=useState(()=>slot?{date:slot.date,startTime:slot.startTime,endTime:slot.endTime,capacity:String(slot.capacity)}:{date,startTime:'',endTime:'',capacity:''})
  const [times,setTimes]=useState(()=>slot?{startTime:from24Hour(slot.startTime),endTime:from24Hour(slot.endTime)}:emptyTimes())
  const [errors,setErrors]=useState({}),[saving,setSaving]=useState(false),[failed,setFailed]=useState(false),[result,setResult]=useState(null)
  const lock=useRef(false),mounted=useRef(false),form=useRef(null),returnTarget=useRef(null),locked=slot&&occupancy(slot.id,data.appointments)>0,prefix=slot?'bs-edit':'bs-create'
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
  useEffect(()=>{onBusyChange?.(saving)},[saving,onBusyChange])
  const update=(key,value)=>{setValues(current=>({...current,[key]:value}));setErrors(current=>({...current,[key]:undefined,_form:undefined}));setFailed(false)}
  function updateTime(key,part,value){setTimes(current=>({...current,[key]:{...current[key],[part]:value}}));setErrors(current=>({...current,[key]:undefined,_form:undefined}));setFailed(false)}
  function showFailure(fields) {
    const key=Object.keys(fields).find(key=>key!=='_form')||(fields._form?'startTime':null)
    const name=key==='startTime'||key==='endTime'?`${key}-${times[key].hour&&!times[key].minute?'minute':'hour'}`:key
    returnTarget.current=name?form.current.querySelector(`[name="${name}"]`):form.current.querySelector('button[type=submit]')
    setResult({fields})
  }
  function restoreField(){if(returnTarget.current?.isConnected)returnTarget.current.focus({preventScroll:true})}
  async function submit(event){
    event.preventDefault();if(lock.current||result)return
    const payload={...values,startTime:to24Hour(times.startTime),endTime:to24Hour(times.endTime)}
    const validation=validateSlot(payload,data.slots,data.appointments,slot);setErrors(validation)
    if(Object.keys(validation).length){
      if(!slot)showFailure(validation)
      else {const key=Object.keys(validation)[0];form.current.querySelector(`[name="${key==='startTime'||key==='endTime'?`${key}-hour`:key}"]`)?.focus()}
      return
    }
    lock.current=true;setSaving(true);setFailed(false)
    try{
      const saved=await service.save(payload,slot?.id)
      if(mounted.current){if(!slot){setValues({date:saved.date,startTime:'',endTime:'',capacity:''});setTimes(emptyTimes())}onSaved(saved)}
    }catch(error){if(mounted.current){if(error.fields)setErrors(error.fields);else setFailed(true);if(!slot)showFailure(error.fields||{})}}
    finally{lock.current=false;if(mounted.current)setSaving(false)}
  }
  function timeField(key){
    const disabled=saving||(locked&&key!=='capacity'),errorId=`${prefix}-${key}-error`
    return <div className="bs-time-parts" role="group" aria-labelledby={`${prefix}-${key}-label`}>
      {['hour','minute','period'].map(part=><select key={part} id={`${prefix}-${key}-${part}`} name={`${key}-${part}`} aria-label={`${copy[key]} — ${copy[part]}`} dir="ltr" required disabled={disabled} value={times[key][part]} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key]?errorId:locked?'bs-time-lock':undefined} onChange={event=>updateTime(key,part,event.target.value)}>
        {part!=='period'&&<option value="">{copy[part]}</option>}
        {(part==='period'?['AM','PM']:Array.from({length:part==='hour'?12:60},(_,index)=>String(part==='hour'?index+1:index).padStart(2,'0'))).map(value=><option value={value} key={value}>{part==='period'?copy[value]:value}</option>)}
      </select>)}
    </div>
  }
  return <form ref={form} className="bs-form" aria-label={slot?copy.editSlot:copy.create} aria-busy={saving} noValidate onSubmit={submit}>
    {locked&&<p className="bs-note" id="bs-time-lock">{copy.locked}</p>}
    <div className="bs-form-fields">{['date','startTime','endTime','capacity'].map(key=><div className="bs-field" key={key}><label id={`${prefix}-${key}-label`} htmlFor={`${prefix}-${key}${key==='startTime'||key==='endTime'?'-hour':''}`}>{copy[key]} <span aria-hidden="true">*</span></label>
      {key==='startTime'||key==='endTime'?timeField(key):<input id={`${prefix}-${key}`} name={key} type={key==='date'?'date':'text'} inputMode={key==='capacity'?'numeric':undefined} dir="ltr" required value={values[key]} disabled={saving||(locked&&key!=='capacity')} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key]?`${prefix}-${key}-error`:locked&&key!=='capacity'?'bs-time-lock':undefined} onChange={event=>update(key,event.target.value)}/>}
      {errors[key]&&<span className="bs-error" role="alert" id={`${prefix}-${key}-error`}>{copy.errors[errors[key]]}</span>}</div>)}</div>
    {errors._form&&<p className="bs-error" role="alert">{copy.errors[errors._form]}</p>}{failed&&<p className="bs-error" role="alert">{copy.saveError}</p>}
    <div className="bs-form-actions"><button type="button" disabled={saving} onClick={()=>{if(!slot){setValues({date,startTime:'',endTime:'',capacity:''});setTimes(emptyTimes());setErrors({});setFailed(false)}onCancel?.()}}>{copy.cancel}</button><button type="submit" className="bs-primary" disabled={saving}>{saving?copy.saving:slot?copy.save:copy.create}</button></div>
    {result&&<SlotDialog title={copy.createFailedTitle} copy={copy} onClose={()=>setResult(null)} onRestoreFocus={restoreField}><div className="bs-result bs-result-error"><p>{Object.keys(result.fields).length?[...new Set(Object.values(result.fields))].map(code=>copy.errors[code]).join(' '):copy.saveError}</p><div className="bs-form-actions"><button type="button" className="bs-primary" data-result-action onClick={()=>setResult(null)}>{copy.backToForm}</button></div></div></SlotDialog>}
  </form>
}
