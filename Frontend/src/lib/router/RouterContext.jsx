import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { findRoute } from './pathUtils'

const RouterContext = createContext(null)

function getPathname() {
  return window.location.pathname || '/'
}

export function RouterProvider({ routes, children }) {
  const [pathname, setPathname] = useState(getPathname)

  useEffect(() => {
    const onPop = () => setPathname(getPathname())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback((to, { replace = false } = {}) => {
    if (replace) {
      window.history.replaceState({}, '', to)
    } else {
      window.history.pushState({}, '', to)
    }
    setPathname(getPathname())
  }, [])

  const matched = useMemo(
    () => findRoute(routes, pathname),
    [routes, pathname],
  )

  const value = useMemo(
    () => ({
      pathname,
      navigate,
      params: matched?.params ?? {},
      route: matched?.route ?? null,
    }),
    [pathname, navigate, matched],
  )

  return (
    <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
  )
}

export function useRouter() {
  const ctx = useContext(RouterContext)
  if (!ctx) {
    throw new Error('useRouter must be used within RouterProvider')
  }
  return ctx
}

export function Link({ to, children, className, ...rest }) {
  const { navigate } = useRouter()
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        if (
          e.button === 0 &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.shiftKey &&
          !e.altKey
        ) {
          e.preventDefault()
          navigate(to)
        }
      }}
      {...rest}
    >
      {children}
    </a>
  )
}
