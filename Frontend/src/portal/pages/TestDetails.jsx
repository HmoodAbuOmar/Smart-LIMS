import { ArrowLeft, ClipboardList, Clock, FlaskConical, Heart } from 'lucide-react'
import { Title, Button, Empty } from '../components/PortalUi.jsx'
import { usePortal } from '../PortalContext.js'

export default function TestDetails({ id }) {
  const { state, t, local, money, navigate, addAndBook } = usePortal(), test = state.tests.find(item => item.id === id)
  if (!test) return <Empty title="notFound" action="catalogBack" onClick={() => navigate('tests')} />
  return <><Title title="test"><Button secondary onClick={() => navigate('tests')}><ArrowLeft size={16} />{t('catalogBack')}</Button></Title><article className="portal-card portal-test-detail"><div className="portal-test-detail-head"><span className="portal-icon"><FlaskConical size={34} /></span><div><h2>{local(test.name)}</h2><p>{t(test.category)}</p></div><div><strong>{money(test.price)}</strong><Button disabled={state.cart.includes(id)} onClick={() => addAndBook(id)}>{t(state.cart.includes(id) ? 'added' : 'add')}</Button></div></div><p>{local(test.description)}</p><div className="portal-detail-grid">{[['sampleType', local(test.sample), FlaskConical], ['preparation', local(test.prep), ClipboardList], ['turnaround', local(test.time), Clock], ['fasting', t(test.fasting ? 'required' : 'notRequired'), Heart]].map(([label, text, Icon]) => <div key={label}><Icon size={22} /><h3>{t(label)}</h3><p>{text}</p></div>)}</div><h3>{t('referenceInfo')}</h3><p>{t('referenceHint')}</p><Button onClick={() => navigate('review')}>{t('review')} ({state.cart.length})</Button></article></>
}
