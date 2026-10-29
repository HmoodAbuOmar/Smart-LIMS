import { useState } from 'react'
import OrderTable from '../components/OrderTable.jsx'
import { Title, Empty, FilterTabs, Field } from '../components/PortalUi.jsx'
import { usePortal } from '../PortalContext.js'

export default function Orders() {
  const { state } = usePortal(), [status, setStatus] = useState('all'), [search, setSearch] = useState('')
  const orders = state.orders.filter(order => (status === 'all' || status === order.status) && order.id.toLowerCase().includes(search.trim().toLowerCase()))
  return <><Title title="orders" hint="ordersHint" /><FilterTabs options={['all', 'pending', 'inProgress', 'completed', 'cancelled']} value={status} onChange={setStatus} /><div className="portal-controls"><Field label="searchOrders" name="order-search" type="search" value={search} onChange={e => setSearch(e.target.value)} /></div><section className="portal-card">{orders.length ? <OrderTable orders={orders} /> : <Empty onClick={() => { setSearch(''); setStatus('all') }} />}</section></>
}
