import { rangeFields, rangeValidity, validateParameter, validateRange, validateTest } from './adminCatalogModel.js'
const trim = value => typeof value === 'string' ? value.trim() : ''
const textFields = (values, fields) => Object.fromEntries(fields.map(field => [field, trim(values[field])]))
export function createCatalogData() {
  // Fresh service instances only: loading never reseeds or replaces existing records.
  const definitions = [
    ['CBC', 'Complete Blood Count', 'تعداد الدم الكامل', 'Counts and describes blood cells.', 'فحص لعدّ خلايا الدم ووصفها.', 'WHOLE_BLOOD'],
    ['GLU', 'Glucose', 'سكر الدم', 'Measures glucose in a blood specimen.', 'قياس الجلوكوز في عينة دم.', 'PLASMA'],
    ['LIPID', 'Lipid Profile', 'دهون الدم', 'A group of measurements of blood lipids.', 'مجموعة قياسات لدهون الدم.', 'SERUM'],
    ['HBA1C', 'Hemoglobin A1c', 'الهيموغلوبين السكري', 'Measures glycated hemoglobin.', 'قياس الهيموغلوبين السكري.', 'WHOLE_BLOOD'],
    ['TSH', 'Thyroid Stimulating Hormone', 'الهرمون المنبه للغدة الدرقية', 'Measures thyroid stimulating hormone.', 'قياس الهرمون المنبه للغدة الدرقية.', 'SERUM'],
    ['VITD', 'Vitamin D (25-OH)', 'فيتامين د', 'Measures 25-hydroxyvitamin D.', 'قياس فيتامين د بصيغة 25 هيدروكسي.', 'SERUM'],
    ['CRP', 'C-Reactive Protein', 'البروتين المتفاعل سي', 'Measures C-reactive protein.', 'قياس البروتين المتفاعل سي.', 'SERUM'],
    ['B12', 'Vitamin B12', 'فيتامين ب١٢', 'Measures vitamin B12.', 'قياس فيتامين ب١٢.', 'SERUM'],
    ['FERRITIN', 'Ferritin', 'الفيريتين', 'Measures ferritin.', 'قياس الفيريتين.', 'SERUM'],
    ['CREAT', 'Creatinine', 'الكرياتينين', 'Measures creatinine in a blood specimen.', 'قياس الكرياتينين في عينة دم.', 'SERUM'],
    ['ALT', 'Alanine Aminotransferase', 'ناقلة أمين الألانين', 'Measures alanine aminotransferase activity.', 'قياس نشاط إنزيم ناقلة أمين الألانين.', 'SERUM'],
    ['AST', 'Aspartate Aminotransferase', 'ناقلة أمين الأسبارتات', 'Measures aspartate aminotransferase activity.', 'قياس نشاط إنزيم ناقلة أمين الأسبارتات.', 'SERUM'],
  ]
  const tests = definitions.map(([code, nameEn, nameAr, descriptionEn, descriptionAr, sampleType], index) => ({ id: `catalog-test-${index + 1}`, code, nameEn, nameAr, descriptionEn, descriptionAr, sampleType, priceCents: 2500 + index * 500, currency: 'ILS', preparationEn: '', preparationAr: '', active: index % 4 !== 3, updatedAt: '2026-11-01T09:00:00Z' }))
  const parameters = [
    { id: 'catalog-parameter-1', testId: tests[0].id, code: 'MEASURE-A', nameEn: 'Measurement A', nameAr: 'القياس أ', valueType: 'NUMERIC', unit: 'mg/L', methodEn: 'Optical analysis', methodAr: 'التحليل البصري', displayOrder: 0, required: true, active: true, historicallyUsed: true },
    { id: 'catalog-parameter-2', testId: tests[0].id, code: 'NOTE', nameEn: 'Observation', nameAr: 'الملاحظة', valueType: 'TEXT', unit: '', methodEn: '', methodAr: '', displayOrder: 1, required: false, active: true, historicallyUsed: false },
    { id: 'catalog-parameter-3', testId: tests[1].id, code: 'MEASURE-A', nameEn: 'Measurement B', nameAr: 'القياس ب', valueType: 'NUMERIC', unit: 'g/L', methodEn: 'Instrument measurement', methodAr: 'القياس بالأجهزة', displayOrder: 0, required: true, active: false, historicallyUsed: false },
  ]
  return { tests, parameters, ranges: [] }
}
export function createCatalogService(initial = createCatalogData(), { delay = 160 } = {}) {
  const data = structuredClone(initial)
  let sequence = 100
  const wait = () => new Promise(resolve => setTimeout(resolve, delay))
  const checked = errors => { if (Object.keys(errors).length) { const error = new Error('Catalog validation failed'); error.code = 'VALIDATION'; error.fields = errors; throw error } }
  const find = (collection, id) => { const record = data[collection].find(item => item.id === id); checked(record ? {} : { _form: 'notFound' }); return record }
  const newId = prefix => `${prefix}-${++sequence}`
  return {
    async load() { await wait(); return structuredClone(data) },
    async saveTest(values, id) {
      await wait(); checked(validateTest(values, data.tests, id))
      const fields = { ...textFields(values, ['code', 'nameEn', 'nameAr', 'descriptionEn', 'descriptionAr', 'sampleType', 'preparationEn', 'preparationAr']), priceCents: Math.round(Number(values.price) * 100), currency: 'ILS', active: Boolean(values.active), updatedAt: new Date().toISOString() }
      const record = id ? find('tests', id) : { id: newId('catalog-test') }
      Object.assign(record, fields); if (!id) data.tests.unshift(record)
      return structuredClone(record)
    },
    async setTestActive(id, active) { await wait(); const test = find('tests', id); test.active = Boolean(active); test.updatedAt = new Date().toISOString(); return structuredClone(test) },
    async saveParameter(values, testId, id) {
      await wait(); find('tests', testId)
      const original = id ? find('parameters', id) : null
      checked(original && original.testId !== testId ? { _form: 'missingParent' } : {})
      checked(validateParameter(values, data.parameters, testId, original, data.ranges))
      const fields = { ...textFields(values, ['code', 'nameEn', 'nameAr', 'unit', 'methodEn', 'methodAr']), valueType: values.valueType, displayOrder: Number(values.displayOrder), required: Boolean(values.required), active: Boolean(values.active) }
      const record = original || { id: newId('catalog-parameter'), testId, historicallyUsed: false }
      Object.assign(record, fields); if (!id) data.parameters.push(record)
      return structuredClone(record)
    },
    async setParameterActive(id, active) { await wait(); const parameter = find('parameters', id); parameter.active = Boolean(active); return structuredClone(parameter) },
    async saveRange(values, parameterId) {
      await wait(); const parameter = find('parameters', parameterId)
      checked(validateRange(values, parameter, data.ranges))
      const range = { ...rangeFields(values, parameterId), id: newId('catalog-range') }
      data.ranges.push(range); return structuredClone(range)
    },
    async closeRange(id, validTo) {
      await wait(); const range = find('ranges', id)
      checked(rangeValidity(range) === 'expired' ? { _form: 'expired' } : {})
      checked(!validTo ? { validTo: 'required' } : {})
      const values = { ...range, validTo }
      checked(validateRange(values, find('parameters', range.parameterId), data.ranges, id))
      // Only the end of validity changes. IDs, values and past result snapshots are untouched.
      range.validTo = validTo; return structuredClone(range)
    },
  }
}
export const adminCatalogService = createCatalogService()
