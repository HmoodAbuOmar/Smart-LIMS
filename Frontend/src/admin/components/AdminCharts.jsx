import { useId, useRef, useState } from 'react'

export default function AdminCharts({ daily, summary, copy, number, date, local, rtl, days, onPeriod }) {
  const areaGradientId = useId()
  const tooltipId = useId()
  const pointButtons = useRef([])
  const [activeDate, setActiveDate] = useState(null)
  const maximum = Math.max(1, ...daily.map(day => day.count))
  const points = daily.map((day, index) => ({ ...day, x: rtl ? 596 - index * 552 / Math.max(1, daily.length - 1) : 44 + index * 552 / Math.max(1, daily.length - 1), y: 182 - day.count / maximum * 132 }))
  const activePoint = points.find(point => point.date === activeDate)
  const line = points.map((point, index) => {
    if (!index) return `M ${point.x} ${point.y}`
    const previous = points[index - 1]
    const middle = (previous.x + point.x) / 2
    return `C ${middle} ${previous.y}, ${middle} ${point.y}, ${point.x} ${point.y}`
  }).join(' ')
  const colors = ['#083f3d', '#12645f', '#426b67', '#77b4a7', '#a9d3c7', '#d9eee9']
  const segments = summary.testDistribution.map((test, index, tests) => ({ ...test, color: colors[index],
    percent: summary.total ? test.count / summary.total * 100 : 0,
    offset: summary.total ? tests.slice(0, index).reduce((sum, value) => sum + value.count, 0) / summary.total * 100 : 0,
  }))
  return <section className="admin-overview-charts" aria-label={copy.activity}>
    <article className="admin-overview-panel admin-activity-panel">
      <div className="admin-overview-panel-heading"><div><h3>{copy.activity}</h3><p>{copy.activityNote}</p></div>
        <div className="admin-period-control" role="group" aria-label={copy.period}>
          <button type="button" data-period="7" aria-pressed={days === 7} onClick={() => onPeriod(7)}>{copy.days7}</button>
          <button type="button" data-period="14" aria-pressed={days === 14} onClick={() => onPeriod(14)}>{copy.days14}</button>
        </div>
      </div>
      <div className="admin-activity-summary"><strong>{number(summary.total)}</strong><span>{copy.orders}</span><span className="admin-chart-series-key">{copy.selectedPeriod}</span></div>
      <div className="admin-activity-plot" role="group" aria-label={`${copy.activity}: ${number(summary.total)} ${copy.orders}`}>
      <svg className="admin-activity-chart" viewBox="0 24 640 200" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id={areaGradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#12645f" stopOpacity=".24" /><stop offset="100%" stopColor="#d9eee9" stopOpacity=".12" /></linearGradient></defs>
        {[0, 1, 2, 3].map(tick => <g key={tick}><line className="admin-chart-gridline" x1="44" x2="596" y1={182 - tick * 44} y2={182 - tick * 44} /><text className="admin-chart-axis" x={rtl ? 620 : 20} y={186 - tick * 44} textAnchor="middle">{number(Math.round(maximum * tick / 3))}</text></g>)}
        <path className="admin-chart-area" fill={`url(#${areaGradientId})`} d={`${line} L ${points.at(-1).x} 182 L ${points[0].x} 182 Z`} />
        <path className="admin-chart-line" d={line} />
        {points.map((point, index) => <g className="admin-activity-column" key={point.date}>
          <circle cx={point.x} cy={point.y} r={activeDate === point.date ? 5 : 4} className="admin-chart-point" />
          {(daily.length === 7 || [0, 3, 6, 9, 13].includes(index)) && <text className="admin-chart-axis" x={point.x} y="212" textAnchor="middle">{date(point.date, true)}</text>}
        </g>)}
      </svg>
      {points.map((point, index) => <button key={point.date} ref={element => { pointButtons.current[index] = element }} type="button" className="admin-chart-hit"
        style={{ left: `${point.x / 640 * 100}%`, top: `${(point.y - 24) / 200 * 100}%` }}
        aria-label={`${date(point.date)}: ${number(point.count)} ${copy.orders}`} aria-describedby={activeDate === point.date ? tooltipId : undefined}
        onMouseEnter={() => setActiveDate(point.date)} onMouseLeave={event => { if (document.activeElement !== event.currentTarget) setActiveDate(null) }}
        onFocus={() => setActiveDate(point.date)} onBlur={() => setActiveDate(null)} onClick={() => setActiveDate(point.date)}
        onKeyDown={event => {
          if (event.key === 'Escape') { event.stopPropagation(); setActiveDate(null) }
          const step = event.key === 'ArrowRight' ? (rtl ? -1 : 1) : event.key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0
          if (step) { event.preventDefault(); pointButtons.current[(index + step + points.length) % points.length]?.focus() }
        }} />)}
      {activePoint && <div id={tooltipId} role="tooltip" className="admin-chart-tooltip" style={{ left: `clamp(76px, ${activePoint.x / 640 * 100}%, calc(100% - 76px))`, top: `${(activePoint.y - 24) / 200 * 100}%`, transform: activePoint.y < 95 ? 'translate(-50%, 18px)' : 'translate(-50%, calc(-100% - 12px))' }}><span>{date(activePoint.date)}</span><strong>{number(activePoint.count)} {copy.orders}</strong></div>}
      </div>
    </article>
    <article className="admin-overview-panel admin-distribution-panel">
      <div className="admin-overview-panel-heading"><div><h3>{copy.distribution}</h3><p>{copy.distributionNote}</p></div></div>
      <div className="admin-distribution-content"><div className="admin-test-donut" role="img" aria-label={`${copy.distribution}: ${number(summary.total)} ${copy.tests}`}>
        <svg viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="60" fill="none" stroke="#edf6f3" strokeWidth="20" />
          {segments.map(segment => <circle className="admin-donut-segment" key={segment.id} cx="80" cy="80" r="60" pathLength="100" fill="none" stroke={segment.color} strokeWidth="20" strokeDasharray={`${Math.max(0, segment.percent - .8)} ${100 - Math.max(0, segment.percent - .8)}`} strokeDashoffset={-segment.offset} transform="rotate(-90 80 80)" />)}
        </svg>
        <div><strong>{number(summary.total)}</strong><span>{copy.tests}</span></div>
      </div>
      <ul className="admin-test-legend">{segments.map(segment => <li key={segment.id}><span className="admin-test-swatch" style={{ backgroundColor: segment.color }} aria-hidden="true" /><span>{local(segment.name)}</span><strong>{number(segment.count)}</strong><small>{number(Math.round(segment.percent))}%</small></li>)}</ul>
      </div>
    </article>
  </section>
}
