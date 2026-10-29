import { useId } from 'react'
import { FlaskConical } from 'lucide-react'
import { usePortal } from '../PortalContext.js'

export function Title({ title, hint, children }) { const { t } = usePortal(); return <div className="portal-heading"><div><h1 className="portal-page-title" tabIndex={-1}>{t(title)}</h1>{hint && <p>{t(hint)}</p>}</div>{children}</div> }

export function Button({ children, onClick, secondary = false, ...props }) { return <button type="button" className={`portal-button ${secondary ? 'is-secondary' : ''}`} onClick={onClick} {...props}>{children}</button> }

export function VisitLink({ visit }) { const { t, navigate } = usePortal(); return visit ? <Button secondary onClick={() => navigate(`history/${visit.id}`)}>{t('viewVisit')}</Button> : null }

export function Status({ value }) { const { t } = usePortal(); return <span className={`portal-status status-${value}`}>{t(value === 'published' ? 'available' : value)}</span> }

export function Empty({ title = 'noMatches', action = 'clear', onClick }) { const { t } = usePortal(); return <div className="portal-empty"><FlaskConical size={30} /><h2>{t(title)}</h2>{title === 'noMatches' && <p>{t('noMatchesHint')}</p>}{onClick && <Button secondary onClick={onClick}>{t(action)}</Button>}</div> }

export function Card({ title, action, children }) { const { t } = usePortal(); return <section className="portal-card"><div className="portal-card-heading"><h2>{t(title)}</h2>{action}</div>{children}</section> }

export function FilterTabs({ options, value, onChange }) { const { t } = usePortal(); return <div className="portal-filter-tabs" role="group" aria-label={t('status')}>{options.map(option => <button key={option} aria-pressed={value === option} onClick={() => onChange(option)}>{t(option)}</button>)}</div> }

export function Field({ label, name, error, children, ...props }) { const { t } = usePortal(); const id = useId(); return <div className="portal-field"><label htmlFor={id}>{t(label)}</label>{children ? <select id={id} name={name} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} {...props}>{children}</select> : <input id={id} name={name} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} {...props} />}{error && <span id={`${id}-error`} className="portal-error">{t(error)}</span>}</div> }
