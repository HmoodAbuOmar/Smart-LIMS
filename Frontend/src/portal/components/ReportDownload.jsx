import { useState } from 'react'
import { Download } from 'lucide-react'
import { portalApi } from '../../services/portalApi.js'
import { isInternalRecord } from '../patientState.js'
import { Button } from './PortalUi.jsx'
import { usePortal } from '../PortalContext.js'

export default function ReportDownload({ result, compact = false }) {
  const { t, setNotice, development, state, local, date } = usePortal(), [busy, setBusy] = useState(false)
  async function download() {
    setBusy(true)
    try {
      if (import.meta.env.DEV && development && isInternalRecord(result)) {
        const { downloadSampleReport } = await import('../sampleReport.js')
        await downloadSampleReport({ profile: state.profile, result, test: state.tests.find(test => test.id === result.testId), t, local, date })
        return
      }
      const blob = await portalApi.downloadReport({ resultId: result.id })
      if (!(blob instanceof Blob) || blob.type !== 'application/pdf') throw new Error('No authorized PDF')
      const url = URL.createObjectURL(blob), link = document.createElement('a')
      link.href = url; link.download = result.id + '.pdf'; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setNotice('pdfError') } finally { setBusy(false) }
  }
  return <Button secondary onClick={download} disabled={result.status !== 'published' || busy} aria-label={t('downloadPdf')}><Download size={15} />{t(busy ? 'downloading' : compact ? 'download' : 'downloadPdf')}</Button>
}
