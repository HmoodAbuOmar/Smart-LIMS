export async function loadReportSources() {
  if (!import.meta.env?.DEV) {
    const error = new Error('Reporting service unavailable')
    error.code = 'REPORTS_UNAVAILABLE'
    throw error
  }
  const [{ operationsPaymentsService }, { bookingSlotsService }, { demoSampleEvents }] = await Promise.all([
    import('../operationsPayments/operationsPaymentsService.js'),
    import('../bookingSlots/bookingSlotsService.js'),
    import('../adminDemoData.js'),
  ])
  const [operations, booking] = await Promise.all([operationsPaymentsService.load(), bookingSlotsService.load()])
  const slots = new Map(booking.slots.map(slot => [slot.id, slot]))
  return {
    ...operations,
    appointments: booking.appointments.map(appointment => ({ ...appointment, scheduledDate: slots.get(appointment.slotId)?.date })),
    samples: structuredClone(demoSampleEvents),
  }
}
export const reportsService = { load: loadReportSources }
