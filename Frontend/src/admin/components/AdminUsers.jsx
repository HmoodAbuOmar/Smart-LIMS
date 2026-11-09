import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Ellipsis, FlaskConical, Headset, Plus, Search, ShieldCheck, UserRound, UsersRound, X } from 'lucide-react'
import AdminFilterDropdown from './AdminFilterDropdown.jsx'
import { adminUsersCopy } from '../adminUsersCopy.js'
import { adminUsersData } from '../adminUsersData.js'
import './adminUsers.css'

const pageSizeOptions = [7, 10, 25]
const roleValues = ['ADMIN', 'RECEPTIONIST', 'LAB_TECHNICIAN', 'PATIENT']
const statusValues = ['ACTIVE', 'INVITED', 'BLOCKED']
const roleIcons = { ADMIN: ShieldCheck, RECEPTIONIST: Headset, LAB_TECHNICIAN: FlaskConical, PATIENT: UserRound }

function UserActions({ user, name, copy, onEdit, onToggleBlock, onDelete }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(null)
  const root = useRef(null)
  const trigger = useRef(null)
  const menu = useRef(null)

  function close(restoreFocus = false) {
    setOpen(false)
    if (restoreFocus) trigger.current?.focus()
  }

  useEffect(() => {
    if (!open) return undefined
    function placeMenu() {
      const rect = trigger.current.getBoundingClientRect()
      const rtl = getComputedStyle(trigger.current).direction === 'rtl'
      const width = 190
      const topSpace = rect.top - 12
      const bottomSpace = window.innerHeight - rect.bottom - 12
      const above = bottomSpace < 150 && topSpace > bottomSpace
      const left = rtl ? rect.left : rect.right - width
      setPosition({
        left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
        width,
        maxHeight: Math.max(80, Math.min(260, above ? topSpace : bottomSpace)),
        ...(above ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
      })
    }
    function outside(event) {
      if (!root.current?.contains(event.target) && !menu.current?.contains(event.target)) close()
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') { event.preventDefault(); close(true) }
    }
    placeMenu()
    window.requestAnimationFrame(() => menu.current?.querySelector('button')?.focus({ preventScroll: true }))
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', placeMenu)
    window.addEventListener('scroll', placeMenu, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', placeMenu)
      window.removeEventListener('scroll', placeMenu, true)
    }
  }, [open])

  function select(action) {
    close(true)
    action()
  }

  return <span className="admin-users-actions" ref={root}>
    <button ref={trigger} type="button" className="admin-users-more" aria-label={copy.openActions(name)}
      aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <Ellipsis size={19} aria-hidden="true" />
    </button>
    {open && createPortal(<div ref={menu} className="admin-users-action-menu" role="menu" style={position || { visibility: 'hidden' }}>
      <button type="button" role="menuitem" onClick={() => select(onEdit)}>{copy.editRole}</button>
      <button type="button" role="menuitem" onClick={() => select(onToggleBlock)}>{user.status === 'BLOCKED' ? copy.unblock : copy.block}</button>
      <button type="button" role="menuitem" className="is-danger" onClick={() => select(onDelete)}>{copy.delete}</button>
    </div>, document.body)}
  </span>
}

export default function AdminUsers({ language }) {
  const copy = adminUsersCopy[language]
  const rtl = language === 'ar'
  const local = useCallback(value => Array.isArray(value) ? value[rtl ? 1 : 0] : value, [rtl])
  const number = value => new Intl.NumberFormat(language).format(value)
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }), [language])
  const [users, setUsers] = useState(() => adminUsersData.map(user => ({ ...user })))
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('30')
  const [pageSize, setPageSize] = useState(7)
  const [sort, setSort] = useState({ key: 'name', direction: 'asc' })
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [dialogState, setDialogState] = useState(null)
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('PATIENT')
  const [editRole, setEditRole] = useState('PATIENT')
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const dialog = useRef(null)
  const selectAllRef = useRef(null)
  const nextId = useRef(1008)

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (dialogState && !element.open) element.showModal()
    if (!dialogState && element.open) element.close()
  }, [dialogState])

  const visibleUsers = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return users.filter(user => {
      const text = [local(user.name), user.email, copy.roles[user.role], copy.statuses[user.status]].join(' ').toLocaleLowerCase()
      return (!needle || text.includes(needle)) &&
        (roleFilter === 'all' || user.role === roleFilter) &&
        (statusFilter === 'all' || user.status === statusFilter) &&
        (dateFilter === 'all' || (user.lastLogin && Date.now() - new Date(user.lastLogin).getTime() <= 30 * 24 * 60 * 60 * 1000))
    }).sort((left, right) => {
      const a = sort.key === 'name' ? local(left.name) : sort.key === 'email' ? left.email :
        sort.key === 'role' ? copy.roles[left.role] : sort.key === 'status' ? copy.statuses[left.status] : (left.lastLogin || '')
      const b = sort.key === 'name' ? local(right.name) : sort.key === 'email' ? right.email :
        sort.key === 'role' ? copy.roles[right.role] : sort.key === 'status' ? copy.statuses[right.status] : (right.lastLogin || '')
      return a.localeCompare(b, language) * (sort.direction === 'asc' ? 1 : -1)
    })
  }, [users, query, roleFilter, statusFilter, dateFilter, sort, copy, language, local])

  const pageCount = Math.max(1, Math.ceil(visibleUsers.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pageUsers = visibleUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const allPageSelected = pageUsers.length > 0 && pageUsers.every(user => selectedIds.has(user.id))
  const somePageSelected = pageUsers.some(user => selectedIds.has(user.id))
  const firstUser = visibleUsers.length ? (currentPage - 1) * pageSize + 1 : 0
  const lastUser = Math.min(currentPage * pageSize, visibleUsers.length)

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = somePageSelected && !allPageSelected
  }, [somePageSelected, allPageSelected])

  function changeQuery(value) { setQuery(value); setPage(1) }
  function changeRole(value) { setRoleFilter(value); setPage(1) }
  function changeStatus(value) { setStatusFilter(value); setPage(1) }
  function changeDate(value) { setDateFilter(value); setPage(1) }
  function changePageSize(value) { setPageSize(value); setPage(1) }
  function toggleSelected(id) {
    setSelectedIds(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function togglePageSelected() {
    setSelectedIds(current => {
      const next = new Set(current)
      if (allPageSelected) pageUsers.forEach(user => next.delete(user.id))
      else pageUsers.forEach(user => next.add(user.id))
      return next
    })
  }
  function openInvite() {
    setInviteName(''); setInviteEmail(''); setInviteRole('PATIENT'); setFormError(''); setDialogState({ type: 'invite' })
  }
  function openEdit(user) { setEditRole(user.role); setFormError(''); setDialogState({ type: 'edit', user }) }
  function openDelete(user) { setDialogState({ type: 'delete', user }) }

  function submitForm(event) {
    event.preventDefault()
    if (dialogState?.type === 'invite') {
      const name = inviteName.trim()
      const email = inviteEmail.trim().toLowerCase()
      if (!name) { setFormError(copy.nameRequired); return }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFormError(copy.emailInvalid); return }
      if (users.some(user => user.email.toLowerCase() === email)) { setFormError(copy.emailExists); return }
      const newUser = { id: `user-${nextId.current++}`, name: [name, name], email, role: inviteRole, status: 'INVITED', lastLogin: null }
      setUsers(current => [...current, newUser])
      setQuery(''); setRoleFilter('all'); setStatusFilter('all'); setDateFilter('all'); setPage(Math.floor(users.length / pageSize) + 1)
      setNotice(copy.invitedLocal)
      setDialogState(null)
      return
    }
    if (dialogState?.type === 'edit') {
      setUsers(current => current.map(user => user.id === dialogState.user.id ? { ...user, role: editRole } : user))
      setNotice(copy.roleUpdatedLocal)
      setDialogState(null)
    }
  }

  function toggleBlock(user) {
    const status = user.status === 'BLOCKED' ? 'ACTIVE' : 'BLOCKED'
    setUsers(current => current.map(item => item.id === user.id ? { ...item, status } : item))
    setNotice(user.status === 'BLOCKED' ? copy.unblockedLocal : copy.blockedLocal)
  }

  function confirmDelete() {
    if (!dialogState?.user) return
    setUsers(current => current.filter(user => user.id !== dialogState.user.id))
    setSelectedIds(current => { const next = new Set(current); next.delete(dialogState.user.id); return next })
    setNotice(copy.deletedLocal)
    setDialogState(null)
  }

  function sortBy(key) {
    setSort(current => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }))
  }

  function sortHeading(key, label) {
    const Icon = sort.key !== key ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown
    const direction = sort.key !== key ? copy.sort : sort.direction === 'asc' ? copy.ascending : copy.descending
    return <button type="button" className="admin-users-sort" onClick={() => sortBy(key)} aria-label={`${label}: ${direction}`}>
      <span>{label}</span><Icon size={14} aria-hidden="true" />
    </button>
  }

  const dialogTitle = dialogState?.type === 'invite' ? copy.inviteTitle : dialogState?.type === 'edit' ? copy.editTitle : copy.deleteTitle

  return <section className="admin-users" aria-label={copy.title}>
    <div className="admin-users-heading">
      <div className="admin-users-banner-copy"><p>{copy.subtitle}</p></div>
      <button type="button" className="admin-users-invite" onClick={openInvite}><Plus size={17} aria-hidden="true" /><span>{copy.invite}</span></button>
    </div>

    <div className="admin-users-toolbar">
      <label className="admin-users-search"><Search size={18} aria-hidden="true" /><span className="admin-users-sr-only">{copy.search}</span>
        <input type="search" value={query} onChange={event => changeQuery(event.target.value)} placeholder={copy.searchPlaceholder} />
      </label>
      <div className="admin-users-filters">
        <span className="admin-users-filter-wrap"><UsersRound className="admin-users-filter-icon" size={15} aria-hidden="true" />
          <AdminFilterDropdown label={copy.roleFilter} value={roleFilter} onChange={changeRole}
            options={[{ value: 'all', label: copy.allRoles }, ...roleValues.map(value => ({ value, label: copy.roles[value] }))]} />
        </span>
        <span className="admin-users-filter-wrap"><CheckCircle2 className="admin-users-filter-icon" size={15} aria-hidden="true" />
          <AdminFilterDropdown label={copy.statusFilter} value={statusFilter} onChange={changeStatus}
            options={[{ value: 'all', label: copy.allStatuses }, ...statusValues.map(value => ({ value, label: copy.statuses[value] }))]} />
        </span>
        <span className="admin-users-filter-wrap"><CalendarDays className="admin-users-filter-icon" size={15} aria-hidden="true" />
          <AdminFilterDropdown label={copy.lastLoginFilter} value={dateFilter} onChange={changeDate}
            options={[{ value: '30', label: copy.last30Days }, { value: 'all', label: copy.allTime }]} />
        </span>
      </div>
    </div>

    <div className="admin-users-panel">
      <div className="admin-users-table-scroll" role="region" aria-label={copy.title} tabIndex={0}>
        <table className="admin-users-table">
          <caption className="admin-users-sr-only">{copy.title}</caption>
          <thead><tr>
            <th scope="col" className="admin-users-select-heading"><input ref={selectAllRef} type="checkbox" checked={allPageSelected} onChange={togglePageSelected} disabled={!pageUsers.length} aria-label={copy.selectAll} /></th>
            <th scope="col" aria-sort={sort.key === 'name' ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}>{sortHeading('name', copy.user)}</th>
            <th scope="col" aria-sort={sort.key === 'role' ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}>{sortHeading('role', copy.role)}</th>
            <th scope="col" aria-sort={sort.key === 'status' ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}>{sortHeading('status', copy.status)}</th>
            <th scope="col" aria-sort={sort.key === 'lastLogin' ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}>{sortHeading('lastLogin', copy.lastLogin)}</th>
            <th scope="col" className="admin-users-actions-heading">{copy.actions}</th>
          </tr></thead>
          <tbody>{pageUsers.map(user => {
            const name = local(user.name)
            const initials = rtl ? name.replace(/\s/g, '').slice(0, 2) : name.split(/\s+/).map(part => part[0]).slice(0, 2).join('')
            const RoleIcon = roleIcons[user.role]
            return <tr key={user.id}>
              <td className="admin-users-select-cell"><input type="checkbox" checked={selectedIds.has(user.id)} onChange={() => toggleSelected(user.id)} aria-label={copy.selectUser(name)} /></td>
              <th scope="row"><span className="admin-users-person"><span className="admin-users-avatar" aria-hidden="true">{initials}</span><span className="admin-users-person-copy"><span className="admin-users-name">{name}</span><bdi>{user.email}</bdi></span></span></th>
              <td><span className={`admin-users-role admin-users-role-${user.role.toLowerCase()}`}><RoleIcon size={13} aria-hidden="true" />{copy.roles[user.role]}</span></td>
              <td><span className={`admin-users-status admin-users-status-${user.status.toLowerCase()}`}><span aria-hidden="true" />{copy.statuses[user.status]}</span></td>
              <td className="admin-users-last-login">{user.lastLogin ? <span><CalendarDays size={14} aria-hidden="true" /><time dateTime={user.lastLogin}>{dateFormatter.format(new Date(user.lastLogin))}</time></span> : copy.never}</td>
              <td className="admin-users-actions-cell"><UserActions user={user} name={name} copy={copy} onEdit={() => openEdit(user)}
                onToggleBlock={() => toggleBlock(user)} onDelete={() => openDelete(user)} /></td>
            </tr>
          })}</tbody>
        </table>
        {!pageUsers.length && <p className="admin-users-empty" role="status">{copy.noResults}</p>}
      </div>
      <div className="admin-users-footer">
        <p aria-live="polite">{copy.showing} {number(firstUser)}–{number(lastUser)} {copy.of} {number(visibleUsers.length)} {copy.users}</p>
        <div className="admin-users-page-size"><span>{copy.rowsPerPage}</span><AdminFilterDropdown label={copy.rowsPerPage} value={pageSize} onChange={changePageSize}
          options={pageSizeOptions.map(value => ({ value, label: number(value) }))} /></div>
        <nav className="admin-users-pagination" aria-label={copy.title}>
          <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} aria-label={copy.previous}>
            {rtl ? <ChevronRight size={15} aria-hidden="true" /> : <ChevronLeft size={15} aria-hidden="true" />}
          </button>
          <span>{number(currentPage)}</span>
          <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)} aria-label={copy.next}>
            {rtl ? <ChevronLeft size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
          </button>
        </nav>
      </div>
    </div>
    {notice && <p className="admin-users-notice" role="status" aria-live="polite">{notice}</p>}

    <dialog ref={dialog} className="admin-users-dialog" aria-labelledby="admin-users-dialog-title"
      onCancel={event => { event.preventDefault(); setDialogState(null) }} onClose={() => setDialogState(null)}>
      <div className="admin-users-dialog-heading"><h3 id="admin-users-dialog-title">{dialogTitle}</h3>
        <button type="button" className="admin-users-dialog-close" aria-label={copy.close} onClick={() => setDialogState(null)}><X size={19} aria-hidden="true" /></button>
      </div>
      {dialogState?.type === 'delete' ? <div className="admin-users-delete-content">
        <p>{copy.deletePrompt(local(dialogState.user.name))}</p>
        <div className="admin-users-dialog-actions"><button type="button" className="admin-users-secondary" onClick={() => setDialogState(null)}>{copy.cancel}</button>
          <button type="button" className="admin-users-danger" onClick={confirmDelete}>{copy.confirmDelete}</button></div>
      </div> : dialogState && <form className="admin-users-form" onSubmit={submitForm} noValidate>
        {dialogState?.type === 'invite' ? <>
          <label>{copy.fullName}<input autoFocus type="text" autoComplete="name" value={inviteName} onChange={event => { setInviteName(event.target.value); setFormError('') }} placeholder={copy.namePlaceholder} /></label>
          <label>{copy.email}<input type="email" autoComplete="email" dir="ltr" value={inviteEmail} onChange={event => { setInviteEmail(event.target.value); setFormError('') }} placeholder={copy.emailPlaceholder} /></label>
          <label>{copy.role}<select value={inviteRole} onChange={event => setInviteRole(event.target.value)}>
            {roleValues.map(value => <option key={value} value={value}>{copy.roles[value]}</option>)}
          </select></label>
        </> : <>
          <div className="admin-users-edit-identity"><span className="admin-users-avatar" aria-hidden="true">{local(dialogState?.user.name).split(/\s+/).map(part => part[0]).slice(0, 2).join('')}</span>
            <div><strong>{local(dialogState?.user.name)}</strong><span dir="ltr">{dialogState?.user.email}</span></div></div>
          <label>{copy.role}<select value={editRole} onChange={event => setEditRole(event.target.value)}>
            {roleValues.map(value => <option key={value} value={value}>{copy.roles[value]}</option>)}
          </select></label>
        </>}
        {formError && <p className="admin-users-form-error" role="alert">{formError}</p>}
        <div className="admin-users-dialog-actions"><button type="button" className="admin-users-secondary" onClick={() => setDialogState(null)}>{copy.cancel}</button>
          <button type="submit" className="admin-users-primary">{dialogState?.type === 'invite' ? copy.sendInvitation : copy.saveChanges}</button></div>
      </form>}
    </dialog>
  </section>
}
