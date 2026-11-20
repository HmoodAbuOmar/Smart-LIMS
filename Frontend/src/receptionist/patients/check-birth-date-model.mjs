import assert from 'node:assert/strict'
import { calendarDate, displayBirthDate, parseBirthDate, validCalendarDate } from './birthDateModel.js'

for (const [entered, expected] of [
  ['02/01/2000', '2000-01-02'], ['01/02/2000', '2000-02-01'],
  ['29/02/2000', '2000-02-29'], ['29/02/2024', '2024-02-29'],
  ['٢٩/٠٢/٢٠٠٠', '2000-02-29'], ['۲۹/۰۲/۲۰۰۰', '2000-02-29'],
  ['02/01/0099', '0099-01-02'], ['01/01/0001', '0001-01-01'],
  ['2000-01-02', '2000-01-02'],
]) {
  assert.equal(parseBirthDate(entered), expected)
  assert.equal(validCalendarDate(expected), true)
  assert.equal(parseBirthDate(displayBirthDate(expected)), expected)
}
for (const entered of ['', '02/01', '29/02/1900', '29/02/2023', '31/04/2000', '00/01/2000', '01/13/2000', '01/01/0000']) assert.equal(parseBirthDate(entered), null)
assert.equal(calendarDate(99, 0, 2), '0099-01-02')
assert.equal(displayBirthDate('2000-01-02'), '02/01/2000')
console.log('PASS: DD/MM/YYYY, Arabic/Persian digits, leap years, invalid/partial dates, early years and date-only ISO round trips without timezone shifts.')
