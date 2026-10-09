export function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="sl-auth-layout">
      <aside className="sl-auth-layout__brand">
        <p style={{ fontWeight: 600, letterSpacing: '0.08em', fontSize: '0.75rem' }}>
          SMART-LIMS
        </p>
        <h1>Laboratory information management</h1>
        <p>
          Coordinate patients, test orders, appointments, samples, and results in
          one secure workspace. This preview uses mock data until the API is connected.
        </p>
      </aside>
      <main className="sl-auth-layout__form">
        <div className="sl-auth-panel">
          {title ? <h1 className="sl-auth-panel__title">{title}</h1> : null}
          {subtitle ? (
            <p className="sl-auth-panel__subtitle">{subtitle}</p>
          ) : null}
          {children}
        </div>
      </main>
    </div>
  )
}
