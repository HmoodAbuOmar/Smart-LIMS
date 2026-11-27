const SECTIONS = new Set(['samples', 'drafts', 'approved', 'published'])

function labPath(hash) {
  const path = String(hash || '').split('?')[0]
  const marker = path.match(/\/(?:__lab|lab-technician)(?=\/|$)/)
  if (!marker) return null
  return path.slice(marker.index + marker[0].length).replace(/^\//, '')
}

// One section wins. samples and drafts include their detail paths, and a later
// id segment cannot select a second item.
export function labSidebarSection(hash) {
  const rest = labPath(hash)
  if (rest == null) return ''
  const section = rest.split('/').filter(Boolean)[0] || ''
  if (SECTIONS.has(section)) return section
  return section ? '' : 'worklist'
}

function decodeId(value) {
  try {
    const id = decodeURIComponent(value).trim()
    return id && !id.includes('/') ? id : ''
  } catch {
    return ''
  }
}

export function labDraftId(hash) {
  const rest = labPath(hash)
  if (!rest?.startsWith('drafts/')) return ''
  const parts = rest.slice('drafts/'.length).split('/').filter(Boolean)
  if (parts.length !== 1) return ''
  return decodeId(parts[0])
}

// Draft review keeps Draft Results selected. An approved result opened from
// Approved Results stays under that section, so the sidebar highlight follows
// the list the technician used.
export function labReviewId(hash) {
  const rest = labPath(hash)
  if (!rest) return ''
  const parts = rest.split('/').filter(Boolean)
  if (parts[0] === 'approved' && parts.length === 2) return decodeId(parts[1])
  if (parts[0] === 'drafts' && parts.length === 3 && parts[2] === 'review') return decodeId(parts[1])
  return ''
}

// A published report stays under Published Results, including when it is
// opened after publication, so the sidebar highlight follows that list.
export function labPublishedId(hash) {
  const rest = labPath(hash)
  if (!rest?.startsWith('published/')) return ''
  const parts = rest.slice('published/'.length).split('/').filter(Boolean)
  if (parts.length !== 1) return ''
  return decodeId(parts[0])
}
