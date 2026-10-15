import { Outlet } from 'react-router-dom'
import { MockDataProvider } from '../mock-data/MockDataProvider'
import { AuthProvider } from '../lib/auth/AuthContext'

export function Root() {
  return (
    <MockDataProvider>
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    </MockDataProvider>
  )
}
