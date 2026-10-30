import { useState } from 'react'
import { Check, FlaskConical, Plus, Search } from 'lucide-react'
import { Title, Button, Empty, FilterTabs, Field } from '../components/PortalUi.jsx'
import { usePortal } from '../PortalContext.js'
import { categories } from '../testCategories.js'

export default function Catalog({ query }) {
  const { state, t, local, money, navigate, addAndBook } = usePortal()
  const [search, setSearch] = useState(new URLSearchParams(query).get('q') || ''), [category, setCategory] = useState('all')
  const matches = state.tests.filter(test => (category === 'all' || category === test.category) && `${local(test.name)} ${local(test.description)}`.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()))
  const reset = () => { setSearch(''); setCategory('all') }
  return <><Title title="tests" hint="catalogHint"><Button onClick={() => navigate('review')}>{t('review')} ({state.cart.length})</Button></Title><div className="portal-controls"><div className="portal-field portal-catalog-search"><Search size={17} aria-hidden="true" /><input name="test-search" type="search" aria-label={t('search')} placeholder={t('search')} value={search} onChange={e => setSearch(e.target.value)} /></div><Field label="category" name="test-category" value={category} onChange={e => setCategory(e.target.value)}><option value="all">{t('allCategories')}</option>{categories.map(k => <option key={k} value={k}>{t(k)}</option>)}</Field><button className="portal-text" onClick={reset}>{t('clear')}</button></div><FilterTabs options={['all', ...categories]} value={category} onChange={setCategory} />{matches.length ? <div className="portal-test-grid">{matches.map(test => <article className="portal-test-card" key={test.id}><span className="portal-icon"><FlaskConical size={23} /></span><small>{t(test.category)}</small><h2>{local(test.name)}</h2><p>{local(test.description)}</p><strong>{money(test.price)}</strong><div><Button secondary onClick={() => navigate(`tests/${test.id}`)}>{t('view')}</Button><Button disabled={state.cart.includes(test.id)} onClick={() => addAndBook(test.id)}>{state.cart.includes(test.id) ? <Check size={15} /> : <Plus size={15} />}{t(state.cart.includes(test.id) ? 'added' : 'add')}</Button></div></article>)}</div> : <Empty onClick={reset} />}</>
}
