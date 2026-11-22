import LabTechnicianLayout from './LabTechnicianLayout.jsx'
import LaboratoryWorklist from './LaboratoryWorklist.jsx'

const preview = {
  items: [
    { orderItemId: '1', orderId: 'o1', orderNumber: 'ORD-1042', patientName: 'Lina Haddad', testName: 'Complete Blood Count', workingState: 'DRAFT', workingResultId: 'r1', currentResultId: null },
    { orderItemId: '2', orderId: 'o2', orderNumber: 'ORD-1048', patientName: 'Omar Nasser', testName: 'Fasting Glucose', workingState: null, workingResultId: null, currentResultId: null },
    { orderItemId: '3', orderId: 'o3', orderNumber: 'ORD-1051', patientName: 'Nora Saleh', testName: 'Thyroid Stimulating Hormone', workingState: 'APPROVED', workingResultId: 'r3', currentResultId: null },
    { orderItemId: '4', orderId: 'o4', orderNumber: 'ORD-1055', patientName: 'Hadi Khoury', testName: 'Lipid Panel', workingState: null, workingResultId: null, currentResultId: 'r4' },
  ],
  samples: [
    { id: 's1', orderId: 'o1', status: 'RECEIVED', attestations: [{ orderItemId: '1' }] },
    { id: 's2', orderId: 'o2', status: 'REGISTERED', attestations: [] },
    { id: 's3', orderId: 'o3', status: 'RECEIVED', attestations: [{ orderItemId: '3' }] },
  ],
}

export default function LabPreview() {
  if (!import.meta.env.DEV) return null
  return <LabTechnicianLayout><LaboratoryWorklist preview={preview} /></LabTechnicianLayout>
}
