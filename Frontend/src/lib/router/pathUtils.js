export function matchPath(pattern, pathname) {
  const patternParts = pattern.split('/').filter(Boolean)
  const pathParts = pathname.split('/').filter(Boolean)

  if (patternParts.length !== pathParts.length) {
    return null
  }

  const params = {}
  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i]
    const vp = pathParts[i]
    if (pp.startsWith(':')) {
      params[pp.slice(1)] = decodeURIComponent(vp)
    } else if (pp !== vp) {
      return null
    }
  }
  return params
}

export function findRoute(routes, pathname) {
  for (const route of routes) {
    if (route.path === pathname) {
      return { route, params: {} }
    }
    if (route.path.includes(':')) {
      const params = matchPath(route.path, pathname)
      if (params) {
        return { route, params }
      }
    }
  }
  return null
}
