import { useEffect } from 'react'
import { Button } from './Button'

export function Modal({ open, title, onClose, children, footer }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="sl-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="sl-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sl-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sl-modal__header">
          <h2 id="sl-modal-title">{title}</h2>
          <Button variant="ghost" size="sm" aria-label="Close dialog" onClick={onClose}>
            ×
          </Button>
        </header>
        <div className="sl-modal__body">{children}</div>
        {footer ? <footer className="sl-modal__footer">{footer}</footer> : null}
      </div>
    </div>
  )
}
