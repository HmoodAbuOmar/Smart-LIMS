import { RouterProvider, useRouter } from '../lib/router/RouterContext'
import { AuthProvider } from '../lib/auth/AuthContext'
import { routes, resolveRouteElement } from './routes'

function AppRoutes() {
  const { pathname } = useRouter()
  return resolveRouteElement(pathname, routes)
}

export default function App() {
  return (
    <RouterProvider routes={routes}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </RouterProvider>
  )
}
