import { Card } from '../ui/Card'

export function DashboardStats({ stats }) {
  return (
    <div className="sl-grid-stats">
      {stats.map((stat) => (
        <Card key={stat.label} className="sl-stat-card">
          <div className="sl-stat-card__value">{stat.value}</div>
          <div className="sl-stat-card__label">{stat.label}</div>
        </Card>
      ))}
    </div>
  )
}
