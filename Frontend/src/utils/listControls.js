export function filterRows(rows, { search = '', searchKeys = [], status = '' }) {
  let result = rows ?? []
  if (status) {
    result = result.filter((row) => String(row.status ?? '').toUpperCase() === status.toUpperCase())
  }
  if (search.trim()) {
    const q = search.trim().toLowerCase()
    result = result.filter((row) =>
      searchKeys.some((key) => String(row[key] ?? '').toLowerCase().includes(q)),
    )
  }
  return result
}

export function paginateRows(rows, { page = 1, pageSize = 8 }) {
  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(page, 1), totalPages)
  const start = (safePage - 1) * pageSize
  return {
    rows: rows.slice(start, start + pageSize),
    page: safePage,
    pageSize,
    total,
    totalPages,
  }
}

export function computeFlag(value, min, max) {
  const num = Number(value)
  if (Number.isNaN(num)) return 'TEXT'
  if (num < min) return 'LOW'
  if (num > max) return 'HIGH'
  return 'NORMAL'
}
