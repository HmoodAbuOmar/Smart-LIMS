import { Link, NavLink, useParams } from 'react-router-dom'
import { useMockData } from '../../mock-data/MockDataProvider'
import { useListControls } from '../../hooks/useListControls'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ListToolbar } from '../../components/tables/ListToolbar'
import { Pagination } from '../../components/ui/Pagination'
import { StatusBadge } from '../../components/ui/StatusBadge'

export function HomePage() {
  const { state } = useMockData()
  const featured = state.labTests.filter((t) => t.featured)

  return (
    <>
      <section className="sl-hero-pro">
        <div className="sl-hero-pro__inner">
          <div>
            <p style={{ fontWeight: 600, letterSpacing: '0.08em', fontSize: '0.75rem' }}>
              SMART LABORATORY PLATFORM
            </p>
            <h1>Accurate diagnostics with a seamless patient experience</h1>
            <p>
              Smart-LIMS connects patients, reception, and laboratory teams with reliable
              workflows for orders, samples, and results — designed for modern medical labs.
            </p>
            <div className="sl-row" style={{ marginTop: 24 }}>
              <Link to="/tests">
                <Button variant="primary">Browse tests</Button>
              </Link>
              <Link to="/login">
                <Button variant="secondary">Sign in to portal</Button>
              </Link>
            </div>
          </div>
          <div className="sl-hero-card">
            <h3 style={{ color: 'white', marginTop: 0 }}>Why clinics choose Smart-LIMS</h3>
            <ul style={{ textAlign: 'left', lineHeight: 1.7 }}>
              <li>End-to-end order and sample tracking</li>
              <li>Reference-range aware result reporting</li>
              <li>Role-based dashboards for every team</li>
              <li>Audit-ready activity history</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="sl-section sl-section--muted">
        <div className="sl-section__title">
          <h2>Laboratory services</h2>
          <p>Core capabilities built for high-volume diagnostic operations.</p>
        </div>
        <div className="sl-grid-3">
          {[
            { title: 'Test catalog & orders', text: 'Standardized test definitions with consistent pricing and preparation rules.' },
            { title: 'Appointments & collection', text: 'Slot-based booking with reception check-in and capacity control.' },
            { title: 'Results & release', text: 'Draft entry, verification, publication, and correction workflows for lab staff.' },
          ].map((item) => (
            <Card key={item.title} className="sl-feature-card">
              <h3>{item.title}</h3>
              <p style={{ color: 'var(--sl-text-muted)', fontSize: 'var(--sl-text-sm)' }}>{item.text}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="sl-section">
        <div className="sl-section__title">
          <h2>Featured tests</h2>
          <p>Popular panels patients and clinicians request most often.</p>
        </div>
        <div className="sl-grid-3">
          {featured.map((test) => (
            <Card key={test.id} className="sl-feature-card">
              <Link to={`/tests/${test.id}`} className="sl-test-card-link">
                <div className="sl-row" style={{ justifyContent: 'space-between' }}>
                  <strong>{test.name}</strong>
                  <StatusBadge status={test.status} />
                </div>
                <p style={{ color: 'var(--sl-text-muted)', fontSize: 'var(--sl-text-sm)' }}>
                  {test.category} · {test.turnaround}
                </p>
                <p style={{ fontWeight: 700, color: 'var(--sl-primary-600)' }}>${test.price}</p>
              </Link>
            </Card>
          ))}
        </div>
      </section>

      <section className="sl-section sl-section--muted">
        <div className="sl-section__title">
          <h2>How it works</h2>
        </div>
        <div className="sl-grid-3">
          {[
            { step: '1', title: 'Order & pay', text: 'Patient or reception creates a laboratory order from the catalog.' },
            { step: '2', title: 'Collect sample', text: 'Appointment scheduling, check-in, and sample registration in the lab.' },
            { step: '3', title: 'Results released', text: 'Technicians enter values, publish results, and patients view them securely.' },
          ].map((item) => (
            <Card key={item.step} className="sl-feature-card">
              <p style={{ color: 'var(--sl-primary-600)', fontWeight: 800 }}>Step {item.step}</p>
              <h3>{item.title}</h3>
              <p style={{ color: 'var(--sl-text-muted)', fontSize: 'var(--sl-text-sm)' }}>{item.text}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="sl-section">
        <div className="sl-section__title">
          <h2>Frequently asked questions</h2>
        </div>
        <div style={{ maxWidth: 760, margin: '0 auto' }} className="sl-faq">
          <details>
            <summary>Is this connected to a live laboratory backend?</summary>
            <p style={{ marginTop: 8, color: 'var(--sl-text-muted)' }}>
              This preview uses fictional demo data in your browser. Backend integration will use the Spring Boot APIs when ready.
            </p>
          </details>
          <details>
            <summary>How do I preview different staff dashboards?</summary>
            <p style={{ marginTop: 8, color: 'var(--sl-text-muted)' }}>
              Use demo login accounts on the sign-in page (password: demo) for Admin, Patient, Reception, and Lab roles.
            </p>
          </details>
          <details>
            <summary>Do I need fasting for every test?</summary>
            <p style={{ marginTop: 8, color: 'var(--sl-text-muted)' }}>
              Preparation varies by test. Each test detail page includes patient-friendly instructions.
            </p>
          </details>
        </div>
      </section>
    </>
  )
}

export function AboutPage() {
  return (
    <section className="sl-section">
      <div className="sl-section__title">
        <h1>About Smart-LIMS</h1>
        <p>
          We build software that helps medical laboratories deliver faster turnaround times,
          clearer communication with patients, and compliant audit trails.
        </p>
      </div>
      <div className="sl-grid-3">
        <Card className="sl-feature-card">
          <h3>Mission</h3>
          <p style={{ color: 'var(--sl-text-muted)' }}>
            Reduce operational friction between front desk, phlebotomy, and laboratory processing.
          </p>
        </Card>
        <Card className="sl-feature-card">
          <h3>Quality</h3>
          <p style={{ color: 'var(--sl-text-muted)' }}>
            Structured result entry with reference ranges, flags, and version history for corrections.
          </p>
        </Card>
        <Card className="sl-feature-card">
          <h3>Security-first design</h3>
          <p style={{ color: 'var(--sl-text-muted)' }}>
            Role-based interfaces prepared for backend authorization — demo login is not real security.
          </p>
        </Card>
      </div>
    </section>
  )
}

export function PublicCatalogPage() {
  const { state } = useMockData()
  const list = useListControls(state.labTests, {
    searchKeys: ['name', 'code', 'category'],
    pageSize: 6,
  })

  return (
    <section className="sl-section">
      <div className="sl-section__title">
        <h1>Laboratory tests catalog</h1>
        <p>Explore available tests, pricing, and turnaround times (demo catalog).</p>
      </div>
      <Card>
        <ListToolbar
          search={list.search}
          onSearchChange={(v) => {
            list.setSearch(v)
            list.resetPage()
          }}
          placeholder="Search by name, code, or category"
        />
        <div className="sl-grid-3">
          {list.rows.map((test) => (
            <Card key={test.id} className="sl-feature-card">
              <Link to={`/tests/${test.id}`} className="sl-test-card-link">
                <div className="sl-row" style={{ justifyContent: 'space-between' }}>
                  <strong>{test.code}</strong>
                  <span>${test.price}</span>
                </div>
                <h3 style={{ fontSize: '1rem' }}>{test.name}</h3>
                <p style={{ color: 'var(--sl-text-muted)', fontSize: 'var(--sl-text-sm)' }}>
                  {test.category} · {test.turnaround}
                </p>
              </Link>
              <Link to={`/tests/${test.id}/preparation`} style={{ fontSize: 'var(--sl-text-sm)' }}>
                Preparation instructions →
              </Link>
            </Card>
          ))}
        </div>
        <Pagination page={list.page} totalPages={list.totalPages} onPageChange={list.setPage} />
      </Card>
    </section>
  )
}

export function PublicTestDetailPage() {
  const { testId } = useParams()
  const { findTest } = useMockData()
  const test = findTest(testId)

  if (!test) {
    return (
      <section className="sl-section">
        <h1>Test not found</h1>
        <Link to="/tests">Back to catalog</Link>
      </section>
    )
  }

  return (
    <section className="sl-section">
      <Card>
        <div className="sl-row" style={{ justifyContent: 'space-between' }}>
          <div>
            <p style={{ color: 'var(--sl-text-muted)' }}>{test.code}</p>
            <h1>{test.name}</h1>
          </div>
          <StatusBadge status={test.status} />
        </div>
        <p>{test.description}</p>
        <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <div>
            <dt style={{ color: 'var(--sl-text-muted)', fontSize: 'var(--sl-text-xs)' }}>Category</dt>
            <dd>{test.category}</dd>
          </div>
          <div>
            <dt style={{ color: 'var(--sl-text-muted)', fontSize: 'var(--sl-text-xs)' }}>Sample type</dt>
            <dd>{test.sampleType}</dd>
          </div>
          <div>
            <dt style={{ color: 'var(--sl-text-muted)', fontSize: 'var(--sl-text-xs)' }}>Turnaround</dt>
            <dd>{test.turnaround}</dd>
          </div>
          <div>
            <dt style={{ color: 'var(--sl-text-muted)', fontSize: 'var(--sl-text-xs)' }}>Price</dt>
            <dd>${test.price}</dd>
          </div>
        </dl>
        <div className="sl-row" style={{ marginTop: 16 }}>
          <Link to={`/tests/${test.id}/preparation`}>
            <Button variant="secondary">Preparation</Button>
          </Link>
          <Link to="/login">
            <Button variant="primary">Order via patient portal</Button>
          </Link>
        </div>
      </Card>
    </section>
  )
}

export function PreparationPage() {
  const { testId } = useParams()
  const { findTest } = useMockData()
  const test = findTest(testId)

  if (!test) {
    return (
      <section className="sl-section">
        <h1>Test not found</h1>
        <Link to="/tests">Back to catalog</Link>
      </section>
    )
  }

  return (
    <section className="sl-section">
      <Card>
        <h1>Preparation — {test.name}</h1>
        <p style={{ color: 'var(--sl-text-muted)' }}>Patient instructions (demo content).</p>
        <div className="sl-alert sl-alert--info">{test.preparation}</div>
        <NavLink to={`/tests/${test.id}`}>← Back to test details</NavLink>
      </Card>
    </section>
  )
}
