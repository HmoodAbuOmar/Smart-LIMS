import { useMemo, useState } from 'react'
import { filterRows, paginateRows } from '../utils/listControls'

export function useListControls(rows, { searchKeys = [], pageSize = 8 } = {}) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  const filtered = useMemo(
    () => filterRows(rows, { search, searchKeys, status }),
    [rows, search, searchKeys, status],
  )

  const paged = useMemo(
    () => paginateRows(filtered, { page, pageSize }),
    [filtered, page, pageSize],
  )

  return {
    search,
    setSearch,
    status,
    setStatus,
    page,
    setPage,
    filtered,
    ...paged,
    resetPage: () => setPage(1),
  }
}
