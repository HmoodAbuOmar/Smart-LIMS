import { MockBanner } from '../feedback/MockBanner'
import { EmptyState } from '../feedback/EmptyState'
import { PageHeader } from '../layout/PageHeader'
import { DataTable } from '../data-display/DataTable'
import { Button } from '../ui/Button'
import { Link, useRouter } from '../../lib/router/RouterContext'

export function ResourceListPage({
  title,
  description,
  createTo,
  createLabel = 'Create',
  columns,
  rows,
  onRowTo,
  mockNote,
}) {
  const { navigate } = useRouter()

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          createTo ? (
            <Link to={createTo}>
              <Button variant="primary">{createLabel}</Button>
            </Link>
          ) : null
        }
      />
      <MockBanner message={mockNote} />
      <div className="sl-card">
        <div className="sl-card__body">
          {rows?.length ? (
            <DataTable
              columns={columns}
              rows={rows}
              onRowClick={onRowTo ? (row) => navigate(onRowTo(row)) : undefined}
            />
          ) : (
            <EmptyState title="No items yet" />
          )}
        </div>
      </div>
    </>
  )
}
