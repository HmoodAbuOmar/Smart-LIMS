import { useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import './adminFilterDropdown.css'

// Local, controlled select: choosing an option delegates to the existing filter state.
export default function AdminFilterDropdown({ label, value, options, onChange }) {
  const id = useId()
  const trigger = useRef(null)
  const menu = useRef(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [position, setPosition] = useState(null)
  const selected = Math.max(0, options.findIndex(option => option.value === value))

  function close(restoreFocus = false) {
    setOpen(false)
    if (restoreFocus) trigger.current?.focus()
  }

  function show(index = selected) {
    setActive(index)
    setOpen(true)
  }

  useLayoutEffect(() => {
    if (!open) return
    function place() {
      const rect = trigger.current.getBoundingClientRect()
      const direction = getComputedStyle(trigger.current).direction
      const width = Math.min(Math.max(rect.width, 190), window.innerWidth - 16)
      const below = window.innerHeight - rect.bottom - 14
      const above = rect.top - 14
      const upwards = below < 180 && above > below
      setPosition({
        left: Math.max(8, Math.min(direction === 'rtl' ? rect.right - width : rect.left, window.innerWidth - width - 8)),
        width, maxHeight: Math.max(48, Math.min(280, upwards ? above : below)), direction,
        fontFamily: getComputedStyle(trigger.current).fontFamily,
        ...(upwards ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
      })
    }
    function outside(event) {
      if (!trigger.current.contains(event.target) && !menu.current?.contains(event.target)) close()
    }
    place()
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useLayoutEffect(() => {
    if (open && position) {
      const option = menu.current?.querySelectorAll('[role="option"]')[active]
      option?.focus({ preventScroll: true })
      option?.scrollIntoView({ block: 'nearest' })
    }
  }, [open, active, position])

  function choose(index) {
    onChange(options[index].value)
    close(true)
  }

  return <>
    <button ref={trigger} type="button" className="admin-filter-trigger" data-value={value} aria-label={`${label}: ${options[selected].label}`}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => open ? close() : show()}
      onKeyDown={event => {
        if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
          event.preventDefault()
          show(event.key === 'ArrowUp' ? options.length - 1 : selected)
        }
      }}>
      <span>{options[selected].label}</span><ChevronDown size={15} aria-hidden="true" />
    </button>
    {open && createPortal(<div ref={menu} id={id} role="listbox" aria-label={label} className="admin-filter-menu"
      style={position || { visibility: 'hidden' }}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) close()
      }}
      onKeyDown={event => {
        if (event.key === 'Tab') {
          // Resume normal document tab order from the trigger, outside this portal.
          trigger.current.focus()
          close()
          return
        }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return }
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(active); return }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault()
          setActive(index => event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 :
            (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
        } else if (event.key.length === 1) {
          const index = options.findIndex((option, offset) => {
            const next = (active + offset + 1) % options.length
            return options[next].label.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase())
          })
          if (index >= 0) setActive((active + index + 1) % options.length)
        }
      }}>
      {options.map((option, index) => <div key={option.value} role="option" data-value={option.value} aria-selected={option.value === value}
        tabIndex={active === index ? 0 : -1} className="admin-filter-option" onFocus={() => setActive(index)}
        onClick={() => choose(index)}>
        <span>{option.label}</span>{option.value === value && <Check size={15} aria-hidden="true" />}
      </div>)}
    </div>, document.body)}
  </>
}
