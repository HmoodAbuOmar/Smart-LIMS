export function MockBanner({ message }) {
  return (
    <div className="sl-alert sl-alert--mock" role="status">
      {message ??
        'Preview mode: data and saves are mocked. Backend API is not connected.'}
    </div>
  )
}
