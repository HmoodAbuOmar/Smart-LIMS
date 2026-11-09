import { useEffect, useRef, useState } from 'react'

// Validation, duplicate-submission protection and cancellation shared by real forms.
export default function useFormAction({ values, fields, validate, action, onSuccess }) {
  const [errors, setErrors] = useState({})
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState(false)
  const request = useRef(null)
  useEffect(() => () => request.current?.abort(), [])

  function clearField(field) {
    setErrors(previous => ({ ...previous, [field]: undefined, ...(field === 'password' ? { confirmPassword: undefined } : {}) }))
    setFailure(false)
  }

  async function submit(event) {
    event.preventDefault()
    if (request.current) return
    const nextErrors = validate(values)
    setErrors(nextErrors)
    setFailure(false)
    const invalid = fields.find(field => nextErrors[field])
    if (invalid) {
      event.currentTarget.elements.namedItem(invalid)?.focus()
      return
    }
    const controller = new AbortController()
    request.current = controller
    setPending(true)
    try {
      const result = await action(values, { signal: controller.signal })
      if (!controller.signal.aborted) await onSuccess?.(result, { signal: controller.signal })
    } catch (error) {
      if (!controller.signal.aborted) setFailure(error?.code || 'OPERATION_FAILED')
    } finally {
      if (!controller.signal.aborted) { request.current = null; setPending(false) }
    }
  }
  return { errors, setErrors, clearField, pending, failure, submit }
}
