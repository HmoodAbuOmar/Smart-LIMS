import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import LabTechnicianLayout from './LabTechnicianLayout.jsx'
import LaboratoryWorklist from './LaboratoryWorklist.jsx'
import SampleList from './SampleList.jsx'
import CollectSample from './CollectSample.jsx'
import RejectSample from './RejectSample.jsx'
import SampleDetails from './SampleDetails.jsx'
import DraftResultEditor from './DraftResultEditor.jsx'
import DraftResults from './DraftResults.jsx'
import ApprovedResults from './ApprovedResults.jsx'
import PublishedResults from './PublishedResults.jsx'
import PublishedResultReport from './PublishedResultReport.jsx'
import ResultReview from './ResultReview.jsx'
import { groupCollectionOrders } from './collectSampleModel.js'
import { worklistCopy } from './worklistCopy.js'

const preview = {
  items: [
    { orderItemId: '1', orderId: 'o1', orderNumber: 'ORD-1042', orderStatus: 'IN_PROGRESS', patientName: 'Lina Haddad', patientNumber: 'PF-10421', testName: 'Complete Blood Count', workingState: 'DRAFT', workingResultId: 'r1', currentResultId: null },
    { orderItemId: '2', orderId: 'o2', orderNumber: 'ORD-1048', orderStatus: 'IN_PROGRESS', patientName: 'Omar Nasser', patientNumber: 'PF-10480', testName: 'Fasting Glucose', workingState: null, workingResultId: null, currentResultId: null },
    { orderItemId: '5', orderId: 'o5', orderNumber: 'ORD-1060', orderStatus: 'IN_PROGRESS', patientName: 'Maya Haddad', patientNumber: 'PF-10600', testName: 'Fasting Glucose', workingState: null, workingResultId: null, currentResultId: null },
    { orderItemId: '3', orderId: 'o3', orderNumber: 'ORD-1051', patientName: 'Nora Saleh', patientNumber: 'PF-10510', testName: 'Thyroid Stimulating Hormone', workingState: 'APPROVED', workingResultId: 'r3', currentResultId: null },
    { orderItemId: '4', orderId: 'o4', orderNumber: 'ORD-1055', patientName: 'Hadi Khoury', testName: 'Lipid Panel', workingState: null, workingResultId: null, currentResultId: 'r4' },
  ],
  samples: [
    { id: 's1', orderId: 'o1', status: 'RECEIVED', attestations: [{ orderItemId: '1' }] },
    { id: 's2', orderId: 'o2', status: 'REGISTERED', attestations: [] },
    { id: 's3', orderId: 'o3', status: 'RECEIVED', attestations: [{ orderItemId: '3' }] },
    { id: 's5', orderId: 'o5', status: 'RECEIVED', attestations: [{ orderItemId: '5' }] },
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

const draftPreview = {
  result: {
    id: 'r1',
    orderItemId: '1',
    orderId: 'o1',
    orderNumber: 'ORD-1042',
    testName: 'Complete Blood Count',
    versionNumber: 1,
    version: 3,
    status: 'DRAFT',
    patient: { name: 'Lina Haddad', number: 'PF-10421' },
    measuredAt: '2026-11-24T06:30:00Z',
    explanation: null,
    specimens: [{ id: 's1', status: 'RECEIVED' }],
    values: [
      { parameterId: 'p1', code: 'HGB', name: 'Hemoglobin', resultType: 'NUMERIC', unit: 'g/dL', displayOrder: 0, required: true, numericValue: 13.2, numericComparator: null, referenceText: null, referenceMin: 12, referenceMax: 16, flag: 'NORMAL', notes: '' },
      { parameterId: 'p2', code: 'WBC', name: 'White Blood Cells', resultType: 'NUMERIC', unit: '10^9/L', displayOrder: 1, numericValue: 11.4, numericComparator: null, referenceText: null, referenceMin: 4, referenceMax: 11, flag: 'HIGH', notes: '' },
      { parameterId: 'p3', code: 'PLT', name: 'Platelets', resultType: 'NUMERIC', unit: '10^9/L', displayOrder: 2, numericValue: null, numericComparator: null, referenceText: '150 – 450', referenceMin: null, referenceMax: null, flag: 'NOT_EVALUATED', notes: '' },
      { parameterId: 'p4', code: 'HCT', name: 'Hematocrit', resultType: 'NUMERIC', unit: '%', displayOrder: 3, numericValue: 39, numericComparator: null, referenceText: null, referenceMin: 36, referenceMax: 46, flag: 'NORMAL', notes: '' },
    ],
  },
  samples: [
    { id: 's1', visitId: 'v1', status: 'RECEIVED', barcode: 'SP-1001', sampleType: 'Blood' },
    { id: 's2', visitId: 'v1', status: 'RECEIVED', barcode: 'SP-1008', sampleType: 'Serum' },
    { id: 's3', visitId: 'v1', status: 'REGISTERED', barcode: 'SP-1010', sampleType: 'Blood' },
  ],
  visits: [{ id: 'v1', tests: [{ orderItemId: '1' }] }],
}

const glucosePreview = {
  result: {
    id: 'preview-draft-5',
    orderItemId: '5',
    orderId: 'o5',
    orderNumber: 'ORD-1060',
    testName: 'Fasting Glucose',
    versionNumber: 1,
    version: 1,
    status: 'DRAFT',
    patient: { name: 'Maya Haddad', number: 'PF-10600' },
    measuredAt: '2026-11-25T05:00:00Z',
    explanation: null,
    specimens: [{ id: 's5' }],
    values: [
      { parameterId: 'g1', code: 'GLU', name: 'Glucose', resultType: 'NUMERIC', unit: 'mg/dL', displayOrder: 0, required: true, numericValue: 96, numericComparator: null, referenceText: '70 – 99', referenceMin: 70, referenceMax: 99, flag: 'NORMAL', notes: 'Fasting' },
    ],
  },
  samples: [
    { id: 's5', visitId: 'v5', status: 'RECEIVED', barcode: 'SP-2200', sampleType: 'Plasma' },
    { id: 's6', visitId: 'v5', status: 'REGISTERED', barcode: 'SP-2201', sampleType: 'Serum' },
    { id: 's7', visitId: 'v9', status: 'RECEIVED', barcode: 'SP-2299', sampleType: 'Blood' },
  ],
  visits: [{ id: 'v5', tests: [{ orderItemId: '5' }] }],
}

const sampleTestPreview = {
  result: {
    id: 'preview-draft-hb',
    orderItemId: 'hb',
    orderId: 'o1',
    orderNumber: 'LAB-2041',
    testName: 'Hemoglobin',
    versionNumber: 2,
    version: 4,
    status: 'DRAFT',
    patient: { name: 'Layan Ahmad', number: 'PF-20410' },
    measuredAt: '2026-11-24T08:40:00Z',
    explanation: null,
    specimens: [{ id: 's1' }],
    values: [
      { parameterId: 'hb1', code: 'HGB', name: 'Hemoglobin', resultType: 'NUMERIC', unit: 'g/dL', displayOrder: 0, required: true, numericValue: 11.8, numericComparator: '<', referenceText: null, referenceMin: 12, referenceMax: 16, flag: 'LOW', notes: 'Recheck' },
    ],
  },
  samples: [
    { id: 's1', visitId: 'v1', status: 'RECEIVED', barcode: 'SP-1001', sampleType: 'Blood', attestations: [{ orderItemId: 'hb' }] },
    { id: 's9', visitId: 'v1', status: 'RECEIVED', barcode: 'SP-1004', sampleType: 'Serum' },
    { id: 's8', visitId: 'v2', status: 'RECEIVED', barcode: 'SP-1888', sampleType: 'Urine', attestations: [{ orderItemId: 'other' }] },
  ],
  visits: [{ id: 'v1', tests: [{ orderItemId: 'hb' }] }],
}

const approvedResult = {
  id: 'r3',
  orderItemId: '3',
  orderId: 'o3',
  orderNumber: 'ORD-1051',
  testName: 'Thyroid Stimulating Hormone',
  versionNumber: 1,
  version: 4,
  status: 'APPROVED',
  patient: { name: 'Nora Saleh', number: 'PF-10510' },
  measuredAt: '2026-11-25T07:40:00Z',
  specimens: [{ id: 's3', barcode: 'SP-1051', status: 'RECEIVED', sampleType: 'Serum', attestedAt: '2026-11-25T07:55:00Z', attestedBy: { id: 'tech-1', name: 'Lab Tech' } }],
  values: [
    { parameterId: 'tsh', code: 'TSH', name: 'TSH', resultType: 'NUMERIC', unit: 'mIU/L', displayOrder: 0, required: true, numericValue: 2.4, numericComparator: null, referenceText: '0.4 – 4.0', flag: 'NORMAL', notes: '' },
    { parameterId: 'ft4', code: 'FT4', name: 'Free T4', resultType: 'NUMERIC', unit: 'ng/dL', displayOrder: 1, required: true, numericValue: 0.8, numericComparator: '<', referenceText: '0.8 – 1.8', flag: 'LOW', notes: 'Borderline' },
  ],
}

const draftFixtures = {
  r1: draftPreview,
  'preview-draft-5': glucosePreview,
  'preview-draft-hb': sampleTestPreview,
  r3: {
    result: approvedResult,
    samples: [{ id: 's3', visitId: 'v3', status: 'RECEIVED', barcode: 'SP-1051', sampleType: 'Serum', attestations: [{ orderItemId: '3' }] }],
    visits: [{ id: 'v3', tests: [{ orderItemId: '3' }] }],
  },
}
const reviewFixtures = {
  r1: {
    result: {
      ...draftPreview.result,
      specimens: [{ id: 's1', barcode: 'SP-1001', status: 'RECEIVED', attestedAt: '2026-11-24T06:40:00Z', attestedBy: { id: 'tech-1', name: 'Lab Tech' } }],
    },
  },
  r3: { result: approvedResult },
}
const missingDraft = { missing: true }
const missingReview = { missing: true }

const publishedPreview = [
  { orderItemId: 'pub-1', currentResultId: 'preview-published', workingResultId: 'working-draft', workingState: 'DRAFT', testName: 'Complete Blood Count', patientName: 'Lina Haddad', patientNumber: 'PF-10421', orderNumber: 'ORD-1042' },
  { orderItemId: 'pub-2', currentResultId: 'missing-published', testName: 'Lipid Panel', patientName: 'Hadi Khoury', patientNumber: 'PF-10550', orderNumber: 'ORD-1055' },
]

const publishedResult = {
  id: 'preview-published',
  orderItemId: 'pub-1',
  orderId: 'o1',
  orderNumber: 'ORD-1042',
  testName: 'Complete Blood Count',
  versionNumber: 2,
  version: 6,
  status: 'PUBLISHED',
  isCurrent: true,
  patient: { name: 'Lina Haddad', number: 'PF-10421' },
  approvedAt: '2026-11-25T07:40:00Z',
  publishedAt: '2026-11-25T08:05:00Z',
  specimens: [
    { id: 's1', barcode: 'SP-1001', status: 'RECEIVED' },
    { id: 's2', barcode: 'SP-1008', status: 'RECEIVED' },
  ],
  values: [
    { parameterId: 'p1', code: 'HGB', name: 'Hemoglobin', resultType: 'NUMERIC', unit: 'g/dL', displayOrder: 0, numericValue: 11.8, numericComparator: '<', referenceText: '12 – 16', flag: 'LOW', notes: 'Recheck' },
    { parameterId: 'p2', code: 'WBC', name: 'White Blood Cells', resultType: 'NUMERIC', unit: '10^9/L', displayOrder: 1, numericValue: 6.2, numericComparator: null, referenceText: '4.0 – 11.0', flag: 'NORMAL', notes: '' },
    { parameterId: 'p3', code: 'PLT', name: 'Platelets', resultType: 'NUMERIC', unit: '10^9/L', displayOrder: 2, numericValue: 410, numericComparator: null, referenceText: '150 – 450', flag: 'NORMAL', notes: '' },
  ],
}

const publishedFixtures = {
  'preview-published': {
    result: publishedResult,
    versions: [
      { id: 'preview-draft-correction', orderItemId: 'pub-1', versionNumber: 3, status: 'DRAFT', isCurrent: false, approvedAt: null, publishedAt: null, specimens: [{ id: 's1', barcode: 'SP-1001' }] },
      publishedResult,
      { id: 'preview-published-v1', orderItemId: 'pub-1', versionNumber: 1, status: 'PUBLISHED', isCurrent: false, approvedAt: '2026-11-24T06:10:00Z', publishedAt: '2026-11-24T06:25:00Z', specimens: [{ id: 's1', barcode: 'SP-1001' }] },
    ],
  },
}

export default function LabPreview({ page = 'worklist', draftId = '', reviewId = '', publishedId = '' }) {
  const { i18n } = useTranslation()
  const copy = worklistCopy[i18n.resolvedLanguage === 'ar' ? 'ar' : 'en']
  const [collecting, setCollecting] = useState(false)
  const [replacementId, setReplacementId] = useState('')
  const [rejecting, setRejecting] = useState(null)
  const [details, setDetails] = useState(null)
  const opened = useRef(false)
  const returnFocus = useRef('lab-collect-sample')
  const reviewing = Boolean(reviewId)
  const editing = page === 'drafts' && Boolean(draftId)
  const reporting = page === 'published' && Boolean(publishedId)
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
  return <LabTechnicianLayout page={page === 'drafts' ? 'drafts' : page} onSelectPage={closeForm} documentTitle={reviewing ? copy.reviewTitle : editing ? copy.editorTitle : reporting ? copy.reportTitle : page === 'approved' ? copy.approved : page === 'published' ? copy.published : page === 'drafts' ? copy.drafts : showForm ? formTitle : undefined} contentLabel={reviewing ? copy.reviewContent : editing ? copy.editorContent : reporting ? copy.reportContent : page === 'approved' ? copy.approvedContent : page === 'published' ? copy.publishedContent : page === 'drafts' ? copy.draftsContent : showForm ? formLabel : undefined}>
    {reviewing ? <ResultReview key={reviewId} resultId={reviewId} preview={reviewFixtures[reviewId] || missingReview} /> : editing ? <DraftResultEditor key={draftId} resultId={draftId} preview={draftFixtures[draftId] || missingDraft} /> : reporting ? <PublishedResultReport key={publishedId} resultId={publishedId} preview={publishedFixtures[publishedId] || { missing: true }} /> : page === 'drafts' ? <DraftResults preview={preview.items} /> : page === 'approved' ? <ApprovedResults preview={preview.items} /> : page === 'published' ? <PublishedResults preview={publishedPreview} /> : page === 'samples' ? <>
      <div hidden={showForm || undefined}><SampleList preview={previewSamples} onCollect={() => { opened.current = true; returnFocus.current = 'lab-collect-sample'; setReplacementId(''); setRejecting(null); setDetails(null); setCollecting(true) }} onReplace={id => { opened.current = true; returnFocus.current = `lab-replace-${id}`; setCollecting(false); setRejecting(null); setDetails(null); setReplacementId(id) }} onReject={sample => { opened.current = true; returnFocus.current = `lab-reject-${sample.id}`; setCollecting(false); setReplacementId(''); setDetails(null); setRejecting(sample) }} onOpen={openDetails} /></div>
      {collecting && <CollectSample preview={{ orders: groupCollectionOrders(preview.items) }} onBack={closeForm} />}
      {replacement && <CollectSample key={replacement.id} replacementId={replacement.id} replacementPreview={replacement} onBack={closeForm} />}
      {rejecting && <RejectSample key={rejecting.id} sample={rejecting} preview onBack={closeForm} />}
      {details && <SampleDetails key={details.id} sampleId={details.id} previewSample={details} onBack={closeForm} onReject={sample => { returnFocus.current = `lab-reject-${sample.id}`; setDetails(null); setRejecting(sample) }} onReplace={id => { returnFocus.current = `lab-replace-${id}`; setDetails(null); setReplacementId(id) }} onOpenTest={test => {
        if (details.status !== 'RECEIVED' || test.orderItemId !== 'hb') return false
        window.location.hash = '/__lab/drafts/preview-draft-hb'
        return true
      }} />}
    </> : <LaboratoryWorklist preview={preview} previewDraftId={orderItemId => orderItemId === '5' ? 'preview-draft-5' : ''} />}
  </LabTechnicianLayout>
}
