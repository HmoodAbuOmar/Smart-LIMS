import { useEffect, useRef } from 'react'

export default function AdminCatalogDiscardDialog({ copy, onKeep, onDiscard }) {
  const dialog = useRef(null)
  useEffect(() => {
    const element = dialog.current, previous = document.activeElement
    element.showModal()
    element.querySelector('button')?.focus()
    return () => { element.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [])
  return <dialog ref={dialog} className="admin-catalog-dialog ac-discard-dialog" aria-labelledby="catalog-discard-title" aria-describedby="catalog-discard-description" onCancel={event => { event.preventDefault(); onKeep() }} onKeyDown={event => {
    if (event.key !== 'Tab') return
    const buttons = [...event.currentTarget.querySelectorAll('button')]
    if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1).focus() }
    else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus() }
  }}>
    <h3 id="catalog-discard-title">{copy.unsavedTitle}</h3><p id="catalog-discard-description">{copy.unsavedDescription}</p>
    <div className="ac-form-actions"><button type="button" onClick={onKeep}>{copy.keepEditing}</button><button type="button" className="ac-primary" onClick={onDiscard}>{copy.discard}</button></div>
  </dialog>
}
