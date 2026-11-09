import { todayValue } from './adminPatientsModel.js'
export { todayValue }
export const catalogName = (record, language) => record?.[language === 'ar' ? 'nameAr' : 'nameEn'] || ''
export const catalogText = (record, field, language) => record?.[field + (language === 'ar' ? 'Ar' : 'En')] || ''
export const nullable = value => value === null || value === undefined || typeof value === 'string' && value.trim() === '' ? null : value
export function validDate(value) {
  const date = new Date(`${value}T00:00:00Z`)
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '0001-01-01' && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
const trim = value => typeof value === 'string' ? value.trim() : ''
function required(errors, values, fields, maximum) {
  fields.forEach(field => {
    if (!trim(values[field])) errors[field] = 'required'
    else if (maximum && [...trim(values[field])].length > maximum) errors[field] = 'nameLength'
  })
}
export function validateTest(values, tests, id) {
  const errors = {}
  required(errors, values, ['code', 'nameEn', 'nameAr'])
  if ([...trim(values.code)].length > 30) errors.code = 'codeLength'
  for (const field of ['nameEn', 'nameAr']) if ([...trim(values[field])].length > 150) errors[field] = 'nameLength'
  required(errors, values, ['sampleType'])
  if ([...trim(values.sampleType)].length > 40) errors.sampleType = 'sampleLength'
  if (tests.some(test => test.id !== id && test.code === trim(values.code))) errors.code = 'duplicateCode'
  const price = String(values.price ?? '').trim()
  if (!price) errors.price = 'required'
  else if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(price) || !Number.isSafeInteger(Math.round(Number(price) * 100))) errors.price = 'price'
  return errors
}
export function validateParameter(values, parameters, testId, original, ranges = []) {
  const errors = {}
  required(errors, values, ['code', 'nameEn', 'nameAr'])
  if (parameters.some(item => item.testId === testId && item.id !== original?.id && item.code === trim(values.code))) errors.code = 'duplicateCode'
  if (!['NUMERIC', 'TEXT'].includes(values.valueType)) errors.valueType = 'valueType'
  if (nullable(values.displayOrder) === null || !Number.isSafeInteger(Number(values.displayOrder)) || Number(values.displayOrder) < 0) errors.displayOrder = 'integer'
  if (original?.historicallyUsed) {
    for (const field of ['unit', 'methodEn', 'methodAr', 'valueType']) if (trim(values[field]) !== trim(original[field])) errors[field] = 'usedDefinition'
  } else if (original && values.valueType !== original.valueType && ranges.some(range => range.parameterId === original.id)) errors.valueType = 'hasRanges'
  return errors
}
export function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return (aStart ?? -Infinity) < (bEnd ?? Infinity) && (bStart ?? -Infinity) < (aEnd ?? Infinity)
}
export function applicabilityOverlaps(a, b) {
  const stamp = value => nullable(value) === null ? null : new Date(`${value}T00:00:00Z`).getTime()
  return a.parameterId === b.parameterId && a.sex === b.sex &&
    intervalsOverlap(a.minAgeDays, a.maxAgeDays, b.minAgeDays, b.maxAgeDays) &&
    intervalsOverlap(stamp(a.validFrom), stamp(a.validTo), stamp(b.validFrom), stamp(b.validTo))
}
export function rangeFields(values, parameterId) {
  const num = value => nullable(value) === null ? null : Number(value)
  return { parameterId, sex: values.sex, minAgeDays: num(values.minAgeDays), maxAgeDays: num(values.maxAgeDays), lower: num(values.lower), upper: num(values.upper), referenceEn: trim(values.referenceEn), referenceAr: trim(values.referenceAr), validFrom: nullable(values.validFrom), validTo: nullable(values.validTo) }
}
export function validateRange(values, parameter, ranges, id) {
  const errors = {}
  if (!parameter) return { _form: 'missingParent' }
  if (!['MALE', 'FEMALE', 'ANY'].includes(values.sex)) errors.sex = 'sex'
  for (const field of ['minAgeDays', 'maxAgeDays']) {
    if (nullable(values[field]) !== null && (!Number.isSafeInteger(Number(values[field])) || Number(values[field]) < 0)) errors[field] = 'integer'
  }
  if (nullable(values.minAgeDays) !== null && nullable(values.maxAgeDays) !== null && Number(values.maxAgeDays) <= Number(values.minAgeDays)) errors.maxAgeDays = 'interval'
  for (const field of ['validFrom', 'validTo']) if (nullable(values[field]) !== null && !validDate(values[field])) errors[field] = 'date'
  if (values.validFrom && values.validTo && values.validTo <= values.validFrom) errors.validTo = 'interval'
  if (parameter.valueType === 'NUMERIC') {
    if (trim(values.referenceEn) || trim(values.referenceAr)) errors._form = 'numericOnly'
    if (nullable(values.lower) === null && nullable(values.upper) === null) errors.lower = 'referenceRequired'
    for (const field of ['lower', 'upper']) if (nullable(values[field]) !== null && !Number.isFinite(Number(values[field]))) errors[field] = 'number'
    if (nullable(values.lower) !== null && nullable(values.upper) !== null && Number(values.lower) > Number(values.upper)) errors.upper = 'limits'
  } else {
    required(errors, values, ['referenceEn', 'referenceAr'])
    if (nullable(values.lower) !== null || nullable(values.upper) !== null) errors._form = 'textOnly'
  }
  if (!Object.keys(errors).length) {
    const candidate = rangeFields(values, parameter.id)
    if (ranges.some(range => range.id !== id && applicabilityOverlaps(candidate, range))) errors._form = 'overlap'
  }
  return errors
}
export function rangeValidity(range, today = todayValue()) {
  if (range.validTo && range.validTo <= today) return 'expired'
  if (range.validFrom && range.validFrom > today) return 'future'
  return 'current'
}
export const sortedParameters = parameters => [...parameters].sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id))
export function filterTests(tests, query, status) {
  const needle = query.trim().toLocaleLowerCase()
  return tests.filter(test => (status === 'all' || test.active === (status === 'active')) && [test.code, test.nameEn, test.nameAr].some(value => value.toLocaleLowerCase().includes(needle)))
}
