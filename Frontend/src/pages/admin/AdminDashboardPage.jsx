import { MockBanner } from '../../components/feedback/MockBanner'
import { PageHeader } from '../../components/layout/PageHeader'
import { DashboardStats } from '../../components/pages/DashboardStats'
import { Card } from '../../components/ui/Card'
import { mockAuditLogs, mockUsers } from '../../mocks/fixtures'

export function AdminDashboardPage() {
  return (
    <>
      <PageHeader
        title="Admin dashboard"
        description="Overview of users, catalog configuration, and audit activity (mock)."
      />
      <MockBanner />
      <DashboardStats
        stats={[
          { label: 'Active users', value: mockUsers.length },
          { label: 'Laboratory tests', value: 3 },
          { label: 'Audit events (24h)', value: mockAuditLogs.length },
          { label: 'Open slots today', value: 2 },
        ]}
      />
      <div style={{ marginTop: 'var(--sl-space-6)' }}>
      <Card title="Recent audit events">
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {mockAuditLogs.map((log) => (
            <li key={log.id}>
              {log.timestamp}: {log.action} — {log.actor}
            </li>
          ))}
        </ul>
      </Card>
      </div>
    </>
  )
}
