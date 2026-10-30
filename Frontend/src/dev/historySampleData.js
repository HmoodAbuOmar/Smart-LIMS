import { dateAtOffset } from '../portal/portalModel.js'

// Educational fixture records only. Never imported by production or a real API.
const definitions = {
  hemoglobin: { name: ['Hemoglobin', 'الهيموغلوبين'], unit: 'g/dL', methodId: 'photometry', methodName: ['Photometry', 'قياس ضوئي'], specimen: 'whole-blood', low: 12, high: 16 },
  'vitamin-d': { name: ['Vitamin D (25-OH)', 'فيتامين د (25-OH)'], unit: 'ng/mL', methodId: 'immunoassay', methodName: ['Immunoassay', 'تحليل مناعي'], specimen: 'serum', low: 30, high: 100 },
  tsh: { name: ['TSH', 'الهرمون المنبه للغدة الدرقية TSH'], unit: 'mIU/L', methodId: 'immunoassay', methodName: ['Immunoassay', 'تحليل مناعي'], specimen: 'serum', low: .4, high: 4 },
  hba1c: { name: ['HbA1c', 'الهيموغلوبين السكري HbA1c'], unit: '%', methodId: 'hplc', methodName: ['HPLC', 'استشراب سائل'], specimen: 'whole-blood', low: 4, high: 5.6 },
  creatinine: { name: ['Creatinine', 'الكرياتينين'], unit: 'mg/dL', methodId: 'enzymatic', methodName: ['Enzymatic', 'قياس إنزيمي'], specimen: 'serum', low: .6, high: 1.1 },
  cholesterol: { name: ['Total Cholesterol', 'الكوليسترول الكلي'], unit: 'mg/dL', methodId: 'enzymatic', methodName: ['Enzymatic', 'قياس إنزيمي'], specimen: 'serum', low: 0, high: 200 },
  ldl: { name: ['LDL Cholesterol', 'كوليسترول LDL'], unit: 'mg/dL', methodId: 'direct-assay', methodName: ['Direct assay', 'قياس مباشر'], specimen: 'serum', low: 0, high: 100 },
  hdl: { name: ['HDL Cholesterol', 'كوليسترول HDL'], unit: 'mg/dL', methodId: 'direct-assay', methodName: ['Direct assay', 'قياس مباشر'], specimen: 'serum', low: 50, high: 100 },
  triglycerides: { name: ['Triglycerides', 'الدهون الثلاثية'], unit: 'mg/dL', methodId: 'enzymatic', methodName: ['Enzymatic', 'قياس إنزيمي'], specimen: 'serum', low: 0, high: 150 },
}
function measurement(id, value) {
  const definition = definitions[id]
  return { ...definition, biomarkerId: id, value, reference: { low: definition.low, high: definition.high, unit: definition.unit }, range: `${definition.low}–${definition.high}`, flag: value < definition.low ? 'low' : value > definition.high ? 'high' : 'normal' }
}
export function addHistorySamples(data) {
  if (!import.meta.env.DEV) throw new Error('History fixtures are development only')
  const patientId = data.profile.fileNumber
  const completed = { id: 'SAMPLE-HISTORY-A0', visitId: 'SAMPLE-V0', date: dateAtOffset(-3), time: '10:00', type: 'collection', orderId: 'SAMPLE-0012', status: 'completed', patientId, source: 'development' }
  const seedResults = data.results.map(report => report.orderId === 'SAMPLE-0012' ? {
    ...report, verified: true, appointmentId: completed.id, patientId, measuredAt: `${completed.date}T10:00:00`,
    values: report.values.map(row => report.testId === 'cbc' && row.unit === 'g/dL' ? { ...row, ...measurement('hemoglobin', Number(row.value)) } : report.testId === 'vitamin-d' ? { ...row, ...measurement('vitamin-d', Number(row.value)) } : report.testId === 'thyroid' && row.unit === 'mIU/L' ? { ...row, ...measurement('tsh', Number(row.value)) } : row),
  } : report)
  const orders = [], appointments = [], results = []
  const series = [
    [15, 11.2, 29, 3.4, 5.3, .86, 184, 112, 52, 130],
    [70, 12.4, 26, 2.9, 5.5, .9, 192, 120, 49, 142],
    [160, 12.8, 31, 3.1, 5.6, .82, 188, 116, 54, 120],
    [290, 12.1, 24, 2.5, 5.4, .88, 205, 132, 51, 156],
    [480, 13.1, 28, 2.7, 5.2, .92, 198, 124, 56, 148],
  ]
  series.forEach(([days, hemoglobin, vitaminD, tsh, hba1c, creatinine, cholesterol, ldl, hdl, triglycerides], index) => {
    const number = index + 1, orderId = `SAMPLE-HISTORY-O${number}`, appointmentId = `SAMPLE-HISTORY-A${number}`, date = dateAtOffset(-days)
    const tests = ['cbc', 'vitamin-d', 'thyroid', 'hba1c', 'kidney', 'lipid']
    const total = tests.reduce((sum, id) => sum + data.tests.find(test => test.id === id).price, 0)
    orders.push({ id: orderId, date, tests, total, status: 'completed', stage: 3, paymentMethod: 'online', paymentStatus: 'simulatedPaid', amountPaid: total, patientId, source: 'development' })
    appointments.push({ id: appointmentId, visitId: `SAMPLE-V${number}`, date, time: '09:30', type: 'collection', orderId, status: 'completed', patientId, source: 'development' })
    const panels = [ ['cbc', [measurement('hemoglobin', hemoglobin)]], ['vitamin-d', [measurement('vitamin-d', vitaminD)]], ['thyroid', [measurement('tsh', tsh)]], ['hba1c', [measurement('hba1c', hba1c)]], ['kidney', [measurement('creatinine', creatinine)]], ['lipid', [measurement('cholesterol', cholesterol), measurement('ldl', ldl), measurement('hdl', hdl), measurement('triglycerides', triglycerides)]] ]
    // A distinct unit series is intentionally NOT converted or connected to mg/dL.
    if (index === 4) panels[2][1].push({ ...measurement('tsh', 2.8), methodId: 'immunoassay-platform-b', methodName: ['Immunoassay B', 'تحليل مناعي ب'] })
    if (index === 4) panels[4][1].push({ ...measurement('creatinine', 81), unit: 'µmol/L', reference: { low: 53, high: 97, unit: 'µmol/L' }, range: '53–97', flag: 'normal' })
    for (const [testId, values] of panels) results.push({ id: `SAMPLE-HISTORY-R${number}-${testId}`, orderId, appointmentId, patientId, testId, status: 'published', verified: true, date, measuredAt: `${date}T09:30:00`, sampleDate: date, values })
  })
  return { ...data, appointments: [...data.appointments, completed, ...appointments], results: [...seedResults, ...results], orders: [...data.orders.map(order => order.id === 'SAMPLE-0012' ? { ...order, patientId, paymentStatus: 'simulatedPaid', paymentMethod: 'online', amountPaid: order.total, source: 'development' } : order), ...orders] }
}
