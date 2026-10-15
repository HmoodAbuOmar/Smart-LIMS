import { useParams } from 'react-router-dom'
import { useMockData } from '../../mock-data/MockDataProvider'
import { EntityDetailPage } from '../../components/pages/EntityDetailPage'
import { NotFoundPage } from '../shared/NotFoundPage'

export function AdminUserDetailPage() {
  const { id } = useParams()
  const { state } = useMockData()
  const user = state.users.find((u) => u.id === id)
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
