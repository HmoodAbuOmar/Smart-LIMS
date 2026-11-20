import { canCheckIn, todayDate } from '../today/todayModel.js'
export { occupancy, schedulingInstant, validDate } from '../../admin/bookingSlots/bookingSlotsModel.js'
export const activeAppointment = record => ['BOOKED', 'CONFIRMED', 'CHECKED_IN'].includes(record.status)
export const bookableOrder = (order, appointments = []) => order.status === 'PENDING' && !!order.items?.length && !appointments.some(record => record.orderId === order.id && activeAppointment(record))
export function canMove(record, now = new Date()) { return record.status === 'BOOKED' && record.orderStatus === 'PENDING' && Date.parse(record.startsAt) > now.getTime() }
export function canCancel(record, now = new Date()) { return !!record.orderId && record.status === 'BOOKED' && Date.parse(record.startsAt) > now.getTime() }
export function canArrive(record, now = new Date()) { return canCheckIn(record) && todayDate(new Date(record.startsAt)) === todayDate(now) }
export const displayStatus = status => status === 'CONFIRMED' ? 'BOOKED' : status
