import { ArrowRight, Plus, Trash2 } from 'lucide-react'
import { totalPrice } from '../portalModel.js'
import { Title, Button, Empty, Card } from '../components/PortalUi.jsx'
import { usePortal } from '../PortalContext.js'

export default function Review() {
  const { state, t, local, money, navigate, dispatch, commit, busy, setNotice } = usePortal()
  async function confirm() { const response = await commit({ type: 'ORDER', requestId: crypto.randomUUID(), tests: state.cart }); if (response?.order) { navigate(`orders/${response.order.id}`); setNotice('orderSaved') } }
  return <><Title title="reviewTitle" hint="reviewHint" />{!state.cart.length ? <Empty title="emptyCart" action="browse" onClick={() => navigate('tests')} /> : <div className="portal-two-col"><section className="portal-card"><div className="portal-table-wrap"><table><thead><tr><th>{t('test')}</th><th>{t('price')}</th><th>{t('remove')}</th></tr></thead><tbody>{state.cart.map(id => { const test = state.tests.find(t => t.id === id); return <tr key={id}><th scope="row">{local(test.name)}</th><td>{money(test.price)}</td><td><button className="portal-danger-icon" aria-label={`${t('remove')} ${local(test.name)}`} onClick={() => dispatch({ type: 'REMOVE', id })}><Trash2 size={17} /></button></td></tr> })}</tbody><tfoot><tr><th>{t('total')}</th><td colSpan={2}>{money(totalPrice(state.cart, state.tests))}</td></tr></tfoot></table></div><div className="portal-actions"><Button secondary onClick={() => navigate('tests')}><Plus size={16} />{t('addMore')}</Button><Button disabled={busy} onClick={confirm}>{t(busy ? 'saving' : 'confirmOrder')}<ArrowRight size={16} /></Button></div></section><Card title="patientInfo"><dl className="portal-definition"><dt>{t('name')}</dt><dd>{state.profile.name}</dd><dt>{t('fileNumber')}</dt><dd><bdi>{state.profile.fileNumber}</bdi></dd><dt>{t('phone')}</dt><dd><bdi>{state.profile.phone}</bdi></dd></dl></Card></div>}</>
}
