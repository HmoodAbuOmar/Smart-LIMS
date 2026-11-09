import { useEffect, useRef } from 'react'
import { Button } from '../../components/PortalUi.jsx'
import { usePortal } from '../../PortalContext.js'

export default function ConfirmDialog({ onClose, onConfirm, busy }) {
  const { t } = usePortal(), dialog = useRef(null)
  useEffect(() => { const node = dialog.current; node.showModal(); return () => { if (node.open) node.close() } }, [])
  return <dialog ref={dialog} className="portal-dialog" aria-labelledby="cancel-title" onCancel={onClose}><h2 id="cancel-title">{t('cancelTitle')}</h2><p>{t('cancelHint')}</p><div className="portal-actions"><Button secondary autoFocus onClick={onClose}>{t('keep')}</Button><Button className="portal-button is-danger" disabled={busy} onClick={onConfirm}>{t('confirmCancel')}</Button></div></dialog>
}
