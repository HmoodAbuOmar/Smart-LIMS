import { useEffect, useId, useRef } from 'react'

export default function BookingDialog({ api, title, confirmLabel, cancelLabel = 'cancel', onConfirm, onClose, busy, children, amount }) {
  const dialog = useRef(null), titleId = useId()
  useEffect(() => { const node = dialog.current; node.showModal(); return () => { if (node.open) node.close() } }, [])
  return <dialog ref={dialog} className="portal-dialog booking-dialog" aria-labelledby={titleId} onCancel={event => { if (busy) event.preventDefault(); else onClose() }}><h2 id={titleId}>{api.t(title)}{amount !== undefined && <> {api.money(amount)}</>}</h2>{children}<div className="portal-actions"><button type="button" className="portal-button is-secondary" autoFocus disabled={busy} onClick={onClose}>{api.t(cancelLabel)}</button><button type="button" className="portal-button" disabled={busy} onClick={onConfirm}>{api.t(busy ? 'bookingProcessing' : confirmLabel)}</button></div></dialog>
}
