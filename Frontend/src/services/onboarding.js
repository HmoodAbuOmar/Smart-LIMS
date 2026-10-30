export const genderOptions = ['male', 'female']
export function localDateValue(date = new Date()) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
}

// This checkout has no patient schema or identifier contract. These are only
// the already-authorized temporary demographics, never a patient API payload.
export const patientDraftFields = ['name', 'dateOfBirth', 'gender', 'phone']

export function validatePatientDraft(values, today = localDateValue()) {
  const errors = {}
  if (!values.name.trim()) errors.name = 'nameRequired'
  if (!values.phone.trim()) errors.phone = 'phoneRequired'
  else if (!/^\+?[\d\s().-]+$/.test(values.phone.trim()) || !/^[0-9]{7,15}$/.test(values.phone.replace(/\D/g, ''))) errors.phone = 'phoneInvalid'
  if (!values.dateOfBirth) errors.dateOfBirth = 'birthRequired'
  else {
    const parsed = new Date(`${values.dateOfBirth}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.dateOfBirth) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== values.dateOfBirth || values.dateOfBirth < '1900-01-01' || values.dateOfBirth > today) errors.dateOfBirth = 'birthInvalid'
  }
  if (!values.gender) errors.gender = 'genderRequired'
  else if (!genderOptions.includes(values.gender)) errors.gender = 'genderInvalid'
  return errors
}

// Mapping draft data does not create a record or establish an account-file link.
export function toPatientFilePayload(values) {
  return { fullName: values.name.trim(), phoneNumber: values.phone.trim(), dateOfBirth: values.dateOfBirth, gender: values.gender }
}
export function prepareFileLink(values) {
  return values.fileIdentifier.trim()
    ? { status: 'inputChecked', errors: {} }
    : { status: 'invalid', errors: { fileIdentifier: 'fileIdentifierRequired' } }
}
export function toFileLinkPayload(values) { return { fileIdentifier: values.fileIdentifier.trim() } }

export function preparePatientDraft(values) {
  const errors = validatePatientDraft(values)
  return { status: Object.keys(errors).length ? 'invalid' : 'draftValidated', errors }
}
