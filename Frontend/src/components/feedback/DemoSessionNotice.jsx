export function DemoSessionNotice({
  message = 'This action updates demo data in your browser session only — not a real database or server.',
}) {
  return (
    <div className="sl-alert sl-alert--warning" role="status">
      {message}
    </div>
  )
}
