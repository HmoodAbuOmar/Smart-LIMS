export function todayValue() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function validatePatient(values, today = todayValue()) {
  const errors = {}
  for (const field of ['nameAr', 'nameEn']) {
    if (!values[field]?.trim()) errors[field] = 'required'
    else if ([...values[field].trim()].length > 120) errors[field] = 'nameLength'
  }
  if (!values.phone?.trim()) errors.phone = 'required'
  else if ([...values.phone.trim()].length > 20) errors.phone = 'phoneLength'
  if (!values.dateOfBirth) errors.dateOfBirth = 'required'
  else {
    const date = new Date(`${values.dateOfBirth}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.dateOfBirth) || values.dateOfBirth < '0001-01-01' || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== values.dateOfBirth) errors.dateOfBirth = 'date'
    else if (values.dateOfBirth > today) errors.dateOfBirth = 'future'
  }
  if (!['MALE', 'FEMALE', 'UNKNOWN'].includes(values.gender)) errors.gender = 'gender'
  return errors
}

export function patientFields(values) {
  return { nameAr: values.nameAr.trim(), nameEn: values.nameEn.trim(), dateOfBirth: values.dateOfBirth, gender: values.gender, phone: values.phone.trim(), address: (values.address || '').trim() }
}

export function searchPatients(patients, query) {
  const needle = query.trim().toLocaleLowerCase()
  return patients.filter(patient => [patient.nameEn, patient.nameAr, patient.fileNumber, patient.phone].some(value => (value || '').toLocaleLowerCase().includes(needle)))
}

export function patientName(patient, language) {
  return patient[language === 'ar' ? 'nameAr' : 'nameEn'] || ''
}

export function patientAvatarTone(id) {
  const hash = [...id].reduce((value, character) => (value * 31 + character.codePointAt(0)) >>> 0, 0)
  return ['mint', 'blue', 'lavender', 'peach'][hash % 4]
}

export function patientFinancials(patientId, orders, transactions) {
  const owned = orders.filter(order => order.patientId === patientId)
  const ids = new Set(owned.map(order => order.id))
  const charges = owned.filter(order => order.status !== 'CANCELLED').reduce((sum, order) => sum + order.total, 0)
  const confirmed = transactions.filter(item => ids.has(item.orderId) && item.status === 'CONFIRMED')
  const payments = confirmed.reduce((sum, item) => sum + (item.type === 'REFUND' ? -item.amount : item.amount), 0)
  return { available: owned.length > 0, charges, payments, outstanding: Math.max(0, charges - payments) }
}
