import { useState } from 'react'
import { visitForResult } from '../history/historyModel.js'
import ReportDownload from '../components/ReportDownload.jsx'
import { Title, Button, VisitLink, Status, Empty, FilterTabs, Field } from '../components/PortalUi.jsx'
import { usePortal } from '../PortalContext.js'
import { categories } from '../testCategories.js'

export default function Results() {
  const { state, t, local, date, navigate } = usePortal(), [search, setSearch] = useState(''), [category, setCategory] = useState('all'), [status, setStatus] = useState('all')
  const results = state.results.filter(r => { const test = state.tests.find(t => t.id === r.testId); return (status === 'all' || (status === 'availableResults' ? r.status === 'published' : r.status === 'pending')) && (category === 'all' || test.category === category) && local(test.name).toLowerCase().includes(search.trim().toLowerCase()) })
  return <><Title title="results" hint="resultsHint" /><FilterTabs options={['all', 'availableResults', 'resultsPending']} value={status} onChange={setStatus} /><div className="portal-controls"><Field label="searchResults" name="results-search" type="search" value={search} onChange={e => setSearch(e.target.value)} /><Field label="category" name="results-category" value={category} onChange={e => setCategory(e.target.value)}><option value="all">{t('allCategories')}</option>{categories.map(k => <option key={k} value={k}>{t(k)}</option>)}</Field></div><section className="portal-card">{results.length ? <div className="portal-table-wrap"><table><thead><tr>{['test', 'resultDate', 'status', 'actions'].map(k => <th key={k}>{t(k)}</th>)}</tr></thead><tbody>{results.map(r => <tr key={r.id}><th scope="row">{local(state.tests.find(t => t.id === r.testId).name)}</th><td>{date(r.date)}</td><td><Status value={r.status} /></td><td><div className="portal-row-actions"><Button secondary disabled={r.status !== 'published'} onClick={() => navigate(`results/${r.id}`)}>{t('viewResult')}</Button><ReportDownload result={r} compact /><VisitLink visit={visitForResult(state, r.id)} /></div></td></tr>)}</tbody></table></div> : <Empty onClick={() => { setSearch(''); setCategory('all'); setStatus('all') }} />}</section></>
}
