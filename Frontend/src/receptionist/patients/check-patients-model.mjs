import assert from 'node:assert/strict'
import { createReceptionistPatientsService } from './patientsDevelopmentService.js'
import { displayPatientName, filterPatients, linkStatus, patientPayload, validateNewPatient } from './patientsModel.js'
import { receptionistPatientsApi } from './patientsService.js'
import { patientPhoneError, validatePatientDraft } from '../../services/onboarding.js'
import { patientsCopy } from './patientsCopy.js'
const values = { fullName: '  New Patient  ', dateOfBirth: '2000-01-02', gender: 'UNKNOWN', phoneNumber: ' +970599123456 ', address: '  Test address  ' }
assert.deepEqual(validateNewPatient(values, '2026-11-11'), {})
assert.deepEqual(patientPayload(values), { fullName: 'New Patient', dateOfBirth: '2000-01-02', gender: 'UNKNOWN', phoneNumber: '+970599123456', address: 'Test address' })
for (const field of ['fullName', 'dateOfBirth', 'gender', 'phoneNumber']) assert.equal(validateNewPatient({ ...values, [field]: '' })[field], 'required')
assert.equal(validateNewPatient({ ...values, fullName: '   ' }).fullName, 'required')
assert.equal(validateNewPatient({ ...values, fullName: 'n'.repeat(121) }).fullName, 'nameLength')
assert.equal(validateNewPatient({ ...values, dateOfBirth: '2099-01-01' }).dateOfBirth, 'future')
assert.equal(validateNewPatient({ ...values, dateOfBirth: '2000-02-30' }).dateOfBirth, 'date')
assert.equal(validateNewPatient({ ...values, gender: 'OTHER' }).gender, 'unsupportedGender')
assert.equal(validateNewPatient({ ...values, phoneNumber: 'bad phone' }).phoneNumber, 'phoneInvalid')
assert.equal(validateNewPatient({ ...values, address: 'x'.repeat(501) }).address, 'addressLength')
assert.equal(patientPayload({ ...values, phoneNumber: '0599000111' }).phoneNumber, '0599000111')
assert.equal(patientPayload({ ...values, address: '  ' }).address, null)
for (const phone of ['0599000111', '+970 599 123 456', 'invalid', '12', '']) {
  const error = validatePatientDraft({ name: 'Name', dateOfBirth: '2000-01-01', gender: 'male', phone }).phone || null
  assert.equal(patientPhoneError(phone), error)
}
const service = createReceptionistPatientsService({ delay: 0 })
const first = await service.list({ page: 0 }), second = await service.list({ page: 1 })
assert.equal(first.content.length, 8); assert.equal(second.content.length, 6); assert.equal(first.totalElements, 14)
for (const search of ['Lina', 'لينا', 'P-1001', '0599000111']) assert.ok((await service.list({ search })).totalElements > 0)
assert.equal((await service.list({ search: 'not-a-patient' })).totalElements, 0)
assert.ok(first.content.some(patient => linkStatus(patient) === 'linked'))
assert.ok(first.content.some(patient => linkStatus(patient) === 'unlinked'))
assert.equal(linkStatus({ id: 'real-contract-without-link-data' }), 'unavailable')
assert.ok(displayPatientName(first.content[0], 'ar'))
assert.equal(filterPatients(first.content, first.content[0].nameAr).length, 2)
const initial = await service.list({ size: 100 })
const saved = await service.create({ ...values, fullName: first.content[0].fullName, phoneNumber: first.content[0].phoneNumber })
assert.equal(linkStatus(saved), 'unlinked')
assert.notEqual(saved.id, first.content[0].id); assert.notEqual(saved.patientNumber, first.content[0].patientNumber)
assert.equal((await service.list({ size: 100 })).totalElements, initial.totalElements + 1)
assert.equal(displayPatientName(saved, 'ar'), saved.fullName)
assert.equal(saved.nameAr, undefined) // Entered names are not automatically translated or paired.
assert.equal(initial.content[0].linkedAccountId, first.content[0].linkedAccountId)
first.content[0].fullName = 'Tampered'
assert.notEqual((await service.list()).content[0].fullName, 'Tampered')
const failure = createReceptionistPatientsService({ initial: initial.content, delay: 0, beforeCreate: async () => { throw new Error('offline') } })
await assert.rejects(failure.create(values)); assert.deepEqual((await failure.list({ size: 100 })).content, initial.content)
assert.equal((await createReceptionistPatientsService({ initial: [], delay: 0 }).list()).totalElements, 0)
await assert.rejects(receptionistPatientsApi.list({ search: '', page: 0, size: 8 }), { code: 'SERVICE_UNAVAILABLE' })
await assert.rejects(receptionistPatientsApi.create(values), { code: 'SERVICE_UNAVAILABLE' })
assert.deepEqual(Object.keys(patientsCopy.en).sort(), Object.keys(patientsCopy.ar).sort())
console.log('PASS: shared phone validation, exact patient payload/genders, required/future/date/length checks, bilingual/name/file/phone search, pagination totals, explicit/missing account states, unique creation despite duplicate identity text, immutable failure, no automatic linking/translation and unavailable real transport.')
