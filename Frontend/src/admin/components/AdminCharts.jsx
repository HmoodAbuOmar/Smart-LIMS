export default function AdminCharts({ daily, summary, copy, number, date, local, rtl, days, onPeriod }) {
  const maximum = Math.max(1, ...daily.map(day => day.count))
  const points = daily.map((day, index) => ({ ...day, x: rtl ? 596 - index * 552 / Math.max(1, daily.length - 1) : 44 + index * 552 / Math.max(1, daily.length - 1), y: 182 - day.count / maximum * 132 }))
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
    <article className="admin-overview-panel">
      <div className="admin-overview-panel-heading"><div><h3>{copy.activity}</h3><p>{copy.activityNote}</p></div>
        <label className="admin-period-control"><span className="admin-overview-sr-only">{copy.period}</span><select value={days} onChange={event => onPeriod(Number(event.target.value))}><option value={7}>{copy.days7}</option><option value={14}>{copy.days14}</option></select></label>
      </div>
      <div className="admin-activity-summary"><strong>{number(summary.total)}</strong><span>{copy.orders}</span><span className="admin-chart-series-key">{copy.selectedPeriod}</span></div>
      <svg className="admin-activity-chart" viewBox="0 0 640 224" role="img" aria-label={`${copy.activity}: ${number(summary.total)} ${copy.orders}`}>
        {[0, 1, 2, 3].map(tick => <g key={tick}><line className="admin-chart-gridline" x1="44" x2="596" y1={182 - tick * 44} y2={182 - tick * 44} /><text className="admin-chart-axis" x={rtl ? 620 : 20} y={186 - tick * 44} textAnchor="middle">{number(Math.round(maximum * tick / 3))}</text></g>)}
        <path className="admin-chart-area" d={`${line} L ${points.at(-1).x} 182 L ${points[0].x} 182 Z`} />
        <path className="admin-chart-line" d={line} />
        {points.map((point, index) => <g className="admin-activity-column" key={point.date}>
          <circle cx={point.x} cy={point.y} r="4" className="admin-chart-point"><title>{date(point.date)}: {number(point.count)}</title></circle>
          {(daily.length === 7 || [0, 3, 6, 9, 13].includes(index)) && <text className="admin-chart-axis" x={point.x} y="212" textAnchor="middle">{date(point.date, true)}</text>}
        </g>)}
      </svg>
      <details className="admin-chart-data"><summary>{copy.chartTable}</summary><table><thead><tr><th scope="col">{copy.date}</th><th scope="col">{copy.orders}</th></tr></thead><tbody>{daily.map(day => <tr key={day.date}><th scope="row">{date(day.date)}</th><td>{number(day.count)}</td></tr>)}</tbody></table></details>
    </article>
    <article className="admin-overview-panel">
      <div className="admin-overview-panel-heading"><div><h3>{copy.distribution}</h3><p>{copy.distributionNote}</p></div></div>
      <div className="admin-test-donut" role="img" aria-label={`${copy.distribution}: ${number(summary.total)} ${copy.tests}`}>
        <svg viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="60" fill="none" stroke="#edf6f3" strokeWidth="20" />
          {segments.map(segment => <circle className="admin-donut-segment" key={segment.id} cx="80" cy="80" r="60" pathLength="100" fill="none" stroke={segment.color} strokeWidth="20" strokeDasharray={`${Math.max(0, segment.percent - .8)} ${100 - Math.max(0, segment.percent - .8)}`} strokeDashoffset={-segment.offset} transform="rotate(-90 80 80)" />)}
        </svg>
        <div><strong>{number(summary.total)}</strong><span>{copy.tests}</span></div>
      </div>
      <ul className="admin-test-legend">{segments.map(segment => <li key={segment.id}><span className="admin-test-swatch" style={{ backgroundColor: segment.color }} aria-hidden="true" /><span>{local(segment.name)}</span><strong>{number(segment.count)}</strong><small>{number(Math.round(segment.percent))}%</small></li>)}</ul>
    </article>
  </section>
}
