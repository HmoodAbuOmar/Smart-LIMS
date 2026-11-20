import { schedulingDate, shiftDate, validateSlot } from './bookingSlotsModel.js'
export function createBookingSlotsData(today = schedulingDate()) {
  const slots = [
    {id:'slot-1',date:today,startTime:'09:00',endTime:'09:30',capacity:5,active:true},
    {id:'slot-2',date:today,startTime:'09:30',endTime:'10:00',capacity:2,active:true},
    {id:'slot-3',date:today,startTime:'10:00',endTime:'10:30',capacity:4,active:false},
    {id:'slot-4',date:shiftDate(today,1),startTime:'09:00',endTime:'09:30',capacity:6,active:true},
  ]
  const appointments = ['BOOKED','CHECKED_IN','COMPLETED','CANCELLED','NO_SHOW'].map((status,index)=>({id:`slot-appointment-${index+1}`,slotId:'slot-1',status}))
  appointments.push({id:'slot-appointment-6',slotId:'slot-2',status:'BOOKED'},{id:'slot-appointment-7',slotId:'slot-2',status:'CHECKED_IN'},{id:'slot-appointment-8',slotId:'slot-3',status:'BOOKED'})
  return {slots,appointments}
}
export function createBookingSlotsService(initial = createBookingSlotsData(), { delay = 120, now = () => new Date() } = {}) {
  const data = structuredClone(initial)
  let sequence = 0
  const wait = () => new Promise(resolve=>setTimeout(resolve,delay))
  function invalid(fields) { const error=new Error('Invalid slot'); error.fields=fields; throw error }
  function find(id) { const record=data.slots.find(slot=>slot.id===id); if(!record) invalid({_form:'notFound'}); return record }
  return {
    async load() { await wait(); return structuredClone(data) },
    async save(values,id) {
      await wait(); const original=id ? find(id) : undefined
      const errors=validateSlot(values,data.slots,data.appointments,original,now()); if(Object.keys(errors).length) invalid(errors)
      let nextId; if(!original) { do {nextId=`slot-added-${++sequence}`} while(data.slots.some(slot=>slot.id===nextId)) }
      const record=original || {id:nextId,active:true}
      Object.assign(record,{date:values.date,startTime:values.startTime,endTime:values.endTime,capacity:Number(values.capacity)})
      if(!original) data.slots.push(record)
      return structuredClone(record)
    },
    async setActive(id,active) { await wait(); const slot=find(id); slot.active=Boolean(active); return structuredClone(slot) },
  }
}
export const bookingSlotsService=createBookingSlotsService()
