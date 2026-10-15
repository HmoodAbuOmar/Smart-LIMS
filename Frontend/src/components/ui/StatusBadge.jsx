const VARIANT_MAP = {
  ACTIVE: 'success',
  PUBLISHED: 'success',
  COMPLETED: 'success',
  PAID: 'success',
  ACCEPTED: 'success',
  CORRECTED: 'success',
  COLLECTED: 'info',
  RECEIVED: 'info',
  REGISTERED: 'info',
  IN_PROGRESS: 'info',
  SCHEDULED: 'info',
  STAT: 'danger',
  ROUTINE: 'neutral',
  PENDING: 'warning',
  AWAITING_SAMPLE: 'warning',
  DRAFT: 'neutral',
  CANCELLED: 'danger',
  REJECTED: 'danger',
  BLOCKED: 'danger',
  REPLACED: 'neutral',
}

export function StatusBadge({ status }) {
  const key = String(status ?? '').toUpperCase()
  const variant = VARIANT_MAP[key] ?? 'neutral'
  return <span className={`sl-badge sl-badge--${variant}`}>{status}</span>
}
