import { useEffect, useState } from 'react'
import { Check, FlaskConical, Plus, Search } from 'lucide-react'
import { Title, Button, Empty, FilterTabs, Field } from '../components/PortalUi.jsx'
import { usePortal } from '../PortalContext.js'
import { portalApi } from '../../services/portalApi.js'
import { apiTestCategory, categories } from '../testCategories.js'

export default function Catalog({ query }) {
  const { state, t, local, money, navigate, addAndBook, development } = usePortal()
  const [search, setSearch] = useState(new URLSearchParams(query).get('q') || ''), [category, setCategory] = useState('all')
  const [page, setPage] = useState(0), [attempt, setAttempt] = useState(0), [result, setResult] = useState(null)
  const key = JSON.stringify([search, category, page, attempt])
  useEffect(() => {
    if (development) return
    const controller = new AbortController()
    portalApi.loadTests({ page, search: search.trim().slice(0, 150) || undefined, category: apiTestCategory(category) }, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setResult({ key, data }) }, () => { if (!controller.signal.aborted) setResult({ key, error: true }) })
    return () => controller.abort()
  }, [development, key, category, page, search])
  const response = result?.key === key ? result : null
  const matches = !development ? response?.data?.content || [] : state.tests.filter(test => (category === 'all' || (test.categories || [test.category]).includes(category)) && `${local(test.name)} ${local(test.description)}`.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()))
  const reset = () => { setSearch(''); setCategory('all'); setPage(0) }
  function changeCategory(value) { setCategory(value); setPage(0) }
  return <><Title title="tests" hint="catalogHint"><Button onClick={() => navigate('review')}>{t('review')} ({state.cart.length})</Button></Title><div className="portal-controls"><div className="portal-field portal-catalog-search"><Search size={17} aria-hidden="true" /><input name="test-search" type="search" aria-label={t('search')} placeholder={t('search')} maxLength={150} value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} /></div><Field label="category" name="test-category" value={category} onChange={e => changeCategory(e.target.value)}><option value="all">{t('allCategories')}</option>{categories.map(k => <option key={k} value={k}>{t(k)}</option>)}</Field><button className="portal-text" onClick={reset}>{t('clear')}</button></div><FilterTabs options={['all', ...categories]} value={category} onChange={changeCategory} />{!development && !response ? <p role="status">{t('loading')}</p> : response?.error ? <Empty title="unavailable" action="retry" onClick={() => setAttempt(attempt + 1)} /> : matches.length ? <div className="portal-test-grid">{matches.map(test => <article className="portal-test-card" key={test.id}><span className="portal-icon"><FlaskConical size={23} /></span><small>{t(test.category)}</small><h2>{local(test.name)}</h2><p>{local(test.description)}</p><strong>{money(test.price)}</strong><div><Button secondary onClick={() => navigate(`tests/${test.id}`)}>{t('view')}</Button><Button disabled={state.cart.includes(test.id)} onClick={() => addAndBook(test.id, test)}>{state.cart.includes(test.id) ? <Check size={15} /> : <Plus size={15} />}{t(state.cart.includes(test.id) ? 'added' : 'add')}</Button></div></article>)}</div> : <Empty onClick={reset} />}{response?.data && (page > 0 || !response.data.last) && <div className="portal-actions"><Button secondary disabled={page === 0} onClick={() => setPage(page - 1)}>{t('previous')}</Button><Button secondary disabled={response.data.last || page + 1 >= response.data.totalPages} onClick={() => setPage(page + 1)}>{t('next')}</Button></div>}</>
}
