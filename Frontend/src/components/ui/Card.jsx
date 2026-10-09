export function Card({ title, actions, children, className = '' }) {
  return (
    <div className={`sl-card ${className}`.trim()}>
      {title || actions ? (
        <div className="sl-card__header sl-row" style={{ justifyContent: 'space-between' }}>
          {title ? <h2 style={{ margin: 0 }}>{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      <div className="sl-card__body">{children}</div>
    </div>
  )
}
