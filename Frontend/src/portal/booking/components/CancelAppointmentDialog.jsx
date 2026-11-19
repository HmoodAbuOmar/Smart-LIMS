import { useEffect, useRef } from 'react'
import { Button } from '../../components/PortalUi.jsx'
import { usePortal } from '../../PortalContext.js'

export default function ConfirmDialog({ onClose, onConfirm, busy, order = false }) {
  const { t } = usePortal(), dialog = useRef(null)
  useEffect(() => { const node = dialog.current; node.showModal(); return () => { if (node.open) node.close() } }, [])
  return <dialog ref={dialog} className="portal-dialog" aria-labelledby="cancel-title" onCancel={onClose}><h2 id="cancel-title">{t(order ? 'cancelOrderConfirm' : 'cancelTitle')}</h2>{!order && <p>{t('cancelHint')}</p>}<div className="portal-actions"><Button secondary autoFocus onClick={onClose}>{t(order ? 'keepOrder' : 'keep')}</Button><Button className="portal-button is-danger" disabled={busy} onClick={onConfirm}>{t(order ? 'cancelOrderAction' : 'confirmCancel')}</Button></div></dialog>
}
