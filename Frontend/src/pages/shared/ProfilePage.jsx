import { useAuth } from '../../lib/auth/AuthContext'
import { PageHeader } from '../../components/layout/PageHeader'
import { MockBanner } from '../../components/feedback/MockBanner'
import { Card } from '../../components/ui/Card'
import { ROLE_LABELS } from '../../lib/constants/roles'

export function ProfilePage() {
  const { user } = useAuth()

  return (
    <>
      <PageHeader title="Account profile" description="Signed-in user (mock session)." />
      <MockBanner />
      <Card title="Details">
        <dl style={{ margin: 0, display: 'grid', gap: 12 }}>
          <div>
            <dt style={{ fontSize: 'var(--sl-text-xs)', color: 'var(--sl-text-muted)' }}>Name</dt>
            <dd style={{ margin: 0 }}>{user?.fullName}</dd>
          </div>
          <div>
            <dt style={{ fontSize: 'var(--sl-text-xs)', color: 'var(--sl-text-muted)' }}>Email</dt>
            <dd style={{ margin: 0 }}>{user?.email}</dd>
          </div>
          <div>
            <dt style={{ fontSize: 'var(--sl-text-xs)', color: 'var(--sl-text-muted)' }}>Role</dt>
            <dd style={{ margin: 0 }}>{ROLE_LABELS[user?.role] ?? user?.role}</dd>
          </div>
          {user?.patientId ? (
            <div>
              <dt style={{ fontSize: 'var(--sl-text-xs)', color: 'var(--sl-text-muted)' }}>
                Linked patient ID (UNVERIFIED field)
              </dt>
              <dd style={{ margin: 0 }}>{user.patientId}</dd>
            </div>
          ) : null}
        </dl>
      </Card>
    </>
  )
}
