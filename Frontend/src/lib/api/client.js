/**
 * API client placeholder — wire to backend when contracts are verified.
 * See Frontend/docs/CONTRACT_GAPS.md
 */

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? ''
const useMocks = import.meta.env.VITE_USE_MOCKS !== 'false'

export function getApiConfig() {
  return { baseUrl, useMocks }
}

export async function apiFetch(path, options = {}) {
  if (useMocks || !baseUrl) {
    throw new Error(
      `API not configured (mock mode). Attempted: ${path}. Set VITE_API_BASE_URL and VITE_USE_MOCKS=false when ready.`,
    )
  }
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  return response
}
