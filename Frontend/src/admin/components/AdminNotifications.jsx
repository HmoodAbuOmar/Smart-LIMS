import { useEffect, useState } from 'react'
import AdminLaboratoryAlerts from './AdminLaboratoryAlerts.jsx'
import { dashboardCopy } from '../dashboardCopy.js'
import { liveOverview } from '../adminLiveApi.js'

export default function AdminNotifications({ language, copy, live }) {
  const [result, setResult] = useState(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!live) return
    const controller = new AbortController()
    liveOverview.load(7, { signal: controller.signal }).then(
      data => { if (!controller.signal.aborted) setResult({ alerts: data.alerts, attempt }) },
      () => { if (!controller.signal.aborted) setResult({ error: true, attempt }) },
    )
    return () => controller.abort()
  }, [live, attempt])
  const current = result?.attempt === attempt ? result : null
  const number = new Intl.NumberFormat(language)
  return <section className="admin-overview admin-notifications-view" aria-labelledby="admin-page-title">
    <p>{copy.inboxUnavailable}</p>
    {live && (current?.error ? <p role="alert">{copy.alertsUnavailable}{' '}
      <button type="button" className="admin-overview-primary-button" onClick={() => setAttempt(value => value + 1)}>{copy.retry}</button>
    </p> : current ? <AdminLaboratoryAlerts alerts={current.alerts} copy={dashboardCopy[language]} number={value => number.format(value)} />
      : <p role="status">{copy.loading}</p>)}
  </section>
}
