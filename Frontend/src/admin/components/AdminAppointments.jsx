import { demoAppointments, offsetDate } from '../adminDemoData.js'
import { testFor } from '../adminOverviewModel.js'
import AdminFilterDropdown from './AdminFilterDropdown.jsx'

export default function AdminAppointments({ copy, local, date, time, filter, onFilter, sectionRef }) {
  const appointments = demoAppointments.filter(appointment => filter === 'all' || appointment.date === offsetDate(Number(filter)))
  return <section ref={sectionRef} tabIndex={-1} className="admin-overview-panel" aria-labelledby="admin-appointments-heading">
    <div className="admin-overview-panel-heading"><div><h3 id="admin-appointments-heading"><CalendarClock size={18} aria-hidden="true" />{copy.appointments}</h3><p>{copy.appointmentsNote}</p></div>
      <div className="admin-appointment-filter"><AdminFilterDropdown label={copy.appointmentFilter} value={filter} onChange={onFilter} options={[{ value: 'all', label: copy.allDates }, { value: '0', label: copy.referenceDay }, { value: '1', label: copy.followingDay }]} /></div>
    </div>
    <div className="admin-overview-table-scroll" role="region" aria-label={copy.appointments} tabIndex={0}>
      <table className="admin-appointments-table"><caption className="admin-overview-sr-only">{copy.appointments}</caption><thead><tr>{[copy.patient, copy.test, copy.date, copy.status].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{appointments.map(appointment => <tr key={appointment.id}>
          <th scope="row"><span className="admin-person-cell"><span className="admin-person-avatar" aria-hidden="true">{local(appointment.patient).charAt(0)}</span><span>{local(appointment.patient)}<small><bdi>{appointment.id}</bdi></small></span></span></th>
          <td>{local(testFor(appointment.testId).name)}</td><td><time dateTime={`${appointment.date}T${appointment.time}`}>{date(appointment.date)}<small>{time(appointment.time)}</small></time></td>
          <td><span className={`admin-overview-status admin-order-${appointment.status}`}>{copy.statuses[appointment.status]}</span></td>
        </tr>)}</tbody>
      </table>
    </div>
    {!appointments.length && <p className="admin-overview-empty">{copy.noAppointments}</p>}
  </section>
}
import { CalendarClock } from 'lucide-react'
