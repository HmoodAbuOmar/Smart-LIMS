// Browser-test mount only: no App route/import, session, medical records or API stubs.
import { useState } from 'react'
import '../i18n.js'
import PatientPortal from '../portal/PatientPortal.jsx'
import { emptyPatientWorkspace } from '../portal/patientState.js'

export default function Harness() {
  const [route, setRoute] = useState('tests')
  const [workspace] = useState(() => ({ ...emptyPatientWorkspace(), tests: [
    { id: 'copy-test-a', name: ['Selected Test A', 'الفحص المختار أ'], category: 'blood', price: 25, description: ['', ''] },
    { id: 'copy-test-b', name: ['Selected Test B', 'الفحص المختار ب'], category: 'blood', price: 20, description: ['', ''] },
  ] }))
  return <PatientPortal initialData={workspace} route={route} onNavigate={setRoute} onExit={() => setRoute('dashboard')} />
}
