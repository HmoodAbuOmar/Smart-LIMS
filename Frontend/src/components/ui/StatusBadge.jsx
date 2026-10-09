const VARIANT_MAP = {
  ACTIVE: 'success',
  PUBLISHED: 'success',
  COMPLETED: 'success',
  PAID: 'success',
  COLLECTED: 'info',
  PENDING: 'warning',
  DRAFT: 'neutral',
  SCHEDULED: 'info',
  CANCELLED: 'danger',
  REJECTED: 'danger',
  BLOCKED: 'danger',
}

export function StatusBadge({ status }) {
  const key = String(status ?? '').toUpperCase()
  const variant = VARIANT_MAP[key] ?? 'neutral'
  return <span className={`sl-badge sl-badge--${variant}`}>{status}</span>
}
