import { useState } from 'react'
import { visitForResult } from '../history/historyModel.js'
import { portalApi } from '../../services/portalApi.js'
import { usePortalPage } from '../usePortalPage.js'
import ReportDownload from '../components/ReportDownload.jsx'
import { Title, Button, VisitLink, Status, Empty, FilterTabs, Field, PageActions } from '../components/PortalUi.jsx'
import { usePortal } from '../PortalContext.js'
import { apiTestCategory, categories } from '../testCategories.js'

export default function Results() {
  const { state, t, local, date, navigate, development } = usePortal(), [search, setSearch] = useState(''), [category, setCategory] = useState('all'), [status, setStatus] = useState('all')
  const [page, setPage] = useState(0)
  const { response, retry } = usePortalPage(portalApi.loadResults, { page, search: search.trim() || undefined, category: apiTestCategory(category), tab: { availableResults: 'AVAILABLE', resultsPending: 'PENDING' }[status] }, !development)
  const results = !development ? response?.data?.content || [] : state.results.filter(r => { const test = state.tests.find(t => t.id === r.testId); return (status === 'all' || (status === 'availableResults' ? r.status === 'published' : r.status === 'pending')) && (category === 'all' || (r.category || test?.category) === category) && (r.testName || local(test?.name) || '').toLowerCase().includes(search.trim().toLowerCase()) })
  return <><Title title="results" hint="resultsHint" /><FilterTabs options={['all', 'availableResults', 'resultsPending']} value={status} onChange={value => { setStatus(value); setPage(0) }} /><div className="portal-controls"><Field label="searchResults" name="results-search" type="search" maxLength={150} value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} /><Field label="category" name="results-category" value={category} onChange={e => { setCategory(e.target.value); setPage(0) }}><option value="all">{t('allCategories')}</option>{categories.map(k => <option key={k} value={k}>{t(k)}</option>)}</Field></div><section className="portal-card">{!development && !response ? <p role="status">{t('loading')}</p> : response?.error ? <Empty title="unavailable" action="retry" onClick={retry} /> : results.length ? <div className="portal-table-wrap"><table><thead><tr>{['test', 'resultDate', 'status', 'actions'].map(k => <th key={k}>{t(k)}</th>)}</tr></thead><tbody>{results.map(r => <tr key={r.id}><th scope="row">{r.testName || local(state.tests.find(t => t.id === r.testId)?.name)}</th><td>{date(r.date)}</td><td><Status value={r.status} /></td><td><div className="portal-row-actions"><Button secondary disabled={r.status !== 'published'} onClick={() => navigate(`results/${r.id}`)}>{t('viewResult')}</Button><ReportDownload result={r} compact /><VisitLink visit={r.visit || visitForResult(state, r.id)} /></div></td></tr>)}</tbody></table></div> : <Empty onClick={() => { setSearch(''); setCategory('all'); setStatus('all'); setPage(0) }} />}<PageActions data={response?.data} page={page} onChange={setPage} /></section></>
}
