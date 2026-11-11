export function normalizeDateDigits(value) {
  return value.replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0))
}
export function validCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return false
  const date = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export function parseBirthDate(value) {
  const text = normalizeDateDigits(value.trim())
  // Also accept a pasted API date; presentation remains DD/MM/YYYY.
  if (validCalendarDate(text)) return text
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text)
  if (!match) return null
  const iso = `${match[3]}-${match[2]}-${match[1]}`
  return validCalendarDate(iso) ? iso : null
}
export function displayBirthDate(value) {
  if (!validCalendarDate(value)) return value
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}
export function calendarDate(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
