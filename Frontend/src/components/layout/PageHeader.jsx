export function PageHeader({ title, description, actions }) {
  return (
    <header className="sl-page-header sl-row" style={{ justifyContent: 'space-between' }}>
      <div>
        <h1>{title}</h1>
        {description ? <p className="sl-page-header__desc">{description}</p> : null}
      </div>
      {actions ? <div className="sl-row">{actions}</div> : null}
    </header>
  )
}
