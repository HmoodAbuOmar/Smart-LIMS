import { ArrowRight, FileText } from 'lucide-react'
import { usePortal } from '../PortalContext.js'

export default function ResultList({ results }) { const { state, local, navigate, date } = usePortal(); return <div className="portal-result-list">{results.map(r => <button key={r.id} onClick={() => navigate(`results/${r.id}`)}><span className="portal-icon"><FileText size={20} /></span><span><strong>{local(state.tests.find(test => test.id === r.testId).name)}</strong><small>{date(r.date)}</small></span><ArrowRight size={16} /></button>)}</div> }
