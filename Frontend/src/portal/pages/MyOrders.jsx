import { useEffect, useState } from 'react'
import { portalApi } from '../../services/portalApi.js'
import OrderTable from '../components/OrderTable.jsx'
import { Title, Empty, FilterTabs, Field, Button } from '../components/PortalUi.jsx'
import { usePortal } from '../PortalContext.js'

export default function Orders() {
  const { state, development, t } = usePortal()
  const [status, setStatus] = useState('all'), [search, setSearch] = useState('')
  const [page, setPage] = useState(0), [attempt, setAttempt] = useState(0), [result, setResult] = useState(null)
  const key = JSON.stringify([status, search, page, attempt])
  const serverStatus = { pending: 'PENDING', inProgress: 'IN_PROGRESS', completed: 'COMPLETED', cancelled: 'CANCELLED' }[status]
  useEffect(() => {
    if (development) return
    const controller = new AbortController()
    portalApi.loadOrders(state.profile, { page, search: search.trim() || undefined, status: serverStatus }, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setResult({ key, value }) },
        () => { if (!controller.signal.aborted) setResult({ key, error: true }) })
    return () => controller.abort()
  }, [development, key, page, search, serverStatus, state.profile])
  const response = result?.key === key ? result : null
  const orders = development
    ? state.orders.filter(order => (status === 'all' || status === order.status) && (order.number || order.id).toLowerCase().includes(search.trim().toLowerCase()))
    : response?.value?.content || []
  function reset() { setSearch(''); setStatus('all'); setPage(0) }
  return <><Title title="orders" hint="ordersHint" />
    <FilterTabs options={['all', 'pending', 'inProgress', 'completed', 'cancelled']} value={status} onChange={value => { setStatus(value); setPage(0) }} />
    <div className="portal-controls"><Field label="searchOrders" name="order-search" type="search" maxLength={30} value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} /></div>
    <section className="portal-card">
      {!development && !response ? <p role="status">{t('loading')}</p> : response?.error ? <Empty title="unavailable" action="retry" onClick={() => setAttempt(attempt + 1)} />
        : orders.length ? <OrderTable orders={orders} /> : <Empty onClick={reset} />}
      {response?.value && (page > 0 || !response.value.last) && <div className="portal-actions">
        <Button secondary disabled={page === 0} onClick={() => setPage(page - 1)}>{t('previous')}</Button>
        <Button secondary disabled={response.value.last || page + 1 >= response.value.totalPages} onClick={() => setPage(page + 1)}>{t('next')}</Button>
      </div>}
    </section></>
}
