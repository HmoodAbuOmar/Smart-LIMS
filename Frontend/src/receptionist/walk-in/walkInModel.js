export function testName(test, language) { return test[language === 'ar' ? 'nameAr' : 'nameEn'] || test.name }
export function testMatches(test, search) {
  const needle = search.trim().toLocaleLowerCase()
  return [test.code, test.name, test.nameEn, test.nameAr].some(value => value?.toLocaleLowerCase().includes(needle))
}
export function money(cents, language) { return new Intl.NumberFormat(language === 'ar' ? 'ar-PS' : 'en-GB', { style: 'currency', currency: 'ILS' }).format(cents / 100) }
export function totalCents(tests) { return tests.reduce((sum, test) => sum + test.priceCents, 0) }
export function validTest(test) { return test?.active && test.currency === 'ILS' && Number.isSafeInteger(test.priceCents) && test.priceCents >= 0 }
export function validateSelection(patient, tests) {
  if (!patient?.id) return 'choosePatient'
  if (!tests.length) return 'chooseTests'
  if (tests.some(test => !validTest(test))) return 'testUnavailable'
  if (tests.length > 100 || new Set(tests.map(test => test.id)).size !== tests.length) return 'invalidSelection'
  return null
}
export function reconcileTests(selected, fresh) {
  const byId = new Map(fresh.map(test => [test.id, test]))
  const unavailable = selected.filter(test => !validTest(byId.get(test.id)))
  const changed = selected.filter(test => validTest(byId.get(test.id)) && test.priceCents !== byId.get(test.id).priceCents)
  return { unavailable, changed, tests: selected.map(test => byId.get(test.id) || { ...test, active: false }) }
}
// Confirmed CreateStaffOrderRequest: no source/type, notes, prices or slot ID.
export function staffOrderPayload(patientId, testIds) { return { patientId, testIds: [...testIds] } }
