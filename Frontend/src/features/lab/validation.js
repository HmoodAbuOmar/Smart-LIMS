export function validateDraftValues(values) {
  if (!values?.length) {
    return { ok: false, message: 'No result parameters are configured for this test.' }
  }
  for (const v of values) {
    const text = String(v.value ?? '').trim()
    if (!text) {
      return { ok: false, message: `${v.parameterCode} is required.` }
    }
    if (v.valueType === 'numeric' && Number.isNaN(Number(text))) {
      return { ok: false, message: `${v.parameterCode} must be a number.` }
    }
  }
  return { ok: true }
}

export function draftIsComplete(values) {
  return validateDraftValues(values).ok
}
