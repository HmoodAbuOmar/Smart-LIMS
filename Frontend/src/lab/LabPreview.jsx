import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import LabTechnicianLayout from './LabTechnicianLayout.jsx'
import LaboratoryWorklist from './LaboratoryWorklist.jsx'
import SampleList from './SampleList.jsx'
import CollectSample from './CollectSample.jsx'
import RejectSample from './RejectSample.jsx'
import SampleDetails from './SampleDetails.jsx'
import { groupCollectionOrders } from './collectSampleModel.js'
import { worklistCopy } from './worklistCopy.js'

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

const previewSamples = [
  { id: 's1', barcode: 'SP-1001', orderId: 'o1', orderNumber: 'LAB-2041', patientName: 'Layan Ahmad', sampleType: 'Blood', containerType: 'EDTA', status: 'RECEIVED', version: 1, collectedAt: '2026-11-24T08:15:00Z', receivedAt: '2026-11-24T08:28:00Z', tests: [{ orderItemId: 'hb', testName: 'Hemoglobin' }] },
  { id: 's2', barcode: 'SP-1002', orderId: 'o2', orderNumber: 'LAB-2042', patientName: 'Karim Mahmoud', sampleType: 'Blood', containerType: 'Fluoride', status: 'REGISTERED', collectedAt: '2026-11-24T08:34:00Z', receivedAt: null },
  { id: 's3', barcode: 'SP-1008', orderId: 'o5', orderNumber: 'ORD-1066', patientName: 'Rami Saleh', sampleType: 'Serum', containerType: 'Gel tube', status: 'REJECTED', rejectionReason: 'Quantity not sufficient', visitId: '11111111-1111-4111-8111-111111111111', collectedAt: '2026-11-25T07:10:00Z', receivedAt: '2026-11-25T07:25:00Z', tests: [
    { orderItemId: 'alt', testName: 'Alanine Aminotransferase' },
    { orderItemId: 'ast', testName: 'Aspartate Aminotransferase' },
  ] },
]

export default function LabPreview({ page = 'worklist' }) {
  const { i18n } = useTranslation()
  const copy = worklistCopy[i18n.resolvedLanguage === 'ar' ? 'ar' : 'en']
  const [collecting, setCollecting] = useState(false)
  const [replacementId, setReplacementId] = useState('')
  const [rejecting, setRejecting] = useState(null)
  const [details, setDetails] = useState(null)
  const opened = useRef(false)
  const returnFocus = useRef('lab-collect-sample')
  const showForm = page === 'samples' && (collecting || Boolean(replacementId) || Boolean(rejecting) || Boolean(details))
  useEffect(() => { setCollecting(false); setReplacementId(''); setRejecting(null); setDetails(null) }, [page])
  useEffect(() => {
    if (page !== 'samples') opened.current = false
    else if (!showForm && opened.current) {
      opened.current = false
      document.getElementById(returnFocus.current)?.focus()
    }
  }, [page, showForm])
  if (!import.meta.env.DEV) return null
  const replacement = previewSamples.find(sample => sample.id === replacementId) || null
  const formTitle = rejecting ? copy.rejectTitle : replacementId ? copy.replaceTitle : details ? copy.sampleDetailsTitle : copy.collectTitle
  const formLabel = rejecting ? copy.rejectContent : replacementId ? copy.replaceContent : details ? copy.sampleDetailsContent : copy.collectContent
  function closeForm() {
    setCollecting(false)
    setReplacementId('')
    setRejecting(null)
    setDetails(null)
  }
  function openDetails(sample) {
    opened.current = true
    returnFocus.current = `lab-sample-${sample.id}`
    setCollecting(false)
    setReplacementId('')
    setRejecting(null)
    setDetails(sample)
  }
  return <LabTechnicianLayout page={page} onSelectPage={closeForm} documentTitle={showForm ? formTitle : undefined} contentLabel={showForm ? formLabel : undefined}>
    {page === 'samples' ? <>
      <div hidden={showForm || undefined}><SampleList preview={previewSamples} onCollect={() => { opened.current = true; returnFocus.current = 'lab-collect-sample'; setReplacementId(''); setRejecting(null); setDetails(null); setCollecting(true) }} onReplace={id => { opened.current = true; returnFocus.current = `lab-replace-${id}`; setCollecting(false); setRejecting(null); setDetails(null); setReplacementId(id) }} onReject={sample => { opened.current = true; returnFocus.current = `lab-reject-${sample.id}`; setCollecting(false); setReplacementId(''); setDetails(null); setRejecting(sample) }} onOpen={openDetails} /></div>
      {collecting && <CollectSample preview={{ orders: groupCollectionOrders(preview.items) }} onBack={closeForm} />}
      {replacement && <CollectSample key={replacement.id} replacementId={replacement.id} replacementPreview={replacement} onBack={closeForm} />}
      {rejecting && <RejectSample key={rejecting.id} sample={rejecting} preview onBack={closeForm} />}
      {details && <SampleDetails key={details.id} sampleId={details.id} previewSample={details} onBack={closeForm} onReject={sample => { returnFocus.current = `lab-reject-${sample.id}`; setDetails(null); setRejecting(sample) }} onReplace={id => { returnFocus.current = `lab-replace-${id}`; setDetails(null); setReplacementId(id) }} />}
    </> : <LaboratoryWorklist preview={preview} />}
  </LabTechnicianLayout>
}
