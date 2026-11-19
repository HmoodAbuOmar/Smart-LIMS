export function serviceUnavailable() { const error = new Error('Receptionist service unavailable'); error.code = 'RECEPTIONIST_UNAVAILABLE'; return error }
let developmentService
async function source() {
  if (!import.meta.env?.DEV) throw serviceUnavailable()
  developmentService ??= import('./todayDevelopmentService.js').then(module => module.createTodayService({ storage: window.sessionStorage }))
  return developmentService
}
export const todayService = {
  day: date => source().then(service=>service.day(date)),
  slots: date => source().then(service=>service.slots(date)),
  book: request => source().then(service=>service.book(request)),
  reschedule: (...args) => source().then(service=>service.reschedule(...args)),
  cancel: (...args) => source().then(service=>service.cancel(...args)),
  cancelForOrder: (...args) => source().then(service=>service.cancelForOrder(...args)),
  load: async () => (await source()).load(),
  checkIn: async (id, version) => (await source()).checkIn(id, version),
  markNoShow: async (id, version) => (await source()).markNoShow(id, version),
}
