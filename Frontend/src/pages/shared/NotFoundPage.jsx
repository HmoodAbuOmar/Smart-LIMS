import { Link } from '../../lib/router/RouterContext'
import { Button } from '../../components/ui/Button'

export function NotFoundPage() {
  return (
    <div className="sl-landing__hero">
      <h1>404 — Page not found</h1>
      <p>The page you requested does not exist in this preview.</p>
      <Link to="/">
        <Button variant="primary">Back to home</Button>
      </Link>
    </div>
  )
}
