import { BellRing, ClipboardCheck, ClipboardClock, FlaskConical } from 'lucide-react'
import './adminLaboratoryAlerts.css'

export default function AdminLaboratoryAlerts({ counts, copy, number }) {
  const rows = [
    { id: 'rejected', Icon: FlaskConical, title: copy.alertRejected, description: copy.alertRejectedNote },
    { id: 'review', Icon: ClipboardCheck, title: copy.alertReview, description: copy.alertReviewNote },
    { id: 'attention', Icon: ClipboardClock, title: copy.alertAttention, description: copy.alertAttentionNote },
  ]
  return <section className="admin-overview-panel admin-laboratory-alerts" aria-labelledby="admin-alerts-heading">
    <div className="admin-overview-panel-heading"><h3 id="admin-alerts-heading"><BellRing size={18} aria-hidden="true" />{copy.laboratoryAlerts}</h3>
    </div>
    <ul className="admin-alert-rows">{rows.map(({ id, Icon, title, description }) => <li key={id} className={`admin-alert-row admin-alert-${id}`}>
      <span className="admin-alert-icon"><Icon size={19} strokeWidth={1.7} aria-hidden="true" /></span>
      <div className="admin-alert-copy"><h4>{title}</h4><p>{description}</p></div>
      <strong className="admin-alert-count">{number(counts[id])}<span className="admin-overview-sr-only"> {title}</span></strong>
    </li>)}</ul>
  </section>
}
