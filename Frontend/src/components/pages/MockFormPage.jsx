import { MockBanner } from '../feedback/MockBanner'
import { PageHeader } from '../layout/PageHeader'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { useMockSubmit } from '../../hooks/useMockSubmit'

export function MockFormPage({ title, description, children, submitLabel = 'Save' }) {
  const { notice, submit } = useMockSubmit()

  return (
    <>
      <PageHeader title={title} description={description} />
      <MockBanner />
      {notice ? <div className="sl-alert sl-alert--warning">{notice}</div> : null}
      <Card>
        <form onSubmit={submit}>
          {children}
          <Button type="submit" variant="primary">
            {submitLabel}
          </Button>
        </form>
      </Card>
    </>
  )
}
