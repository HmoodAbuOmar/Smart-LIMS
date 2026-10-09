import { FormField } from '../../components/ui/FormField'
import { TextInput } from '../../components/ui/TextInput'
import { Select } from '../../components/ui/Select'
import { MockFormPage } from '../../components/pages/MockFormPage'
import { ROLES } from '../../lib/constants/roles'

export function AdminUserNewPage() {
  return (
    <MockFormPage
      title="Create user"
      description="Admin user creation form (mock). Verify POST `/api/users`."
      submitLabel="Create user"
    >
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
    </MockFormPage>
  )
}
