import { CalendarClock, Download, FileCheck2, RotateCcw } from 'lucide-react'

export default function AdminQuickActions({ copy, onReview, onAppointments, onExport, onReset, exportDisabled }) {
  const actions = [
    { label: copy.reviewAction, Icon: FileCheck2, action: onReview },
    { label: copy.appointmentsAction, Icon: CalendarClock, action: onAppointments },
    { label: copy.exportAction, Icon: Download, action: onExport, disabled: exportDisabled },
    { label: copy.resetAction, Icon: RotateCcw, action: onReset },
  ]
  return <section className="admin-overview-panel" aria-labelledby="admin-quick-heading">
    <div className="admin-overview-panel-heading"><div><h3 id="admin-quick-heading">{copy.quickActions}</h3><p>{copy.quickNote}</p></div></div>
    <div className="admin-quick-actions">{actions.map(({ label, Icon, action, disabled }) => <button type="button" key={label} onClick={action} disabled={disabled}><Icon size={18} aria-hidden="true" /><span>{label}</span></button>)}</div>
  </section>
}
