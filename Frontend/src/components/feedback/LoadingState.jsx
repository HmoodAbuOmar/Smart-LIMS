export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="sl-empty" aria-busy="true" aria-live="polite">
      <div className="sl-skeleton" style={{ height: 24, width: 160, margin: '0 auto' }} />
      <p style={{ marginTop: 16 }}>{label}</p>
    </div>
  )
}
