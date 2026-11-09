import { useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { dateAtOffset, todayValue } from '../../portalModel.js'
import { Field } from '../../components/PortalUi.jsx'
import { usePortal } from '../../PortalContext.js'

export default function CalendarPicker({ value, onChange }) {
  const { t, language, number } = usePortal()
  const [month, setMonth] = useState(() => new Date(`${value}T12:00:00`))
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const min = todayValue(), max = dateAtOffset(180)
  const label = new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric' }).format(month)
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(language, { weekday: 'short' }).format(new Date(2026, 0, 4 + i)))
  function changeMonth(amount) { setMonth(m => new Date(m.getFullYear(), m.getMonth() + amount, 1)) }
  return <div className="portal-calendar" aria-label={t('calendar')}><Field label="selectDate" name="appointment-date" type="date" min={min} max={max} value={value} required onChange={e => { onChange(e.target.value); if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setMonth(new Date(`${e.target.value}T12:00:00`)) }} /><div className="portal-calendar-heading"><button type="button" aria-label={t('previousMonth')} disabled={`${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}` <= min.slice(0, 7)} onClick={() => changeMonth(-1)}><ArrowLeft size={16} /></button><strong aria-live="polite">{label}</strong><button type="button" aria-label={t('nextMonth')} disabled={todayValue(first).slice(0, 7) >= max.slice(0, 7)} onClick={() => changeMonth(1)}><ArrowRight size={16} /></button></div><div className="portal-calendar-grid">{weekdays.map((day, i) => <span key={`w${i}`}>{day}</span>)}{Array.from({ length: first.getDay() }, (_, i) => <span key={`blank${i}`} />)}{Array.from({ length: days }, (_, i) => { const day = new Date(month.getFullYear(), month.getMonth(), i + 1), date = todayValue(day); return <button type="button" key={date} aria-label={new Intl.DateTimeFormat(language, { dateStyle: 'full' }).format(day)} aria-pressed={value === date} disabled={date < min || date > max || day.getDay() === 5} onClick={() => onChange(date)}>{number(i + 1)}</button> })}</div></div>
}
