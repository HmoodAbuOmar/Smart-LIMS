import { ResourceListPage } from '../../components/pages/ResourceListPage'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { mockUsers } from '../../mocks/fixtures'

export function AdminUsersPage() {
  return (
    <ResourceListPage
      title="Users"
      description="Account management (mock). Verify `/api/users` before integration."
      createTo="/app/admin/users/new"
      createLabel="New user"
      columns={[
        { key: 'fullName', header: 'Name' },
        { key: 'email', header: 'Email' },
        { key: 'role', header: 'Role' },
        {
          key: 'status',
          header: 'Status',
          render: (row) => <StatusBadge status={row.status} />,
        },
      ]}
      rows={mockUsers}
      onRowTo={(row) => `/app/admin/users/${row.id}`}
    />
  )
}
