import { canCheckIn, canMarkNoShow, dayAppointments, todayDate } from '../today/todayModel.js'
import { activeAppointment, canCancel, canMove, occupancy, schedulingInstant, validDate } from './appointmentsModel.js'

export function createAppointmentsStore({ initial = [], now = () => new Date(), delay = 140, beforeWrite = async () => {}, storage } = {}) {
  const storageKey = 'smart-lims.receptionist-appointments.v1'
  let restored
  try { const value = JSON.parse(storage?.getItem(storageKey) || 'null'); if (Array.isArray(value?.data) && Array.isArray(value?.slots) && Array.isArray(value?.keys)) restored = value } catch { /* No usable preview snapshot. */ }
  const data = structuredClone(restored?.data || initial), slots = new Map(restored?.slots || []), keys = new Map(restored?.keys || []), cancelledOrders = new Set(restored?.cancelledOrders || [])
  const fail = code => { const error = new Error(code); error.code = code; throw error }
  const wait = () => new Promise(resolve => setTimeout(resolve, delay))
  const slotId = record => record.slotId || `r07-existing-${record.id}`
  for (const record of data) if (!slots.has(slotId(record))) slots.set(slotId(record), { id: slotId(record), startsAt: record.startsAt, endsAt: record.endsAt, capacity: 2, active: true })
  const counted = () => data.map(record => ({ ...record, slotId: slotId(record) }))
  function save(next, nextKeys = keys, nextCancelled = cancelledOrders) {
    storage?.setItem(storageKey, JSON.stringify({ data: next, slots: [...slots], keys: [...nextKeys], cancelledOrders: [...nextCancelled] }))
    data.splice(0, data.length, ...next)
    if (nextKeys !== keys) { keys.clear(); for (const entry of nextKeys) keys.set(...entry) }
    if (nextCancelled !== cancelledOrders) { cancelledOrders.clear(); for (const id of nextCancelled) cancelledOrders.add(id) }
  }
  function ensureSlots(date) {
    if (!validDate(date)) fail('INVALID_DATE')
    for (let hour = 9; hour < 18; hour++) {
      const startsAt = schedulingInstant(date, `${String(hour).padStart(2, '0')}:00`), endsAt = schedulingInstant(date, `${String(hour).padStart(2, '0')}:30`)
      if (startsAt === null || endsAt === null) continue
      const start = new Date(startsAt).toISOString(), end = new Date(endsAt).toISOString()
      if ([...slots.values()].some(slot => slot.startsAt < end && start < slot.endsAt)) continue
      const id = `r07-slot-${date}-${hour}`
      slots.set(id, { id, startsAt: start, endsAt: end, active: true, capacity: hour === 10 ? 1 : 2 })
    }
    return [...slots.values()].filter(slot => todayDate(new Date(slot.startsAt)) === date).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  }
  function available(slot, patientId, exceptId) {
    if (!slot?.active || Date.parse(slot.startsAt) <= now().getTime() || occupancy(slot.id, counted()) >= slot.capacity) fail('SLOT_FULL')
    if (data.some(record => record.id !== exceptId && activeAppointment(record) && record.patient?.id === patientId && record.startsAt < slot.endsAt && slot.startsAt < record.endsAt)) fail('PATIENT_CONFLICT')
  }
  async function change(id, version, action) {
    await wait(); await beforeWrite(action, id)
    const record = data.find(item => item.id === id)
    if (!record || record.version !== version || todayDate(new Date(record.startsAt)) !== todayDate(now())) fail('APPOINTMENT_CHANGED')
    if (action === 'checkIn' ? !canCheckIn(record) : !canMarkNoShow(record, now())) fail('APPOINTMENT_STATE_CONFLICT')
    const updated = { ...record, status: action === 'checkIn' ? 'CHECKED_IN' : 'NO_SHOW', version: record.version + 1, ...(action === 'checkIn' ? { arrivedAt: now().toISOString() } : {}) }
    save(data.map(item => item.id === id ? updated : item)); return structuredClone(updated)
  }
  return {
    async load() { await wait(); return structuredClone(data) },
    checkIn: (id, version) => change(id, version, 'checkIn'), markNoShow: (id, version) => change(id, version, 'noShow'),
    async slots(date) { await wait(); return structuredClone(ensureSlots(date).map(slot => ({ ...slot, booked: occupancy(slot.id, counted()), remainingCapacity: Math.max(0, slot.capacity - occupancy(slot.id, counted())) }))) },
    async day(date) { await wait(); ensureSlots(date); return structuredClone(dayAppointments(data, date).map(record => ({ ...record, slotId: slotId(record), capacity: slots.get(slotId(record)).capacity, booked: occupancy(slotId(record), counted()) }))) },
    async book({ order, patient, slotId: targetId, typeId, idempotencyKey }) {
      await wait(); await beforeWrite('book', targetId)
      const fingerprint = JSON.stringify({ orderId: order.id, targetId, typeId })
      if (keys.has(idempotencyKey)) { const previous = keys.get(idempotencyKey); if (previous.fingerprint !== fingerprint) fail('APPOINTMENT_CHANGED'); return structuredClone(data.find(record => record.id === previous.id)) }
      if (!idempotencyKey || typeId !== 'r07-collection' || order.status !== 'PENDING' || cancelledOrders.has(order.id) || !order.items?.length || data.some(record => record.orderId === order.id && activeAppointment(record))) fail('ORDER_NOT_BOOKABLE')
      const slot = slots.get(targetId); available(slot, patient.id)
      const record = { id: `r07-appointment-${crypto.randomUUID()}`, orderId: order.id, orderNumber: order.orderNumber, orderStatus: order.status, orderItemIds: order.items.map(item => item.id || item.labTestId), patient: { id: patient.id, fileNumber: patient.patientNumber, nameEn: patient.nameEn || patient.fullName, nameAr: patient.nameAr || patient.fullName }, typeId, slotId: targetId, startsAt: slot.startsAt, endsAt: slot.endsAt, status: 'BOOKED', arrivedAt: null, version: 0, checkInEligible: true, noShowSupported: true }
      const nextKeys = new Map(keys); nextKeys.set(idempotencyKey, { id: record.id, fingerprint }); save([...data, record], nextKeys); return structuredClone(record)
    },
    async reschedule(id, targetId, expectedVersion) {
      await wait(); await beforeWrite('reschedule', id)
      const record = data.find(item => item.id === id)
      if (!record || record.version !== expectedVersion) fail('APPOINTMENT_CHANGED')
      if (!canMove(record, now())) fail('APPOINTMENT_STATE_CONFLICT')
      if (slotId(record) === targetId) return structuredClone(record)
      const target = slots.get(targetId); available(target, record.patient.id, id)
      const updated = { ...record, slotId: targetId, startsAt: target.startsAt, endsAt: target.endsAt, version: record.version + 1 }
      save(data.map(item => item.id === id ? updated : item)); return structuredClone(updated)
    },
    async cancel(id, reason, expectedVersion) {
      await wait(); await beforeWrite('cancel', id)
      if (!reason?.trim() || reason.trim().length > 1000) fail('REASON_REQUIRED')
      const record = data.find(item => item.id === id)
      if (!record || record.version !== expectedVersion) fail('APPOINTMENT_CHANGED')
      if (!canCancel(record, now())) fail('APPOINTMENT_STATE_CONFLICT')
      const updated = { ...record, status: 'CANCELLED', cancellationReason: reason.trim(), version: record.version + 1 }
      save(data.map(item => item.id === id ? updated : item)); return structuredClone(updated)
    },
    async cancelForOrder(orderId, reason, commit) {
      await wait(); await beforeWrite('cancelOrder', orderId)
      if (data.some(record => record.orderId === orderId && record.status === 'CHECKED_IN')) fail('APPOINTMENT_STATE_CONFLICT')
      const next = data.map(record => record.orderId === orderId && record.status === 'BOOKED' ? { ...record, status: 'CANCELLED', cancellationReason: reason, version: record.version + 1 } : record)
      // Persist appointment changes before committing the order; roll back if the order write fails.
      const previous = structuredClone(data)
      const previousCancelled = new Set(cancelledOrders)
      save(next, keys, new Set([...cancelledOrders, orderId]))
      try { return commit() } catch (error) { save(previous, keys, previousCancelled); throw error }
    },
  }
}
