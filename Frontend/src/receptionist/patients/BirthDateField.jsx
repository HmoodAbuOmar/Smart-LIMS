import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { todayDate } from '../today/todayModel.js'
import { calendarDate, displayBirthDate, normalizeDateDigits, parseBirthDate, validCalendarDate } from './birthDateModel.js'

export default function BirthDateField({ value, onChange, copy, language, disabled, invalid, errorId }) {
  const today = todayDate()
  const maxYear = Number(today.slice(0, 4)), maxMonth = Number(today.slice(5, 7)) - 1
  const initial = validCalendarDate(value) && value <= today ? value : today
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => ({ year: initial.slice(0, 4), month: Number(initial.slice(5, 7)) - 1 }))
  const [focused, setFocused] = useState(initial)
  const input = useRef(null), yearInput = useRef(null), container = useRef(null)
  useEffect(() => { if (open) { yearInput.current?.focus(); yearInput.current?.select() } }, [open])
  const year = /^\d{1,4}$/.test(view.year) ? Number(view.year) : 0
  const validYear = year >= 1 && year <= maxYear
  const monthStart = validYear ? calendarDate(year, view.month, 1) : null
  const firstWeekday = monthStart ? new Date(`${monthStart}T12:00:00Z`).getUTCDay() : 0
  const days = monthStart ? new Date(`${calendarDate(year, view.month, 28)}T12:00:00Z`) : null
  if (days) days.setUTCDate(32)
  const dayCount = days ? 32 - days.getUTCDate() : 0
  const locale = language === 'ar' ? 'ar-PS' : 'en-GB'
  const monthNames = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat(locale, { calendar: 'gregory', month: 'long', timeZone: 'UTC' }).format(new Date(`2000-${String(month + 1).padStart(2, '0')}-01T12:00:00Z`)))
  const weekdays = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { calendar: 'gregory', weekday: 'short', timeZone: 'UTC' }).format(new Date(`2026-11-${String(index + 1).padStart(2, '0')}T12:00:00Z`)))
  function close() { setOpen(false); input.current?.focus() }
  function show() {
    if (open) { close(); return }
    const selected = validCalendarDate(value) && value <= today ? value : today
    setView({ year: selected.slice(0, 4), month: Number(selected.slice(5, 7)) - 1 }); setFocused(selected); setOpen(true)
  }
  function setMonthYear(nextYear, nextMonth) {
    const month = Number(nextYear) === maxYear ? Math.min(nextMonth, maxMonth) : nextMonth
    setView({ year: nextYear, month }); setFocused(calendarDate(Number(nextYear) || 1, month, 1))
  }
  function moveMonth(amount) {
    const next = year * 12 + view.month + amount
    setMonthYear(String(Math.floor(next / 12)).padStart(4, '0'), ((next % 12) + 12) % 12)
  }
  function choose(date) { onChange(date); close() }
  function moveFocus(event, date) {
    const current = new Date(`${date}T12:00:00Z`)
    const step = { ArrowLeft: language === 'ar' ? 1 : -1, ArrowRight: language === 'ar' ? -1 : 1, ArrowUp: -7, ArrowDown: 7, Home: -current.getUTCDay(), End: 6 - current.getUTCDay() }[event.key]
    if (step === undefined) return
    event.preventDefault(); current.setUTCDate(current.getUTCDate() + step)
    const next = current.toISOString().slice(0, 10)
    if (!validCalendarDate(next) || next > today) return
    setView({ year: next.slice(0, 4), month: Number(next.slice(5, 7)) - 1 }); setFocused(next)
    requestAnimationFrame(() => container.current?.querySelector(`[data-date="${next}"]`)?.focus())
  }
  return <div className="r02-birth-date" ref={container} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false) }} onKeyDown={event => { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close() } }}>
    <div className="r02-date-control">
      <input ref={input} id="r02-dateOfBirth" name="dateOfBirth" type="text" inputMode="numeric" autoComplete="bday" dir="ltr" placeholder="DD/MM/YYYY" required maxLength={10} disabled={disabled} value={displayBirthDate(value)} aria-invalid={invalid} aria-describedby={`r02-date-format${errorId ? ` ${errorId}` : ''}`} onChange={event => {
        const raw = event.target.value, date = parseBirthDate(raw)
        onChange(date || raw)
        if (date && date <= today) { setView({ year: date.slice(0, 4), month: Number(date.slice(5, 7)) - 1 }); setFocused(date) }
      }} />
      <button type="button" className="r02-calendar-toggle" disabled={disabled} aria-label={copy.openBirthDatePicker} aria-expanded={open} aria-controls="r02-birth-calendar" onClick={show}><CalendarDays size={18} aria-hidden="true" /></button>
    </div>
    <small id="r02-date-format" className="r02-format-hint">{copy.dateFormat}: <bdi dir="ltr">DD/MM/YYYY</bdi></small>
    {open && <div id="r02-birth-calendar" className="r02-birth-calendar" role="dialog" aria-modal="false" aria-label={copy.birthCalendar}>
      <div className="r02-calendar-heading">
        <button type="button" disabled={disabled || !validYear || (year === 1 && view.month === 0)} aria-label={copy.previousMonth} onClick={() => moveMonth(-1)}><ChevronLeft size={16} aria-hidden="true" /></button>
        <label>{copy.month}<select aria-label={copy.month} disabled={disabled} value={view.month} onChange={event => setMonthYear(view.year, Number(event.target.value))}>{monthNames.map((name, month) => <option key={month} value={month} disabled={year === maxYear && month > maxMonth}>{name}</option>)}</select></label>
        <label>{copy.year}<input ref={yearInput} type="text" inputMode="numeric" pattern="[0-9]*" maxLength={4} dir="ltr" aria-label={copy.year} aria-invalid={!validYear} disabled={disabled} value={view.year} onChange={event => setMonthYear(normalizeDateDigits(event.target.value).replace(/[^0-9]/g, ''), view.month)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); container.current?.querySelector(`[data-date="${focused}"]`)?.focus() } }} /></label>
        <button type="button" disabled={disabled || !validYear || (year === maxYear && view.month >= maxMonth)} aria-label={copy.nextMonth} onClick={() => moveMonth(1)}><ChevronRight size={16} aria-hidden="true" /></button>
      </div>
      {!validYear ? <p className="r02-field-error" role="status">{copy.invalidYear}</p> : <div className="r02-calendar-grid" role="group" aria-label={`${monthNames[view.month]} ${year}`}>
        {weekdays.map((weekday, index) => <span key={`weekday-${index}`}>{weekday}</span>)}
        {Array.from({ length: firstWeekday }, (_, index) => <span key={`blank-${index}`} />)}
        {Array.from({ length: dayCount }, (_, index) => {
          const date = calendarDate(year, view.month, index + 1)
          return <button type="button" key={date} data-date={date} disabled={disabled || date > today} tabIndex={focused === date ? 0 : -1} aria-label={new Intl.DateTimeFormat(locale, { calendar: 'gregory', dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))} aria-pressed={value === date} onKeyDown={event => moveFocus(event, date)} onClick={() => choose(date)}>{(index + 1).toLocaleString(language)}</button>
        })}
      </div>}
      <button type="button" className="r02-calendar-done" onClick={close}>{copy.closeCalendar}</button>
    </div>}
  </div>
}
