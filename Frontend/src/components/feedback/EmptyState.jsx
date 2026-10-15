export function EmptyState({ title = 'No records', description, action }) {
  return (
    <div className="sl-empty">
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  )
}
