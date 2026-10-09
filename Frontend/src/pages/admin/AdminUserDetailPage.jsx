import { useRouter } from '../../lib/router/RouterContext'
import { EntityDetailPage } from '../../components/pages/EntityDetailPage'
import { findById, mockUsers } from '../../mocks/fixtures'
import { NotFoundPage } from '../shared/NotFoundPage'

export function AdminUserDetailPage() {
  const { params } = useRouter()
  const user = findById(mockUsers, params.id)
  if (!user) return <NotFoundPage />

  return (
    <EntityDetailPage
      title={user.fullName}
      description={`User ${user.id}`}
      backTo="/app/admin/users"
      fields={[
        { label: 'Email', value: user.email },
        { label: 'Role', value: user.role },
        { label: 'Status', value: user.status },
      ]}
    />
  )
}
