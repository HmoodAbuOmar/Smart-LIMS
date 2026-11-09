import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Ellipsis, Pencil, Power, Ruler } from 'lucide-react'
import { catalogName } from '../adminCatalogModel.js'

export default function AdminCatalogParameterActions({ parameter, language, copy, busy, onEdit, onToggle, onRanges }) {
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ visibility: 'hidden' })
  const trigger = useRef(null), menu = useRef(null)
  const [portal, setPortal] = useState(null)
  function close(restore = false) { setOpen(false); if (restore) trigger.current?.focus({ preventScroll: true }) }
  useEffect(() => {
    if (!open) return undefined
    const rect = trigger.current.getBoundingClientRect(), width = Math.min(230, window.innerWidth - 24)
    const left = language === 'ar' ? rect.left : rect.right - width
    const above = window.innerHeight - rect.bottom < 180
    setPosition({ width, left: Math.max(12, Math.min(left, window.innerWidth - width - 12)), ...(above ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }) })

    function outside(event) { if (!menu.current?.contains(event.target) && !trigger.current?.contains(event.target)) close() }
    function escape(event) { if (event.key === 'Escape') { event.preventDefault(); close(true) } }
    function dismiss() { close() }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    window.addEventListener('resize', dismiss)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); window.removeEventListener('resize', dismiss) }
  }, [open, language])
  useEffect(() => {
    if (open && position.visibility !== 'hidden') menu.current?.querySelector('button')?.focus({ preventScroll: true })
  }, [open, position])
  function choose(action) { close(true); action() }
  return <><button type="button" ref={trigger} className="ac-more" disabled={busy} aria-label={`${copy.actions}: ${catalogName(parameter, language)}`} aria-haspopup="menu" aria-expanded={open} onClick={() => { setPortal(trigger.current.closest('.admin-catalog')); setOpen(value => !value) }}><Ellipsis size={19} aria-hidden="true" /></button>
    {open && createPortal(<div ref={menu} className="ac-parameter-menu" role="menu" style={position} lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'} aria-label={copy.actions} onKeyDown={event => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const controls = [...event.currentTarget.querySelectorAll('button')], index = controls.indexOf(document.activeElement)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? controls.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + controls.length) % controls.length
      controls[next]?.focus({ preventScroll: true })
    }}><button type="button" role="menuitem" onClick={() => choose(onEdit)}><Pencil size={14} aria-hidden="true" />{copy.edit}</button><button type="button" role="menuitem" onClick={() => choose(onToggle)}><Power size={14} aria-hidden="true" />{parameter.active ? copy.deactivate : copy.activate}</button><button type="button" role="menuitem" onClick={() => choose(onRanges)}><Ruler size={14} aria-hidden="true" />{copy.referenceRanges}</button></div>, portal)}
  </>
}
