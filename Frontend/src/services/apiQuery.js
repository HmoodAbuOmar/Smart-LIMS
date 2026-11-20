import { authenticatedRequest } from '../auth/cookieSession.js'

export function queryApi(path, params = {}, options) {
  const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== null))
  return authenticatedRequest(search.size ? path + '?' + search : path, options)
}

export async function listApi(path, params, options) {
  const items = []
  for (let page = 0; ; page++) {
    const response = await queryApi(path, { ...params, page, size: 100 }, options)
    if (Array.isArray(response)) return response
    items.push(...response.content)
    if (response.last || page + 1 >= response.totalPages || !response.content.length) return items
  }
}
