import BrandLogo from './BrandLogo.jsx'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Clock, FileText, FlaskConical, TestTubes, Users, X } from 'lucide-react'
import { productShowcaseDemo } from './productShowcaseDemo.js'
import './ProductShowcase.css'

// Local-only showcase records, separate from patient accounts and API payloads.
const previews = [
  { id: 'samples', icon: TestTubes, columns: ['sampleId', 'testType', 'status'], rows: productShowcaseDemo.samples },
  { id: 'reports', icon: FileText, columns: ['reportId', 'reportType', 'status'], rows: productShowcaseDemo.reports },
  { id: 'patients', icon: Users, columns: ['patientId', 'recordLabel', 'recordStatus'], rows: productShowcaseDemo.patients },
]

function PreviewStatus({ status, label }) {
  const complete = status === 'ready' || status === 'completed'
  const StatusIcon = complete ? Check : status === 'rejected' ? X : status === 'processing' ? FlaskConical : Clock
  return <span className={`showcase-status ${complete ? 'is-complete' : ''}`}><StatusIcon size={13} aria-hidden="true" />{label}</span>
}

export default function ProductShowcase() {
  const { t, i18n } = useTranslation('showcase')
  const [activeTab, setActiveTab] = useState('samples')
  const tabRefs = useRef({})
  const language = i18n.resolvedLanguage?.startsWith('ar') ? 'ar' : 'en'
  const collectionDate = value => new Intl.DateTimeFormat(language, {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))

  function navigateTabs(event, index) {
    const rtl = i18n.dir() === 'rtl'
    let next
    if (event.key === 'ArrowRight') next = (index + (rtl ? -1 : 1) + previews.length) % previews.length
    if (event.key === 'ArrowLeft') next = (index + (rtl ? 1 : -1) + previews.length) % previews.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = previews.length - 1
    if (next !== undefined) {
      event.preventDefault()
      const id = previews[next].id
      setActiveTab(id)
      tabRefs.current[id]?.focus()
    }
  }

  return <section id="platform-preview" className="product-showcase" aria-labelledby="showcase-heading">
    <div className="container section">
      <div className="section-heading centered">
        <h2 id="showcase-heading">{t('heading')}</h2>
        <p>{t('description')}</p>
      </div>
      <div className="showcase-workspace">
        <div className="showcase-chrome">
          <div className="showcase-brand"><BrandLogo className="showcase-approved-logo" /></div>
        </div>
        <div className="showcase-tabs" role="tablist" aria-label={t('tabsLabel')} aria-orientation="horizontal">
          {previews.map(({ id, icon: Icon }, index) => <button
            key={id}
            ref={element => { tabRefs.current[id] = element }}
            type="button"
            role="tab"
            id={`showcase-tab-${id}`}
            aria-controls={`showcase-panel-${id}`}
            aria-selected={activeTab === id}
            tabIndex={activeTab === id ? 0 : -1}
            onClick={() => setActiveTab(id)}
            onKeyDown={event => navigateTabs(event, index)}
          ><Icon size={18} aria-hidden="true" />{t(`tabs.${id}`)}</button>)}
        </div>
        {previews.map(({ id, columns, rows }) => <div
          key={id}
          id={`showcase-panel-${id}`}
          className="showcase-panel"
          role="tabpanel"
          aria-labelledby={`showcase-tab-${id}`}
          hidden={activeTab !== id}
          tabIndex={0}
        >
          <div className="showcase-panel-heading"><div><h3>{t(`panelTitles.${id}`)}</h3></div><span className="showcase-record-count">{t('records', { total: new Intl.NumberFormat(i18n.resolvedLanguage).format(rows.length) })}</span></div>
          <div className="showcase-table-scroll" role="region" aria-label={t('tableLabel', { type: t(`tabs.${id}`) })} tabIndex={0}>
            <table>
              <thead><tr>{columns.map(column => <th key={column} scope="col">{t(`columns.${column}`)}</th>)}</tr></thead>
              <tbody>{!rows.length && <tr><td colSpan={columns.length} style={{ height: 156 }}>{t('empty')}</td></tr>}{rows.map(row => <tr key={row.id}>
                <th scope="row"><span className="showcase-record-id" lang="en" dir="ltr">{row.id.replace(/^DEMO-/, '')}</span></th>
                <td>{row.name ? row.name[language] : t(row.label)}{row.collectedOn && <small className="showcase-collection-date">{t('collectedOn')}: <time dateTime={row.collectedOn}>{collectionDate(row.collectedOn)}</time></small>}</td>
                <td><PreviewStatus status={row.status} label={t(`statuses.${row.status}`)} /></td>
              </tr>)}</tbody>
            </table>
          </div>
        </div>)}
      </div>
    </div>
  </section>
}
