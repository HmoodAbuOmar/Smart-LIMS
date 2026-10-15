import { useMockData } from '../../mock-data/MockDataProvider'
import { useListControls } from '../../hooks/useListControls'
import { ResourceListPage } from '../../components/pages/ResourceListPage'
import { StatusBadge } from '../../components/ui/StatusBadge'

export function AdminUsersPage() {
  const { state } = useMockData()
  const list = useListControls(state.users, {
    searchKeys: ['fullName', 'email', 'role'],
  })
  return (
    <ResourceListPage
      title="Users"
      description="Account management (demo)."
      createTo="/app/admin/users/new"
      createLabel="New user"
      columns={[
        { key: 'fullName', header: 'Name' },
        { key: 'email', header: 'Email' },
        { key: 'role', header: 'Role' },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      ]}
      rows={list.rows}
      onRowTo={(row) => `/app/admin/users/${row.id}`}
      toolbar={{
        search: list.search,
        onSearchChange: (v) => {
          list.setSearch(v)
          list.resetPage()
        },
      }}
      pagination={{ page: list.page, totalPages: list.totalPages, onPageChange: list.setPage }}
    />
  )
}
