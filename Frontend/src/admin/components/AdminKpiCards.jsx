import { CalendarClock, ClipboardList, CreditCard, FileCheck2, Clock3, Users } from 'lucide-react'
import { useId } from 'react'

// Static decorative artwork, not metric observations or historical trends.
// No timestamps, comparisons, random values, or connection to KPI calculations.
const decorativeWaves = [
  { path: 'M2 17 C18 17 22 7 38 7 C54 7 60 19 78 19 C96 19 104 9 122 9 C136 9 144 12 154 12', endY: 12 },
  { path: 'M2 10 C20 10 24 19 42 19 C60 19 64 6 84 6 C104 6 108 15 126 15 C140 15 146 8 154 8', endY: 8 },
  { path: 'M2 15 C22 15 28 11 48 11 C68 11 72 17 92 17 C112 17 118 5 136 5 C144 5 148 7 154 7', endY: 7 },
  { path: 'M2 19 C18 19 24 8 42 8 C60 8 66 14 82 14 C98 14 102 6 118 6 C134 6 142 16 154 16', endY: 16 },
  { path: 'M2 8 C20 8 26 15 44 15 C62 15 66 9 84 9 C102 9 108 20 126 20 C140 20 146 17 154 17', endY: 17 },
  { path: 'M2 14 C16 14 22 5 36 5 C50 5 56 17 72 17 C88 17 94 10 110 10 C128 10 138 6 154 6', endY: 6 },
]

export default function AdminKpiCards({ summary, copy, number, money }) {
  const gradientId = useId()
  const metrics = [
    { label: copy.patients, value: number(summary.patients), note: copy.uniquePatients, Icon: Users },
    { label: copy.totalOrders, value: number(summary.total), note: copy.totalOrdersNote, Icon: ClipboardList },
    { label: copy.upcoming, value: number(summary.appointments), note: copy.scheduled, Icon: CalendarClock },
    { label: copy.completedTests, value: number(summary.completedTests), note: copy.completedNote, Icon: FileCheck2 },
    { label: copy.pendingResults, value: number(summary.pendingResults), note: copy.pendingNote, Icon: Clock3 },
    { label: copy.revenue, value: money(summary.revenue), note: copy.paidOnly, Icon: CreditCard },
  ]
  return <section className="admin-overview-kpis" aria-label={copy.title}>
    {metrics.map(({ label, value, note, Icon }, index) => <article className={`admin-overview-kpi admin-kpi-tone-${index % 3}`} key={label}>
      <span className="admin-kpi-icon"><Icon size={23} strokeWidth={1.8} aria-hidden="true" /></span>
      <div className="admin-kpi-content"><span className="admin-kpi-label">{label}</span><strong>{value}</strong><small>{note}</small></div>
      <div className="admin-kpi-sparkline" aria-hidden="true">
        <svg viewBox="0 0 160 26" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <defs><linearGradient id={`${gradientId}-${index}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a7d8c7" stopOpacity=".26" />
            <stop offset="100%" stopColor="#a7d8c7" stopOpacity="0" />
          </linearGradient></defs>
          <path d={`${decorativeWaves[index].path} L154 26 L2 26 Z`} fill={`url(#${gradientId}-${index})`} />
          <path className="admin-kpi-wave-line" d={decorativeWaves[index].path} />
          <circle className="admin-kpi-wave-endpoint" cx="154" cy={decorativeWaves[index].endY} r="2.2" />
        </svg>
      </div>
    </article>)}
  </section>
}
