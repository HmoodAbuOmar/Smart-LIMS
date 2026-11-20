import assert from 'node:assert/strict'
import { createBookingSlotsData, createBookingSlotsService } from './bookingSlotsService.js'
import { available, localDate, occupancy, overlap, shiftDate, slotStatus, validateSlot, validDate } from './bookingSlotsModel.js'
import { bookingSlotsCopy } from './bookingSlotsCopy.js'
const now=new Date('2030-06-10T08:00:00'),data=createBookingSlotsData('2030-06-10'),service=createBookingSlotsService(data,{delay:0,now:()=>now})
assert.equal(validDate('2030-02-30'),false);assert.equal(validDate('2032-02-29'),true);assert.equal(shiftDate('2030-12-31',1),'2031-01-01');assert.match(localDate(),/^\d{4}-\d{2}-\d{2}$/)
assert.equal(occupancy('slot-1',data.appointments),2);assert.equal(available(data.slots[0],data.appointments),3);assert.equal(slotStatus(data.slots[1],data.appointments),'full');assert.equal(slotStatus(data.slots[2],data.appointments),'inactive')
const values={date:'2030-06-12',startTime:'11:00',endTime:'11:30',capacity:'3'}
assert.deepEqual(validateSlot(values,data.slots,data.appointments,undefined,now),{})
for(const capacity of ['0','-1','1.5','','NaN','9007199254740992'])assert.equal(validateSlot({...values,capacity},[],[],undefined,now).capacity,'capacity')
assert.equal(validateSlot({...values,endTime:'10:00'},[],[],undefined,now).endTime,'endAfterStart')
assert.equal(validateSlot({...values,date:'2030-02-30'},[],[],undefined,now).date,'date')
assert.equal(validateSlot({...values,startTime:'25:00'},[],[],undefined,now).startTime,'time')
assert.equal(validateSlot({...values,date:'2020-01-01'},[],[],undefined,now).startTime,'future')
assert.equal(overlap(values,{...values,startTime:'11:30',endTime:'12:00'}),false)
const first=await service.save(values)
await assert.rejects(service.save({...values,startTime:'11:15'}),error=>error.fields._form==='overlap')
await service.setActive(first.id,false)
await assert.rejects(service.save({...values,startTime:'11:15'}),error=>error.fields._form==='overlap')
await service.save({...values,startTime:'11:30',endTime:'12:00'})
const before=await service.load(),booked=before.slots[0]
await assert.rejects(service.save({...booked,capacity:1},booked.id),error=>error.fields.capacity==='belowBooked')
await assert.rejects(service.save({...booked,startTime:'08:30'},booked.id),error=>error.fields._form==='timeLocked')
const updated=await service.save({...booked,capacity:2},booked.id);assert.equal(updated.capacity,2)
await service.setActive(booked.id,false);assert.equal((await service.load()).slots[0].active,false)
assert.deepEqual((await service.load()).appointments,before.appointments)
await service.setActive(booked.id,true)
const free=before.slots[3];assert.equal((await service.save({...free,startTime:'12:00',endTime:'12:30'},free.id)).id,free.id)
const isolated=await service.load();isolated.slots.length=0;assert.ok((await service.load()).slots.length)
assert.deepEqual(Object.keys(bookingSlotsCopy.en),Object.keys(bookingSlotsCopy.ar));assert.deepEqual(Object.keys(bookingSlotsCopy.en.errors),Object.keys(bookingSlotsCopy.ar.errors))
console.log('PASS: occupancy/status filtering, positive integer capacity, future dates, end-after-start, all-slot overlaps, adjacency, capacity floor, booked-time lock, unbooked edits, stable IDs, deactivation preserving every appointment, session isolation and bilingual copy.')

// 12-hour conversion and scheduling-zone validation do not depend on browser locale.
const {from24Hour,to24Hour,formatSlotTime,schedulingDate,schedulingInstant}=await import('./bookingSlotsModel.js')
assert.deepEqual(from24Hour('00:00'),{hour:'12',minute:'00',period:'AM'})
assert.deepEqual(from24Hour('12:00'),{hour:'12',minute:'00',period:'PM'})
assert.equal(to24Hour({hour:'12',minute:'00',period:'AM'}),'00:00')
assert.equal(to24Hour({hour:'12',minute:'00',period:'PM'}),'12:00')
assert.equal(to24Hour({hour:'07',minute:'04',period:'PM'}),'19:04')
assert.equal(to24Hour({hour:'',minute:'04',period:'PM'}),'')
assert.equal(to24Hour({hour:'07',minute:'60',period:'PM'}),'')
for(let hour=0;hour<24;hour++)for(let minute=0;minute<60;minute++){const value=`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;assert.equal(to24Hour(from24Hour(value)),value)}
assert.equal(formatSlotTime('19:04','en'),'07:04 PM');assert.equal(formatSlotTime('00:00','en'),'12:00 AM');assert.equal(formatSlotTime('12:00','en'),'12:00 PM')
assert.ok(formatSlotTime('19:04','ar').endsWith(' م'));assert.ok(formatSlotTime('00:00','ar').endsWith(' ص'))
const labNow=new Date('2030-06-10T18:00:00Z') // 21:00 in the scheduling timezone.
assert.equal(schedulingDate(labNow),'2030-06-10')
assert.equal(validateSlot({...values,date:'2030-06-10',startTime:'19:04',endTime:'19:09'},[],[],undefined,labNow).startTime,'future')
assert.deepEqual(validateSlot({...values,date:'2030-06-11',startTime:'19:04',endTime:'19:09'},[],[],undefined,labNow),{})
assert.deepEqual(validateSlot({...values,date:'2030-06-11',startTime:'00:00',endTime:'00:05'},[],[],undefined,labNow),{})
assert.deepEqual(validateSlot({...values,date:'2030-06-11',startTime:'12:00',endTime:'12:05'},[],[],undefined,labNow),{})
assert.equal(new Date(schedulingInstant('2030-06-11','19:04')).toISOString(),'2030-06-11T16:04:00.000Z')
assert.equal(schedulingInstant('2026-03-27','02:30'),null)
console.log('PASS: every minute round-trips between 12h/24h, midnight/noon, explicit EN/AR periods, future-date PM validation, Asia/Jerusalem instants and DST gaps.')
