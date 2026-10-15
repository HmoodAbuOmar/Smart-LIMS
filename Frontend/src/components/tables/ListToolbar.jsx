import { TextInput } from '../ui/TextInput'
import { Select } from '../ui/Select'

export function ListToolbar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  statusOptions = [],
  placeholder = 'Search…',
}) {
  return (
    <div className="sl-list-toolbar">
      <TextInput
        aria-label="Search"
        placeholder={placeholder}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      {statusOptions.length ? (
        <Select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => onStatusChange(e.target.value)}
        >
          <option value="">All statuses</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      ) : null}
    </div>
  )
}
