import { useEffect, useState } from 'react'

export function usePortalPage(load, parameters, enabled) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  const query = JSON.stringify(parameters)
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    load(JSON.parse(query), { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setResult({ query, attempt, data })
    }, () => { if (!controller.signal.aborted) setResult({ query, attempt, error: true }) })
    return () => controller.abort()
  }, [load, query, attempt, enabled])
  return {
    response: result?.query === query && result.attempt === attempt ? result : null,
    retry: () => setAttempt(value => value + 1),
  }
}
