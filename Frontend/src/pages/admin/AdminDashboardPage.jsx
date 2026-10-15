import { Link } from 'react-router-dom'
import { useMockData } from '../../mock-data/MockDataProvider'
import { PageHeader } from '../../components/layout/PageHeader'
import { DashboardStats } from '../../components/pages/DashboardStats'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'

export function AdminDashboardPage() {
  const { state, resetDemo } = useMockData()

  return (
    <>
      <PageHeader
        title="Admin dashboard"
        description="Operational overview with demo metrics."
        actions={
          <Button variant="secondary" onClick={resetDemo}>
            Reset demo data
          </Button>
        }
      />
      <DashboardStats
        stats={[
          { label: 'Users', value: state.users.length },
          { label: 'Patients', value: state.patients.length },
          { label: 'Open orders', value: state.orders.filter((o) => o.status === 'PENDING').length },
          { label: 'Audit events', value: state.auditLogs.length },
        ]}
      />
      <div style={{ marginTop: 'var(--sl-space-6)' }}>
        <Card title="Quick links">
          <div className="sl-row">
            <Link to="/app/admin/users">
              <Button variant="secondary">Manage users</Button>
            </Link>
            <Link to="/app/admin/tests">
              <Button variant="secondary">Test catalog</Button>
            </Link>
            <Link to="/app/admin/audit-logs">
              <Button variant="secondary">Audit logs</Button>
            </Link>
          </div>
        </Card>
      </div>
    </>
  )
}
