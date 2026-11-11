import ReceptionistToday from '../receptionist/today/ReceptionistToday.jsx'
import ReceptionistPatients from '../receptionist/patients/ReceptionistPatients.jsx'
import ReceptionistLayout from '../receptionist/components/ReceptionistLayout.jsx'

export default function DevelopmentReceptionist({ page = 'today' }) {
  if (!import.meta.env.DEV) return null
  return <ReceptionistLayout page={page}>{page === 'patients' ? <ReceptionistPatients /> : <ReceptionistToday />}</ReceptionistLayout>
}
