import ReceptionistWalkIn from '../receptionist/walk-in/ReceptionistWalkIn.jsx'
import ReceptionistToday from '../receptionist/today/ReceptionistToday.jsx'
import ReceptionistPatients from '../receptionist/patients/ReceptionistPatients.jsx'
import ReceptionistLayout from '../receptionist/components/ReceptionistLayout.jsx'

export default function DevelopmentReceptionist({ page = 'today' }) {
  if (!import.meta.env.DEV) return null
  const query = new URLSearchParams(window.location.hash.split('?')[1] || '')
  const patientId = query.get('patientId') || null
  const fromPatients = !!patientId && query.get('from') === 'patients'
  return <ReceptionistLayout page={page === 'walkIn' ? fromPatients ? 'patients' : 'today' : page}>{page === 'walkIn' ? <ReceptionistWalkIn initialPatientId={patientId} initialTab={fromPatients ? 'details' : 'orders'} fromPatients={fromPatients} /> : page === 'patients' ? <ReceptionistPatients /> : <ReceptionistToday />}</ReceptionistLayout>
}
