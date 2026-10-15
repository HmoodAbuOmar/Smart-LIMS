import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth/AuthContext'
import { useMockData } from '../../mock-data/MockDataProvider'
import { PageHeader } from '../../components/layout/PageHeader'
import { Card } from '../../components/ui/Card'
import { FormField } from '../../components/ui/FormField'
import { TextInput } from '../../components/ui/TextInput'
import { Select } from '../../components/ui/Select'
import { Button } from '../../components/ui/Button'
import { ROLES } from '../../lib/constants/roles'

export function AdminUserNewPage() {
  const { addUser } = useMockData()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [notice, setNotice] = useState(null)

  const onSubmit = (e) => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const row = addUser(
      {
        fullName: fd.get('fullName'),
        email: fd.get('email'),
        role: fd.get('role'),
      },
      user?.email,
    )
    setNotice('User saved in demo session only.')
    navigate(`/app/admin/users/${row.id}`)
  }

  return (
    <>
      <PageHeader title="Create user" description="Demo user creation (browser session)." />
      {notice ? <div className="sl-alert sl-alert--warning">{notice}</div> : null}
      <Card>
        <form onSubmit={onSubmit}>
          <FormField id="fullName" label="Full name" required>
            <TextInput id="fullName" name="fullName" required />
          </FormField>
          <FormField id="email" label="Email" required>
            <TextInput id="email" name="email" type="email" required />
          </FormField>
          <FormField id="role" label="Role" required>
            <Select id="role" name="role" defaultValue={ROLES.PATIENT}>
              {Object.values(ROLES).map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </Select>
          </FormField>
          <Button type="submit" variant="primary">
            Create user
          </Button>
        </form>
      </Card>
    </>
  )
}
