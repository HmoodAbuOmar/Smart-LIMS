import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, FileText, FlaskConical, Plus, Search } from 'lucide-react'
import { adminCatalogCopy } from '../adminCatalogCopy.js'
import { adminCatalogService } from '../adminCatalogService.js'
import { catalogName, catalogText, filterTests, rangeValidity, sortedParameters } from '../adminCatalogModel.js'
import AdminCatalogEditor from './AdminCatalogEditor.jsx'
import AdminCatalogDiscardDialog from './AdminCatalogDiscardDialog.jsx'
import AdminCatalogParametersTable from './AdminCatalogParametersTable.jsx'
import './adminCatalog.css'

const upsert = (list, record) => list.some(item => item.id === record.id) ? list.map(item => item.id === record.id ? record : item) : [...list, record]
export default function AdminTestCatalog({ language, activePage, onNavigate, onToggleLanguage, registerNavigationGuard, service = adminCatalogService }) {
  const copy = adminCatalogCopy[language], local = record => catalogName(record, language)
  const [data, setData] = useState({ tests: [], parameters: [], ranges: [] }), [loadState, setLoadState] = useState('loading'), [attempt, setAttempt] = useState(0)
  const [query, setQuery] = useState(''), [status, setStatus] = useState('all'), [page, setPage] = useState(1)
  const [testId, setTestId] = useState(''), [parameterId, setParameterId] = useState(''), [creating, setCreating] = useState(false), [mobileEditor, setMobileEditor] = useState(false)
  const [revision, setRevision] = useState(0), [dirty, setDirty] = useState(false), [formBusy, setFormBusy] = useState(false), [draftActive, setDraftActive] = useState(true), [pendingAction, setPendingAction] = useState(null)
  const [showHistory, setShowHistory] = useState(true), [notice, setNotice] = useState(''), [actionBusy, setActionBusy] = useState(false), [dialog, setDialog] = useState(null)
  const lock = useRef(false), testApi = useRef(null)
  const registerForm = useCallback(api => { testApi.current = api }, [])
  const test = creating ? undefined : data.tests.find(item => item.id === testId)
  const parameters = useMemo(() => sortedParameters(data.parameters.filter(item => item.testId === test?.id)), [data.parameters, test?.id])
  const parameter = parameters.find(item => item.id === parameterId) || parameters.find(item => item.active) || parameters[0]
  const ranges = data.ranges.filter(item => item.parameterId === parameter?.id && (showHistory || rangeValidity(item) !== 'expired'))
  const filtered = useMemo(() => filterTests(data.tests, query, status), [data.tests, query, status])
  const pages = Math.max(1, Math.ceil(filtered.length / 7)), currentPage = Math.min(page, pages), visible = filtered.slice((currentPage - 1) * 7, currentPage * 7)
  const section = activePage === 'parameters' ? 'parameters' : activePage === 'referenceRanges' ? 'referenceRanges' : 'tests'
  const number = value => new Intl.NumberFormat(language).format(value)
  const date = value => value ? new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(new Date(value.length === 10 ? `${value}T12:00:00` : value)) : copy.unbounded
  const request = useCallback(action => { if (formBusy || actionBusy) return; if (dirty) setPendingAction({ action }); else action() }, [dirty, formBusy, actionBusy])
  useEffect(() => {
    if (!registerNavigationGuard) return undefined
    registerNavigationGuard(action => request(() => { setMobileEditor(true); action() }))
    return () => registerNavigationGuard(null)
  }, [registerNavigationGuard, request])
  useEffect(() => {
    let active = true
    service.load().then(value => { if (active) { setData(value); setTestId(current => current || value.tests[0]?.id || ''); setLoadState('ready') } }).catch(() => { if (active) setLoadState('error') })
    return () => { active = false }
  }, [service, attempt])
  useEffect(() => { if (notice !== 'saved') return undefined; const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer) }, [notice])
  function reset() { setDirty(false); setRevision(value => value + 1) }
  function selectTest(id) { request(() => { reset(); setCreating(false); setTestId(id); setParameterId(''); setMobileEditor(true) }) }
  function newTest() { request(() => { reset(); setCreating(true); setParameterId(''); setMobileEditor(true); onNavigate('tests') }) }
  function navigate(id) { request(() => { reset(); onNavigate(id) }) }
  function saved(record, kind) {
    const collection = ['test', 'testStatus', 'deactivate'].includes(kind) ? 'tests' : kind === 'parameter' ? 'parameters' : 'ranges'
    setData(current => ({ ...current, [collection]: upsert(current[collection], record) }))
    if (kind === 'test') { setTestId(record.id); setCreating(false) }
    if (kind === 'parameter') setParameterId(record.id)
    reset(); setDialog(null); setNotice('saved')
  }
  async function toggle(record, kind) {
    if (lock.current) return
    if (kind === 'test' && record.active) { setDialog({ kind: 'deactivate', record }); return }
    lock.current = true; setActionBusy(true)
    try { saved(kind === 'test' ? await service.setTestActive(record.id, true) : await service.setParameterActive(record.id, !record.active), kind === 'test' ? 'testStatus' : kind) }
    catch { setNotice('saveError') }
    finally { lock.current = false; setActionBusy(false) }
  }
  function tabKeyDown(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const controls = [...event.currentTarget.parentElement.querySelectorAll('button:not(:disabled)')], index = controls.indexOf(event.currentTarget)
    const step = (event.key === 'ArrowRight' ? 1 : -1) * (language === 'ar' ? -1 : 1)
    const next = controls[event.key === 'Home' ? 0 : event.key === 'End' ? controls.length - 1 : (index + step + controls.length) % controls.length]
    next?.focus({ preventScroll: true }); next?.click()
  }
  const editorProps = { data, service, copy, language, onToggleLanguage, test, parameter }
  const table = (label, headers, body) => <div className="ac-table-scroll" role="region" aria-label={label} tabIndex={0}><table><caption className="ac-sr-only">{label}</caption><thead><tr>{headers.map(key => <th scope="col" key={key}>{copy[key]}</th>)}</tr></thead><tbody>{body}</tbody></table></div>
  const empty = (text, action) => <div className="ac-empty" role="status"><p>{text}</p>{action}</div>
  const addParameter = <button type="button" className="ac-primary" onClick={() => setDialog({ kind: 'parameter' })}><Plus size={15} aria-hidden="true" />{copy.addParameter}</button>
  return <section className="admin-catalog" aria-label={copy.title}>
    <div className="ac-heading"><span className="ac-heading-icon" aria-hidden="true"><FlaskConical size={23} /></span><div><h2>{copy.title}</h2><p>{copy.description}</p></div><button type="button" className="ac-primary" disabled={loadState !== 'ready' || formBusy || actionBusy} onClick={newTest}><Plus size={16} aria-hidden="true" />{copy.newTest}</button></div>
    {notice && <p className={notice === 'saved' ? 'ac-notice' : 'ac-error'} role="status">{copy[notice]}</p>}
    {loadState === 'loading' ? empty(copy.loading) : loadState === 'error' ? empty(copy.loadError, <button type="button" onClick={() => { setLoadState('loading'); setAttempt(value => value + 1) }}>{copy.retry}</button>) : <div className="ac-workspace" data-editor-open={mobileEditor}>
      <aside className="ac-list-pane ac-card" aria-label={copy.tests}>
        <div className="ac-list-tools"><label className="ac-search"><Search size={17} aria-hidden="true" /><span className="ac-sr-only">{copy.search}</span><input type="search" value={query} placeholder={copy.search} onChange={event => { setQuery(event.target.value); setPage(1) }} /></label>
          <div className="ac-status-filters" role="group" aria-label={copy.statusFilter}>{['all', 'active', 'inactive'].map(key => <button type="button" key={key} aria-pressed={status === key} onClick={() => { setStatus(key); setPage(1) }}>{copy[key]}</button>)}</div><p className="ac-muted" role="status">{copy.results}: {number(filtered.length)}</p></div>
        <ul className="ac-test-items">{visible.map(item => <li key={item.id}><button type="button" className={`ac-test-item${test?.id === item.id ? ' ac-selected' : ''}`} aria-current={test?.id === item.id ? 'true' : undefined} onClick={() => selectTest(item.id)}><span className="ac-item-top"><bdi>{item.code}</bdi>{!item.active && <span className="ac-badge">{copy.inactive}</span>}</span><span>{local(item)}</span></button></li>)}</ul>
        {!visible.length && empty(data.tests.length ? copy.noResults : copy.noTests, <button type="button" onClick={() => { setQuery(''); setStatus('all'); setPage(1) }}>{copy.clear}</button>)}
        <nav className="ac-footer ac-list-pagination" aria-label={copy.tests}><button type="button" aria-label={copy.previous} disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>{language === 'ar' ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}</button><span>{copy.page} {number(currentPage)} {copy.of} {number(pages)}</span><button type="button" aria-label={copy.next} disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>{language === 'ar' ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}</button></nav>
      </aside>
      <div className="ac-editor-pane ac-card">
        <button type="button" className="ac-mobile-back" onClick={() => request(() => { reset(); setMobileEditor(false) })}>{language === 'ar' ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}{copy.back}</button>
        {!test && !creating ? empty(copy.chooseTest) : <>
          <header className="ac-test-header"><div className="ac-test-identity"><bdi>{test?.code || copy.newTest}</bdi>{test && <><span aria-hidden="true">—</span><h3>{local(test)}</h3></>}</div><div className="ac-active-toggle"><button type="button" role="switch" aria-checked={section === 'tests' ? draftActive : test?.active || false} aria-labelledby="catalog-active-label" disabled={formBusy || actionBusy} onClick={() => { if (section === 'tests') testApi.current?.setActive(!draftActive); else request(() => toggle(test, 'test')) }}><span aria-hidden="true" /></button><span id="catalog-active-label">{copy.active}</span></div></header>
          <div className="ac-tabs" role="tablist" aria-label={copy.title}>{[['tests', 'details'], ['parameters', 'parameters'], ['referenceRanges', 'referenceRanges']].map(([id, key]) => <button type="button" role="tab" id={`catalog-tab-${id}`} aria-selected={section === id} tabIndex={section === id ? 0 : -1} aria-controls="catalog-panel" disabled={id !== 'tests' && !test} title={id !== 'tests' && !test ? copy.dependentHint : undefined} key={id} onClick={() => navigate(id)} onKeyDown={tabKeyDown}>{copy[key]}</button>)}</div>
          <div id="catalog-panel" className="ac-panel" role="tabpanel" aria-labelledby={`catalog-tab-${section}`}>
            {section === 'tests' ? <><AdminCatalogEditor key={`test-${test?.id || 'new'}-${revision}`} kind="test" record={test} {...editorProps} registerForm={registerForm} onActiveChange={setDraftActive} onDirtyChange={setDirty} onBusyChange={setFormBusy} onSaved={record => saved(record, 'test')} onClose={() => request(() => { reset(); if (creating) setCreating(false) })} />{creating && <p className="ac-muted">{copy.dependentHint}</p>}</> : section === 'parameters' ? <>
              <div className="ac-section-heading"><div><h3>{copy.parameters}</h3><p className="ac-muted">{local(test)}</p></div>{addParameter}</div>
              {!parameters.length ? empty(copy.noParameters, addParameter) : <AdminCatalogParametersTable parameters={parameters} language={language} copy={copy} busy={actionBusy} onEdit={item => setDialog({ kind: 'parameter', record: item })} onToggle={item => toggle(item, 'parameter')} onRanges={item => { setParameterId(item.id); navigate('referenceRanges') }} />}            </> : <>
              <section className="ac-ranges-tab" aria-label={copy.referenceRanges}>
              {!parameter ? empty(copy.addParameterFirst, <button type="button" onClick={() => navigate('parameters')}>{copy.parameters}</button>) : <>
              <div className="ac-range-select"><label>{copy.selectParameter}<select aria-label={copy.selectParameter} value={parameter.id} onChange={event => { const id = event.target.value; request(() => { reset(); setParameterId(id) }) }}>{parameters.map(item => <option value={item.id} key={item.id}>{item.code} · {local(item)}</option>)}</select></label><p className="ac-muted">{copy.valueType}: {copy[parameter.valueType]} · {copy.unit}: <bdi>{parameter.unit || copy.missing}</bdi></p></div>
              <h3 className="ac-range-context"><bdi>{test.code}</bdi><span aria-hidden="true">—</span><bdi>{parameter.code}</bdi><span aria-hidden="true">|</span><span>{local(parameter)}</span></h3>
              <label className="ac-history"><input type="checkbox" checked={showHistory} onChange={event => setShowHistory(event.target.checked)} />{copy.showHistory}</label>
                {!ranges.length ? <div className="ac-empty ac-range-empty"><FileText size={32} aria-hidden="true" /><h3>{copy.noRangesTitle}</h3><p>{copy.noRangesInstruction}</p></div> : table(copy.referenceRanges, ['sex', 'ageInterval', 'reference', 'validFrom', 'validTo', 'validity', 'actions'], ranges.map(item => <tr key={item.id}><th scope="row">{copy[item.sex]}</th><td><bdi>[{item.minAgeDays ?? '−∞'}, {item.maxAgeDays ?? '∞'})</bdi></td><td>{parameter.valueType === 'NUMERIC' ? <bdi>{item.lower ?? '−∞'} … {item.upper ?? '∞'} {parameter.unit}</bdi> : catalogText(item, 'reference', language)}</td><td>{date(item.validFrom)}</td><td>{date(item.validTo)}</td><td><span className={`ac-badge ac-${rangeValidity(item)}`}>{copy[rangeValidity(item)]}</span></td><td><button type="button" disabled={rangeValidity(item) === 'expired'} title={rangeValidity(item) === 'expired' ? copy.closedHint : undefined} onClick={() => request(() => { reset(); setDialog({ kind: 'close', record: item }) })}>{copy.closeRange}</button></td></tr>))}
                <AdminCatalogEditor key={`range-${parameter.id}-${revision}`} kind="range" inline {...editorProps} onDirtyChange={setDirty} onBusyChange={setFormBusy} onSaved={record => saved(record, 'range')} onClose={() => request(reset)} />
              </>}
              </section>
            </>}
          </div>
        </>}
      </div>
    </div>}
    {dialog && <AdminCatalogEditor key={`${dialog.kind}-${dialog.record?.id || 'new'}`} {...dialog} {...editorProps} onSaved={record => saved(record, dialog.kind)} onClose={() => setDialog(null)} />}
    {pendingAction && <AdminCatalogDiscardDialog copy={copy} onKeep={() => setPendingAction(null)} onDiscard={() => { const action = pendingAction.action; setPendingAction(null); reset(); action() }} />}
  </section>
}
