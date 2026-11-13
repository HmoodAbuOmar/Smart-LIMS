export function serviceUnavailable() { const error = new Error('Receptionist service unavailable'); error.code = 'RECEPTIONIST_UNAVAILABLE'; return error }
let developmentService
async function source() {
  if (!import.meta.env?.DEV) throw serviceUnavailable()
  developmentService ??= import('./todayDevelopmentService.js').then(module => module.createTodayService())
  return developmentService
}
export const todayService = {
  load: async () => (await source()).load(),
  checkIn: async (id, version) => (await source()).checkIn(id, version),
  markNoShow: async (id, version) => (await source()).markNoShow(id, version),
}
