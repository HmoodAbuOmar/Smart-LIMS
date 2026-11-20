let snapshot
export async function loadAuditEvents(development = false) {
  if (!import.meta.env?.DEV || !development) {
    const error = new Error('Audit service unavailable')
    error.code = 'AUDIT_UNAVAILABLE'
    throw error
  }
  const { createEvents } = await import('./auditLogData.js')
  await new Promise(resolve => setTimeout(resolve, 140))
  snapshot ??= createEvents()
  return structuredClone(snapshot)
}
export const auditLogService = { load: () => loadAuditEvents(import.meta.env.DEV) }
