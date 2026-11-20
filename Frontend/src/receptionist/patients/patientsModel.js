import { patientPhoneError } from '../../services/onboarding.js'
import { todayDate } from '../today/todayModel.js'

export const PAGE_SIZE = 8
// Confirmed by Backend patients/entity/PatientGender.java.
export const PATIENT_GENDERS = ['MALE', 'FEMALE', 'UNKNOWN']
export function validateNewPatient(values, today = todayDate()) {
  const errors = {}
  if (!values.fullName.trim()) errors.fullName = 'required'
  else if ([...values.fullName.trim()].length > 120) errors.fullName = 'nameLength'
  if (!values.dateOfBirth) errors.dateOfBirth = 'required'
  else {
    const date = new Date(`${values.dateOfBirth}T12:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.dateOfBirth) || values.dateOfBirth < '0001-01-01' || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== values.dateOfBirth) errors.dateOfBirth = 'date'
    else if (values.dateOfBirth > today) errors.dateOfBirth = 'future'
  }
  if (!values.gender) errors.gender = 'required'
  else if (!PATIENT_GENDERS.includes(values.gender)) errors.gender = 'unsupportedGender'
  const phoneError = patientPhoneError(values.phoneNumber)
  if (phoneError) errors.phoneNumber = phoneError === 'phoneRequired' ? 'required' : 'phoneInvalid'
  else if ([...values.phoneNumber.trim()].length > 20) errors.phoneNumber = 'phoneLength'
  if ([...(values.address || '').trim()].length > 500) errors.address = 'addressLength'
  return errors
}
export function patientPayload(values) {
  return { fullName: values.fullName.trim(), dateOfBirth: values.dateOfBirth, gender: values.gender, phoneNumber: values.phoneNumber.trim(), address: values.address?.trim() || null }
}
export function displayPatientName(patient, language) { return patient[language === 'ar' ? 'nameAr' : 'nameEn'] || patient.fullName }
export function linkStatus(patient) {
  if (!Object.hasOwn(patient, 'linkedAccountId')) return 'unavailable'
  return patient.linkedAccountId ? 'linked' : 'unlinked'
}
export function filterPatients(patients, search) {
  const needle = search.trim().toLocaleLowerCase()
  return patients.filter(patient => [patient.fullName, patient.nameEn, patient.nameAr, patient.patientNumber, patient.phoneNumber].some(value => value?.toLocaleLowerCase().includes(needle)))
}
