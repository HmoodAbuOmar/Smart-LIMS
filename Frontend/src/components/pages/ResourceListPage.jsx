import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../layout/PageHeader'
import { DataTable } from '../data-display/DataTable'
import { Button } from '../ui/Button'
import { ListToolbar } from '../tables/ListToolbar'
import { Pagination } from '../ui/Pagination'
import { EmptyState } from '../feedback/EmptyState'

export function ResourceListPage({
  title,
  description,
  createTo,
  createLabel = 'Create',
  columns,
  rows,
  onRowTo,
  toolbar,
  pagination,
}) {
  const navigate = useNavigate()

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
      <div className="sl-card">
        <div className="sl-card__body">
          {toolbar ? (
            <ListToolbar
              search={toolbar.search}
              onSearchChange={toolbar.onSearchChange}
              status={toolbar.status}
              onStatusChange={toolbar.onStatusChange}
              statusOptions={toolbar.statusOptions}
              placeholder={toolbar.placeholder}
            />
          ) : null}
          {rows?.length ? (
            <>
              <DataTable
                columns={columns}
                rows={rows}
                onRowClick={onRowTo ? (row) => navigate(onRowTo(row)) : undefined}
              />
              {pagination ? (
                <Pagination
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  onPageChange={pagination.onPageChange}
                />
              ) : null}
            </>
          ) : (
            <EmptyState title="No items match your filters" />
          )}
        </div>
      </div>
    </>
  )
}
