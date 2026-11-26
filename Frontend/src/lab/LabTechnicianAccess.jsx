import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { authApi } from '../auth/api.js'
import { accountDestination } from '../auth/access.js'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'
import WorkspaceRoleLabel from '../components/WorkspaceRoleLabel.jsx'
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
import { worklistCopy } from './worklistCopy.js'
import './lab.css'

export default function LabTechnicianAccess({ page = 'worklist', draftId = '', reviewId = '', publishedId = '' }) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'
  const copy = worklistCopy[language]
  const [status, setStatus] = useState('loading')
  const [collecting, setCollecting] = useState(false)
  const [replacementId, setReplacementId] = useState('')
  const [rejecting, setRejecting] = useState(null)
  const [details, setDetails] = useState(null)
  const [listReload, setListReload] = useState(0)
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
  useEffect(() => {
    const controller = new AbortController()
    async function check() {
      try {
        const access = await authApi.getAccess({ signal: controller.signal })
        controller.signal.throwIfAborted()
        if (access.authenticated && access.role === 'lab_technician') setStatus('authorized')
        else {
          const destination = accountDestination(access)
          if (destination) window.location.hash = destination.slice(1)
          else setStatus('unavailable')
        }
      } catch {
        if (!controller.signal.aborted) setStatus('unavailable')
      }
    }
    void check()
    return () => controller.abort()
  }, [])
  function openForm() {
    opened.current = true
    returnFocus.current = 'lab-collect-sample'
    setReplacementId('')
    setRejecting(null)
    setDetails(null)
    setCollecting(true)
  }
  function openReplacement(id) {
    opened.current = true
    returnFocus.current = `lab-replace-${id}`
    setCollecting(false)
    setRejecting(null)
    setDetails(null)
    setReplacementId(id)
  }
  function openReject(sample) {
    opened.current = true
    returnFocus.current = `lab-reject-${sample.id}`
    setCollecting(false)
    setReplacementId('')
    setDetails(null)
    setRejecting(sample)
  }
  function openDetails(sample) {
    opened.current = true
    returnFocus.current = `lab-sample-${sample.id}`
    setCollecting(false)
    setReplacementId('')
    setRejecting(null)
    setDetails(sample)
  }
  function closeForm() {
    setCollecting(false)
    setReplacementId('')
    setRejecting(null)
    setDetails(null)
  }
  const formTitle = rejecting ? copy.rejectTitle : replacementId ? copy.replaceTitle : details ? copy.sampleDetailsTitle : copy.collectTitle
  const formLabel = rejecting ? copy.rejectContent : replacementId ? copy.replaceContent : details ? copy.sampleDetailsContent : copy.collectContent
  if (status === 'authorized') {
    return <LabTechnicianLayout page={page === 'drafts' ? 'drafts' : page} onSelectPage={closeForm} documentTitle={reviewing ? copy.reviewTitle : editing ? copy.editorTitle : reporting ? copy.reportTitle : page === 'approved' ? copy.approved : page === 'published' ? copy.published : page === 'drafts' ? copy.drafts : showForm ? formTitle : undefined} contentLabel={reviewing ? copy.reviewContent : editing ? copy.editorContent : reporting ? copy.reportContent : page === 'approved' ? copy.approvedContent : page === 'published' ? copy.publishedContent : page === 'drafts' ? copy.draftsContent : showForm ? formLabel : undefined}>
      {reviewing ? <ResultReview key={reviewId} resultId={reviewId} /> : editing ? <DraftResultEditor key={draftId} resultId={draftId} /> : reporting ? <PublishedResultReport key={publishedId} resultId={publishedId} /> : page === 'drafts' ? <DraftResults /> : page === 'approved' ? <ApprovedResults /> : page === 'published' ? <PublishedResults /> : page === 'samples' ? <>
        <div hidden={showForm || undefined}><SampleList reload={listReload} onCollect={openForm} onReplace={openReplacement} onReject={openReject} onOpen={openDetails} /></div>
        {collecting && <CollectSample onBack={closeForm} />}
        {replacementId && <CollectSample key={replacementId} replacementId={replacementId} onBack={closeForm} onRecorded={() => setListReload(value => value + 1)} />}
        {rejecting && <RejectSample key={rejecting.id} sample={rejecting} onBack={closeForm} onRejected={() => { returnFocus.current = `lab-replace-${rejecting.id}`; setListReload(value => value + 1); closeForm() }} />}
        {details && <SampleDetails key={details.id} sampleId={details.id} onBack={closeForm} onReject={openReject} onReplace={openReplacement} />}
      </> : page === 'drafts' ? <p className="lab-state" role="status">{copy.missing.drafts}</p> : <LaboratoryWorklist />}
    </LabTechnicianLayout>
  }
  return <main className="lab-access" lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'} aria-busy={status === 'loading'}>
    <header className="lab-access-header">
      <WorkspaceRoleLabel role="lab_technician" language={language} />
      <LanguageSwitcher />
    </header>
    <h1>{copy.title}</h1>
    {status === 'loading' ? <p role="status">{copy.accessLoading}</p> : <>
      <p role="alert">{copy.accessUnavailable}</p>
      <a href="#/login">{copy.login}</a>
    </>}
  </main>
}
