export function localDate(value = new Date()) { return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}` }
export function shiftDate(date, days) { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate()+days); return localDate(value) }
export function validDate(date) { const value = new Date(`${date}T12:00:00`); return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= '0001-01-01' && !Number.isNaN(value.getTime()) && localDate(value) === date }
export const validTime = time => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)
// The laboratory scheduling zone matches AppointmentMapping.LAB_ZONE.
export const SCHEDULING_TIME_ZONE = 'Asia/Jerusalem'
const clock = new Intl.DateTimeFormat('en-GB', { timeZone:SCHEDULING_TIME_ZONE, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' })
function zonedParts(value) { return Object.fromEntries(clock.formatToParts(value).filter(part=>part.type!=='literal').map(part=>[part.type,part.value])) }
export function schedulingDate(value = new Date()) { const p=zonedParts(value); return `${p.year}-${p.month}-${p.day}` }
export function from24Hour(value) {
  if(!validTime(value || '')) return {hour:'',minute:'',period:'AM'}
  const [hour,minute]=value.split(':');return {hour:String(Number(hour)%12 || 12).padStart(2,'0'),minute,period:Number(hour)<12?'AM':'PM'}
}
export function to24Hour({hour,minute,period}) {
  if(!/^(?:0?[1-9]|1[0-2])$/.test(hour) || !/^[0-5]\d$/.test(minute) || !['AM','PM'].includes(period)) return ''
  return `${String(Number(hour)%12+(period==='PM'?12:0)).padStart(2,'0')}:${minute}`
}
export function formatSlotTime(value,language) {
  const p=from24Hour(value);if(!p.hour)return '—'
  const number=new Intl.NumberFormat(language,{minimumIntegerDigits:2,useGrouping:false})
  return `${number.format(Number(p.hour))}:${number.format(Number(p.minute))} ${language==='ar'?(p.period==='AM'?'ص':'م'):p.period}`
}
function utcValue(year,month,day,hour,minute,second=0) {
  const value=new Date(0);value.setUTCFullYear(Number(year),Number(month)-1,Number(day));value.setUTCHours(Number(hour),Number(minute),Number(second),0);return value.getTime()
}
export function schedulingInstant(date,time) {
  if(!validDate(date)||!validTime(time))return null
  const [year,month,day]=date.split('-'),[hour,minute]=time.split(':'),wall=utcValue(year,month,day,hour,minute),candidates=new Set()
  // Check both offsets around a DST transition. Gaps are invalid; repeated times
  // resolve to their first occurrence, rather than depending on the host zone.
  for(const hours of [-36,-24,-12,0,12,24,36]) {
    const probe=wall+hours*3600000,p=zonedParts(new Date(probe))
    const offset=utcValue(p.year,p.month,p.day,p.hour,p.minute,p.second)-probe,candidate=wall-offset
    const actual=zonedParts(new Date(candidate))
    if(`${actual.year}-${actual.month}-${actual.day}`===date&&`${actual.hour}:${actual.minute}`===time)candidates.add(candidate)
  }
  return candidates.size?Math.min(...candidates):null
}
export const occupancy = (slotId, appointments) => appointments.filter(item => item.slotId === slotId && ['BOOKED','CHECKED_IN'].includes(item.status)).length
export const available = (slot, appointments) => slot.capacity - occupancy(slot.id, appointments)
export const slotStatus = (slot, appointments) => !slot.active ? 'inactive' : available(slot, appointments) === 0 ? 'full' : 'available'
export const overlap = (a,b) => a.date === b.date && a.startTime < b.endTime && b.startTime < a.endTime
export function validateSlot(values, slots, appointments, original, now = new Date()) {
  const errors = {}, count = original ? occupancy(original.id, appointments) : 0
  if (!validDate(values.date || '')) errors.date = 'date'
  if (!validTime(values.startTime || '')) errors.startTime = 'time'
  if (!validTime(values.endTime || '')) errors.endTime = 'time'
  if (!errors.startTime && !errors.endTime && values.endTime <= values.startTime) errors.endTime = 'endAfterStart'
  if (!/^\d+$/.test(String(values.capacity)) || !Number.isSafeInteger(Number(values.capacity)) || Number(values.capacity) <= 0) errors.capacity = 'capacity'
  else if (Number(values.capacity) < count) errors.capacity = 'belowBooked'
  const changedTime = !original || ['date','startTime','endTime'].some(key => values[key] !== original[key])
  if (original && count && changedTime) errors._form = 'timeLocked'
  if (changedTime && !errors.date && !errors.startTime) {
    const instant=schedulingInstant(values.date,values.startTime)
    if(instant===null)errors.startTime='time'
    else if(instant<=now.getTime())errors.startTime='future'
  }
  if (!errors.date && !errors.startTime && !errors.endTime && slots.some(slot => slot.id !== original?.id && overlap(values,slot))) errors._form = 'overlap'
  return errors
}
