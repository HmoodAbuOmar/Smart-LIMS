import { MockBanner } from '../feedback/MockBanner'
import { PageHeader } from '../layout/PageHeader'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Link } from '../../lib/router/RouterContext'

export function EntityDetailPage({
  title,
  description,
  fields,
  backTo,
  editTo,
  children,
}) {
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            {backTo ? (
              <Link to={backTo}>
                <Button variant="secondary">Back</Button>
              </Link>
            ) : null}
            {editTo ? (
              <Link to={editTo}>
                <Button variant="primary">Edit</Button>
              </Link>
            ) : null}
          </>
        }
      />
      <MockBanner />
      <Card>
        {fields ? (
          <dl style={{ margin: 0, display: 'grid', gap: 12 }}>
            {fields.map(({ label, value }) => (
              <div key={label}>
                <dt style={{ fontSize: 'var(--sl-text-xs)', color: 'var(--sl-text-muted)' }}>
                  {label}
                </dt>
                <dd style={{ margin: 0 }}>{value ?? '—'}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {children}
      </Card>
    </>
  )
}
