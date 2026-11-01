import { CalendarClock, ClipboardList, CreditCard, FileCheck2, Clock3, Users } from 'lucide-react'

export default function AdminKpiCards({ summary, copy, number, money }) {
  const metrics = [
    { label: copy.patients, value: number(summary.patients), note: copy.uniquePatients, Icon: Users },
    { label: copy.totalOrders, value: number(summary.total), note: copy.selectedPeriod, Icon: ClipboardList },
    { label: copy.upcoming, value: number(summary.appointments), note: copy.scheduled, Icon: CalendarClock },
    { label: copy.completedTests, value: number(summary.completedTests), note: copy.completedNote, Icon: FileCheck2 },
    { label: copy.pendingResults, value: number(summary.pendingResults), note: copy.pendingNote, Icon: Clock3 },
    { label: copy.revenue, value: money(summary.revenue), note: copy.paidOnly, Icon: CreditCard },
  ]
  return <section className="admin-overview-kpis" aria-label={copy.title}>
    {metrics.map(({ label, value, note, Icon }) => <article className="admin-overview-kpi" key={label}>
      <div><span>{label}</span><Icon size={19} aria-hidden="true" /></div>
      <strong>{value}</strong><small>{note}</small>
    </article>)}
  </section>
}
