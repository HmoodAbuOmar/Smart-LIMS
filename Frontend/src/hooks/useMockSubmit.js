import { useState } from 'react'

export function useMockSubmit(message = 'Saved locally for preview only — not sent to the API.') {
  const [notice, setNotice] = useState(null)

  const submit = (e) => {
    e?.preventDefault?.()
    setNotice(message)
  }

  return { notice, submit, clearNotice: () => setNotice(null) }
}
