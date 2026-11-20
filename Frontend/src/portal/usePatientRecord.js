import { useEffect, useState } from 'react'
import { portalApi } from '../services/portalApi.js'

export function usePatientRecord(kind, id, profile, development) {
  const [result, setResult] = useState(null)
  useEffect(() => {
    if (development || !id) return
    const controller = new AbortController()
    const options = { signal: controller.signal }
    const read = kind === 'order' ? portalApi.orderDetail(id, profile, options)
      : kind === 'test' ? portalApi.testDetail(id, options) : portalApi.resultDetail(id, options)
    read.then(record => {
      if (!controller.signal.aborted) setResult({ id, record })
    }, error => {
      if (!controller.signal.aborted) setResult({ id, error: error.code })
    })
    return () => controller.abort()
  }, [kind, id, profile, development])
  return result?.id === id ? result : null
}
