import ReceptionistAppointments from '../receptionist/appointments/ReceptionistAppointments.jsx'
import ReceptionistOrders from '../receptionist/orders/ReceptionistOrders.jsx'
import ReceptionistWalkIn from '../receptionist/walk-in/ReceptionistWalkIn.jsx'
import ReceptionistToday from '../receptionist/today/ReceptionistToday.jsx'
import ReceptionistPatients from '../receptionist/patients/ReceptionistPatients.jsx'
import ReceptionistLayout from '../receptionist/components/ReceptionistLayout.jsx'

export default function DevelopmentReceptionist({ page = 'today' }) {
  if (!import.meta.env.DEV) return null
  const query = new URLSearchParams(window.location.hash.split('?')[1] || '')
  const patientId = query.get('patientId') || null
  const fromPatients = !!patientId && query.get('from') === 'patients'
  const bookingContext = query.get('purpose') === 'scheduled' ? { date: query.get('bookingDate') } : null
  return <ReceptionistLayout page={page === 'walkIn' ? bookingContext ? 'appointments' : fromPatients ? 'patients' : 'today' : page}>{page === 'appointments' ? <ReceptionistAppointments initialOrderId={query.get('orderId')} initialDate={query.get('date')} openBooking={query.get('book') === '1'} /> : page === 'orders' ? <ReceptionistOrders orderId={query.get('orderId')} /> : page === 'walkIn' ? <ReceptionistWalkIn initialPatientId={patientId} initialTab={fromPatients ? 'details' : 'orders'} fromPatients={fromPatients} bookingContext={bookingContext} /> : page === 'patients' ? <ReceptionistPatients /> : <ReceptionistToday />}</ReceptionistLayout>
}
