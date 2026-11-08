import { ArrowLeft, Printer } from 'lucide-react'
import BrandLogo from '../../components/BrandLogo.jsx'
import { visitForResult } from '../historyModel.js'
import ReportDownload from '../components/ReportDownload.jsx'
import { Title, Button, VisitLink, Status, Empty } from '../components/PortalUi.jsx'
import { usePortal } from '../PortalContext.js'

export default function Report({ id }) {
  const { state, t, local, date, navigate, name } = usePortal(), result = state.results.find(r => r.id === id && r.status === 'published')
  if (!result) return <Empty title="resultUnavailable" action="backResults" onClick={() => navigate('results')} />
  const test = state.tests.find(t => t.id === result.testId)
  return <><Title title="resultReport"><div className="portal-row-actions"><ReportDownload result={result} /><Button secondary onClick={() => window.print()}><Printer size={15} />{t('print')}</Button></div></Title><article className="portal-card portal-report"><header className="portal-report-brand"><BrandLogo /><div><strong>Smart-LIMS</strong><p>{t('resultReport')}</p></div></header><div className="portal-report-info"><dl><dt>{t('name')}</dt><dd>{name}</dd><dt>{t('dob')}</dt><dd>{date(state.profile.dateOfBirth)}</dd><dt>{t('fileNumber')}</dt><dd><bdi>{state.profile.fileNumber}</bdi></dd></dl><dl><dt>{t('orderNumber')}</dt><dd><bdi>{result.orderId}</bdi></dd><dt>{t('sampleDate')}</dt><dd>{date(result.sampleDate)}</dd><dt>{t('resultDate')}</dt><dd>{date(result.date)}</dd></dl></div><h2>{local(test.name)}</h2><div className="portal-table-wrap"><table><thead><tr>{['test', 'result', 'unit', 'range', 'flag'].map(k => <th key={k}>{t(k)}</th>)}</tr></thead><tbody>{result.values.map((row, i) => <tr key={i}><th scope="row">{local(row.name)}</th><td><bdi>{row.value}</bdi></td><td><bdi>{row.unit}</bdi></td><td><bdi>{row.range}</bdi></td><td><Status value={row.flag} /></td></tr>)}</tbody></table></div><p className="portal-report-footnote">{t('reportHint')}</p></article><div className="portal-actions"><Button secondary onClick={() => navigate('results')}><ArrowLeft size={16} />{t('backResults')}</Button><VisitLink visit={visitForResult(state, id)} /></div></>
}
