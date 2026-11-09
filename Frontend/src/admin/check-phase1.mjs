// Standalone browser verification; starts and stops its own preview server.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { dailyOrders, periodOrders } from './adminOverviewModel.js'

const frontend = fileURLToPath(new URL('../../', import.meta.url))
const temporary = mkdtempSync(join(tmpdir(), 'smart-lims-admin-phase1-'))
const profile = join(temporary, 'chrome')
const server = await createServer({
  configFile: false, root: frontend, plugins: [react()], cacheDir: join(temporary, 'vite'),
  server: { host: '127.0.0.1', port: 0, strictPort: false },
})
let browser
let socket
const pause = ms => new Promise(resolvePause => setTimeout(resolvePause, ms))
const failures = []
try {
  await server.listen()
  const url = `http://127.0.0.1:${server.httpServer.address().port}/admin/index.html`
  browser = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' })
  browser.on('error', error => failures.push(error.message))
  let port
  for (let attempt = 0; attempt < 80; attempt++) {
    try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; break }
    catch { await pause(100) }
  }
  assert.ok(port, `Chrome must start: ${failures.join('; ')}. Set CHROME_PATH if needed.`)
  const targets = await fetch(`http://127.0.0.1:${port}/json`).then(response => response.json())
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolveOpen, reject) => {
    socket.addEventListener('open', resolveOpen, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let sequence = 0
  const pending = new Map()
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const request = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) request.reject(new Error(JSON.stringify(message.error)))
      else request.resolve(message.result)
    }
    if (message.method === 'Runtime.exceptionThrown') failures.push(message.params.exceptionDetails.text)
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') failures.push('Browser console error')
    if (message.method === 'Network.requestWillBeSent' && /^https?:/.test(message.params.request.url) && message.params.request.method !== 'GET') failures.push('Unexpected non-GET network request')
  })
  function send(method, params = {}) {
    return new Promise((resolveRequest, reject) => {
      const id = ++sequence
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)) }, 10000)
      pending.set(id, { resolve: result => { clearTimeout(timeout); resolveRequest(result) }, reject: error => { clearTimeout(timeout); reject(error) } })
      socket.send(JSON.stringify({ id, method, params }))
    })
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true })
    assert.ok(!result.exceptionDetails, result.exceptionDetails?.text)
    return result.result.value
  }
  async function waitFor(expression) {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(expression)) return
      await pause(100)
    }
    assert.fail(`Condition not met: ${expression}`)
  }
  async function inspectNavbar() {
    assert.equal(await evaluate("document.querySelector('.admin-navbar-search input').disabled"), true)
    assert.equal(await evaluate("document.querySelector('.admin-notifications').disabled"), true)
    assert.equal(await evaluate("document.querySelectorAll('.admin-notification-indicator').length"), 0)
    assert.equal(await evaluate("document.querySelectorAll('.admin-language-control .language-switcher__segment').length"), 2)
    assert.equal(await evaluate("document.querySelectorAll('.admin-header .language-switcher').length"), 0)
    assert.equal(await evaluate("document.querySelectorAll('.admin-sidebar-footer .language-switcher').length"), 1)
    assert.ok(await evaluate("document.querySelector('.admin-navbar-profile').getAttribute('aria-label').length > 0"))
    assert.ok(await evaluate("document.querySelector('.admin-profile-copy strong').textContent.length > 0"))
    for (const width of [1440, 1280, 1024, 901, 900, 768, 650, 390, 320]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
      assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), `Navbar fits ${width}px`)
      assert.ok(await evaluate(`(() => {
        const header = document.querySelector('.admin-header').getBoundingClientRect()
        return [...document.querySelectorAll('.admin-header > *, .admin-navbar-actions > *')]
          .filter(element => element.getClientRects().length)
          .every(element => { const box = element.getBoundingClientRect(); return box.left >= header.left && box.right <= header.right && box.top >= header.top && box.bottom <= header.bottom })
      })()`), `Navbar controls remain inside header at ${width}px`)
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  }
  async function changeSelect(selector, value) {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
    await waitFor("!!document.querySelector('[role=listbox]')")
    await evaluate(`document.querySelector('[role=option][data-value="${value}"]').click()`)
    await waitFor("!document.querySelector('[role=listbox]')")
  }
  async function changeAdminLanguage(language) {
    const hidden = await evaluate("getComputedStyle(document.querySelector('.admin-sidebar')).display === 'none'")
    if (hidden) await evaluate("document.querySelector('.admin-menu-toggle').click()")
    await evaluate(`document.querySelector('.admin-language-control [lang=${language}]').click()`)
    await waitFor(`document.documentElement.lang === '${language}'`)
    if (hidden) {
      await evaluate("document.querySelector('.admin-menu-toggle').click()")
      await waitFor("document.querySelector('.admin-menu-toggle').getAttribute('aria-expanded') === 'false'")
    }
  }
  async function inspectDropdowns() {
    for (const selector of ['.admin-order-filters .admin-filter-trigger']) {
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'center' }); document.querySelector(${JSON.stringify(selector)}).focus()`)
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown' })
      await waitFor("document.activeElement.getAttribute('role') === 'option'")
      assert.ok(await evaluate(`(() => {
        const menu = document.querySelector('[role=listbox]')
        const box = menu.getBoundingClientRect()
        return menu.parentElement === document.body && box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight && getComputedStyle(menu).direction === document.documentElement.dir
      })()`), 'Floating menu fits the viewport and follows RTL/LTR outside clipping containers')
      for (const key of ['End', 'ArrowUp', 'Home']) {
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key })
      }
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter' })
      await waitFor("!document.querySelector('[role=listbox]')")
      assert.equal(await evaluate(`document.activeElement === document.querySelector(${JSON.stringify(selector)})`), true)
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space' })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space' })
      await waitFor("!!document.querySelector('[role=listbox]')")
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
      await waitFor("!document.querySelector('[role=listbox]')")
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
      await waitFor("!!document.querySelector('[role=listbox]')")
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 1, y: 1, button: 'left', clickCount: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 1, y: 1, button: 'left', clickCount: 1 })
      await waitFor("!document.querySelector('[role=listbox]')")
      await send('Emulation.setTouchEmulationEnabled', { enabled: true })
      for (const target of [selector, '[role=option][data-value="all"]']) {
        const point = await evaluate(`(() => { const rect = document.querySelector(${JSON.stringify(target)}).getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } })()`)
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] })
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        await waitFor(target === selector ? "!!document.querySelector('[role=listbox]')" : "!document.querySelector('[role=listbox]')")
      }
      await send('Emulation.setTouchEmulationEnabled', { enabled: false })
    }
  }
  async function searchOrders(value) {
    await evaluate(`(() => { const input = document.querySelector('.admin-order-search input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  }
  async function verifyChartPoints(rows) {
    const daily = dailyOrders(periodOrders(rows), rows)
    const actual = await evaluate(`(() => {
      const language = document.documentElement.lang
      return { language, rtl: document.documentElement.dir === 'rtl', points: [...document.querySelectorAll('.admin-activity-column')].map((group, index) => ({
        x: Number(group.querySelector('circle').getAttribute('cx')),
        y: Number(group.querySelector('circle').getAttribute('cy')),
        label: group.querySelector('text')?.textContent ?? null,
        accessible: document.querySelectorAll('.admin-chart-hit')[index].getAttribute('aria-label'),
      })) }
    })()`)
    const maximum = Math.max(1, ...daily.map(day => day.count))
    daily.forEach((day, index) => {
      const date = compact => new Intl.DateTimeFormat(actual.language, { day: 'numeric', month: 'short', ...(compact ? {} : { year: 'numeric' }), timeZone: 'UTC' }).format(new Date(`${day.date}T12:00:00Z`))
      const point = actual.points[index]
      assert.ok(Math.abs(point.y - (182 - day.count / maximum * 132)) < .01, 'Point height matches its dated order count')
      assert.ok(point.accessible.startsWith(`${date(false)}: ${new Intl.NumberFormat(actual.language).format(day.count)} `), 'Tooltip control pairs the correct date and value')
      if (point.label !== null) assert.equal(point.label, date(true))
      if (index) assert.ok(actual.rtl ? point.x < actual.points[index - 1].x : point.x > actual.points[index - 1].x, 'Chronology follows reading direction without separating dates from values')
    })
    const measure = () => evaluate(`(() => {
      const activity = document.querySelector('.admin-activity-panel').getBoundingClientRect()
      const distribution = document.querySelector('.admin-distribution-panel').getBoundingClientRect()
      return { activity: activity.height, distribution: distribution.height, ordersTop: document.querySelector('.admin-orders-section').getBoundingClientRect().top + scrollY, alertsTop: document.querySelector('[aria-labelledby="admin-alerts-heading"]').getBoundingClientRect().top + scrollY }
    })()`)
    assert.equal(await evaluate("document.querySelectorAll('.admin-chart-dialog, .admin-chart-data, .admin-overview-charts details, .admin-overview-charts table').length"), 0)
    assert.equal(await evaluate("document.querySelectorAll('.admin-chart-hit').length"), rows)
    const before = await measure()
    if (await evaluate('innerWidth > 900')) assert.ok(Math.abs(before.activity - before.distribution) < 1, 'Desktop chart cards have equal natural heights')
    await evaluate("document.querySelector('.admin-chart-hit').focus()")
    await waitFor("!!document.querySelector('.admin-chart-tooltip')")
    assert.equal(await evaluate("document.querySelector('.admin-chart-tooltip strong').textContent"), await evaluate("document.activeElement.getAttribute('aria-label').split(': ')[1]"))
    const nextIndex = await evaluate('document.documentElement.dir === "rtl"') ? rows - 1 : 1
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight' })
    await waitFor(`document.activeElement === document.querySelectorAll('.admin-chart-hit')[${nextIndex}]`)
    assert.equal(await evaluate("document.querySelector('.admin-chart-tooltip strong').textContent"), await evaluate("document.activeElement.getAttribute('aria-label').split(': ')[1]"))
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
    await waitFor("!document.querySelector('.admin-chart-tooltip')")
    await evaluate("document.activeElement.blur(); document.querySelector('.admin-chart-hit:last-of-type').scrollIntoView({ block: 'center' })")
    const point = await evaluate("(() => { const box = [...document.querySelectorAll('.admin-chart-hit')].at(-1).getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2 } })()")
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point })
    await waitFor("!!document.querySelector('.admin-chart-tooltip')")
    const lastLabel = await evaluate("[...document.querySelectorAll('.admin-chart-hit')].at(-1).getAttribute('aria-label').split(': ')[1]")
    assert.equal(await evaluate("document.querySelector('.admin-chart-tooltip strong').textContent"), lastLabel)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 })
    await waitFor("!document.querySelector('.admin-chart-tooltip')")
    await send('Emulation.setTouchEmulationEnabled', { enabled: true })
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] })
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await waitFor("!!document.querySelector('.admin-chart-tooltip')")
    assert.equal(await evaluate("document.querySelector('.admin-chart-tooltip strong').textContent"), lastLabel)
    await send('Emulation.setTouchEmulationEnabled', { enabled: false })
    assert.deepEqual(await measure(), before, 'Point interactions do not move charts or the tables below')
    await evaluate("document.activeElement.blur(); document.querySelector('.admin-period-control button[aria-pressed=true]').focus()")
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 })
  }
  async function inspectOverview() {
    await waitFor("document.querySelectorAll('.admin-overview-kpi').length === 6")
    assert.equal(await evaluate("document.querySelector('.admin-header-heading > span')"), null)
    assert.equal(await evaluate("document.querySelector('.admin-header-heading h1').textContent"), await evaluate("document.documentElement.lang === 'ar' ? 'لوحة تحكم المسؤول' : 'Admin Dashboard'"))
    assert.equal(await evaluate("document.querySelectorAll('.admin-quick-actions, #admin-quick-heading, .admin-overview-bottom').length"), 0)
    assert.equal(await evaluate("document.querySelectorAll('.admin-operations-summary').length"), 0)
    assert.equal(await evaluate("document.querySelector('.admin-overview-kpis').nextElementSibling.className"), 'admin-overview-charts')
    assert.ok(await evaluate("[...document.querySelectorAll('.admin-overview-kpi')].every(card => getComputedStyle(card).backgroundColor === 'rgb(255, 255, 255)')"))
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.admin-kpi-icon')).borderEndStartRadius"), '62%')
    assert.equal(await evaluate("document.querySelectorAll('.admin-kpi-wave-line').length"), 6)
    assert.equal(await evaluate("document.querySelectorAll('.admin-kpi-sparkline small, .admin-kpi-sparkline polyline').length"), 0)
    assert.equal(await evaluate("new Set([...document.querySelectorAll('.admin-kpi-wave-line')].map(path => path.getAttribute('d'))).size"), 6)
    assert.equal(await evaluate("document.querySelectorAll('.admin-kpi-wave-endpoint').length"), 6)
    assert.ok(await evaluate(`([...document.querySelectorAll('.admin-kpi-sparkline svg')]).every(svg => {
      const line = svg.querySelector('.admin-kpi-wave-line')
      const marker = svg.querySelector('.admin-kpi-wave-endpoint')
      const end = line.getPointAtLength(line.getTotalLength())
      return Math.abs(end.x - marker.cx.baseVal.value) < .1 && Math.abs(end.y - marker.cy.baseVal.value) < .1 &&
        end.x + 4 < 160 && end.y - 4 > 0 && end.y + 4 < 26 &&
        getComputedStyle(marker).fill === getComputedStyle(line).stroke && svg.closest('[aria-hidden="true"]') !== null
    })`))
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.admin-overview-heading'), '::before').width"), '3px')
    assert.equal(await evaluate("document.querySelectorAll('.admin-period-control button').length"), 2)
    assert.ok(await evaluate("document.querySelector('.admin-chart-area').getAttribute('fill').startsWith('url(#')"))
    assert.ok(await evaluate(`(() => {
      const cards = [...document.querySelectorAll('.admin-overview-kpi')].map(element => element.getBoundingClientRect())
      const charts = [...document.querySelectorAll('.admin-overview-charts > article')].map(element => element.getBoundingClientRect())
      const tables = [...document.querySelectorAll('.admin-overview-tables > section')].map(element => element.getBoundingClientRect())
      return cards.every(card => Math.abs(card.top - cards[0].top) < 1) && Math.abs(charts[0].top - charts[1].top) < 1 && Math.abs(tables[0].top - tables[1].top) < 1 && tables[0].top - Math.max(...charts.map(chart => chart.bottom)) <= 16 && document.querySelector('.admin-header').getBoundingClientRect().height <= 80
    })()`), 'Desktop uses one KPI row, paired charts, paired tables directly below, and a compact navbar')
    assert.equal(await evaluate("document.querySelector('.admin-data-context')"), null)
    assert.equal(await evaluate("document.querySelector('.admin-activity-chart').getAttribute('preserveAspectRatio')"), 'none')
    assert.equal(await evaluate("Math.round(document.querySelector('.admin-sidebar').getBoundingClientRect().width)"), 256)
    assert.equal(await evaluate("document.querySelectorAll('.admin-overview-demo, .admin-ui-only, .admin-sample-indicator').length"), 0)
    assert.ok(await evaluate("document.querySelector('.admin-overview-kpis').textContent.includes('₪')"))
    assert.equal(await evaluate("document.querySelectorAll('.admin-activity-column').length"), 7)
    await verifyChartPoints(7)
    assert.equal(await evaluate("document.querySelectorAll('.admin-donut-segment').length"), 6)
    assert.equal(await evaluate("document.querySelectorAll('.admin-test-legend li').length"), 6)
    assert.equal(await evaluate("document.querySelectorAll('.admin-appointments-table').length"), 0)
    assert.equal(await evaluate("document.querySelectorAll('.admin-alert-row').length"), 3)
    assert.equal(await evaluate("document.querySelectorAll('.admin-laboratory-alerts button, .admin-laboratory-alerts a').length"), 0)
    assert.equal(await evaluate("document.querySelector('.admin-alerts-source')"), null)
    for (const [kind, expected] of [['review', 6], ['attention', 2]]) {
      assert.equal(await evaluate(`document.querySelector('.admin-alert-${kind} .admin-alert-count').firstChild.textContent`), new Intl.NumberFormat(await evaluate('document.documentElement.lang')).format(expected))
    }
    assert.equal(await evaluate("document.querySelector('.admin-alert-rejected .admin-alert-count').firstChild.textContent"), new Intl.NumberFormat(await evaluate('document.documentElement.lang')).format(2))
    assert.equal(await evaluate("document.querySelectorAll('.admin-orders-section tbody tr').length"), 8)
    const firstOrder = await evaluate("document.querySelector('.admin-orders-section tbody th').textContent")
    await evaluate("document.querySelectorAll('.admin-order-pagination button')[1].click()")
    await waitFor(`document.querySelector('.admin-orders-section tbody th').textContent !== ${JSON.stringify(firstOrder)}`)
    await evaluate("document.querySelector('.admin-period-control [data-period=\"14\"]').click()")
    await waitFor("document.querySelectorAll('.admin-activity-column').length === 14")
    await verifyChartPoints(14)
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 480, deviceScaleFactor: 1, mobile: false })
    await verifyChartPoints(14)
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
    await searchOrders('DEMO-O-1401')
    await waitFor("document.querySelectorAll('.admin-orders-section tbody tr').length === 1")
    await evaluate("document.querySelector('.admin-overview-text-button').click()")
    await waitFor("document.querySelector('.admin-order-dialog').open")
    assert.ok(await evaluate("document.querySelector('.admin-order-dialog').textContent.includes('DEMO-O-1401')"))
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
    await waitFor("!document.querySelector('.admin-order-dialog').open")
    assert.equal(await evaluate("document.activeElement.className"), 'admin-overview-text-button')
    await searchOrders('no-such-demo-record')
    await waitFor("document.querySelectorAll('.admin-orders-section tbody tr').length === 0")
    assert.ok(await evaluate("document.querySelector('.admin-orders-section [role=status]').textContent.length > 0"))
    await searchOrders('')
    await changeSelect('.admin-order-filters .admin-filter-trigger', 'review')
    await waitFor("document.querySelector('.admin-order-filters .admin-filter-trigger').dataset.value === 'review' && document.querySelectorAll('.admin-orders-section tbody tr').length > 0")
    assert.ok(await evaluate("[...document.querySelectorAll('.admin-orders-section tbody .admin-overview-status')].every(element => element.classList.contains('admin-order-review'))"))
    await changeSelect('.admin-order-filters .admin-filter-trigger', 'all')
    await evaluate("document.querySelector('.admin-period-control [data-period=\"7\"]').click()")
    await waitFor("document.querySelector('.admin-period-control [data-period=\"7\"]').getAttribute('aria-pressed') === 'true' && document.querySelector('.admin-order-filters .admin-filter-trigger').dataset.value === 'all'")
    for (const width of [1650, 1440, 1280, 1024, 901, 768, 390, 320]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
      if (width === 1650 || width === 390) await inspectDropdowns()
      assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), `Overview fits ${width}px`)
      assert.ok(await evaluate(`(() => {
        const table = document.querySelector('.admin-orders-section .admin-overview-table-scroll')
        const overview = document.querySelector('.admin-overview')
        const sections = [...overview.children].filter(child => child.tagName !== 'DIALOG')
        return table.scrollHeight <= table.clientHeight + 1 &&
          getComputedStyle(table).maxHeight === 'none' &&
          sections.every((section, index) => !index || Math.abs(section.getBoundingClientRect().top - sections[index - 1].getBoundingClientRect().bottom - 12) < 1)
      })()`), `All paginated rows fit without internal vertical scrolling and section gaps match at ${width}px`)
      if (width > 900) assert.ok(await evaluate(`(() => {
        const alerts = document.querySelector('.admin-laboratory-alerts').getBoundingClientRect()
        const rows = [...document.querySelectorAll('.admin-alert-row')].map(row => row.getBoundingClientRect())
        return getComputedStyle(document.querySelector('.admin-laboratory-alerts')).alignSelf === 'start' &&
          rows.every(row => row.height >= 76) &&
          rows[0].top >= alerts.top && rows.at(-1).bottom <= alerts.bottom &&
          rows.slice(1).every((row, index) => row.top >= rows[index].bottom)
      })()`), 'Desktop alerts use compact natural card heights without stretching to the orders table')
      if (width > 900) assert.ok(await evaluate(`(() => {
        const cards = [...document.querySelectorAll('.admin-overview-kpi')].map(element => element.getBoundingClientRect())
        const tables = [...document.querySelectorAll('.admin-overview-tables > section')].map(element => element.getBoundingClientRect())
        const charts = [...document.querySelectorAll('.admin-overview-charts > article')].map(element => element.getBoundingClientRect())
        return cards.every(card => Math.abs(card.top - cards[0].top) < 1) && Math.abs(tables[0].top - tables[1].top) < 1 && Math.abs(charts[0].height - charts[1].height) < 1
      })()`), `Single KPI row and paired tables at desktop width ${width}px`)
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 1650, height: 900, deviceScaleFactor: 1, mobile: false })
    await evaluate('window.scrollTo(0, 400)')
    await waitFor('scrollY > 0')
    assert.ok(await evaluate(`(() => {
      const sidebar = document.querySelector('.admin-sidebar').getBoundingClientRect()
      const main = document.querySelector('.admin-main')
      return Math.abs(sidebar.top) < 1 && main.scrollHeight <= main.clientHeight + 1 &&
        getComputedStyle(document.querySelector('.admin-sidebar')).position === 'sticky'
    })()`), 'Main document handles vertical scrolling while the sidebar stays sticky')
    await evaluate('window.scrollTo(0, 0)')
    if (process.env.ADMIN_SCREENSHOTS) {
      await evaluate('document.activeElement?.blur()')
      const direction = await evaluate('document.documentElement.dir')
      const shot = await send('Page.captureScreenshot', { format: 'png' })
      const path = join(temporary, `admin-overview-${direction}.png`)
      writeFileSync(path, Buffer.from(shot.data, 'base64'))
      console.log(`Screenshot: ${path}`)
    }
  }
  const nav = '.admin-navigation > button'
  await send('Runtime.enable')
  await send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url })
  await waitFor(`document.querySelectorAll('${nav}').length === 8`)
  await inspectNavbar()
  assert.equal(await evaluate("document.documentElement.dir"), 'ltr')
  await inspectOverview()
  assert.equal(await evaluate("document.querySelector('.admin-logout').disabled"), true)
  await waitFor("document.querySelector('.admin-logo').complete && document.querySelector('.admin-logo').naturalWidth > 0")
  await evaluate(`document.querySelectorAll('${nav}')[1].click()`)
  await waitFor("document.querySelector('.admin-header-heading > span').textContent === 'Users'")
  assert.equal(await evaluate(`document.querySelectorAll('${nav}[aria-current="true"]').length`), 1)
  assert.equal(await evaluate("document.getElementById('admin-submenu-testCatalog').hidden"), true)
  await evaluate("document.getElementById('admin-group-testCatalog').focus()")
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
  await waitFor("!document.getElementById('admin-submenu-testCatalog').hidden")
  for (let child = 0; child < 3; child++) {
    await evaluate(`document.querySelectorAll('.admin-submenu button')[${child}].click()`)
    await waitFor(`document.querySelectorAll('.admin-submenu button')[${child}].getAttribute('aria-current') === 'true'`)
    assert.equal(await evaluate("document.querySelectorAll('.admin-navigation [aria-current=true]').length"), 1)
  }
  await evaluate("document.querySelector('.admin-submenu button').focus()")
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
  await waitFor("document.getElementById('admin-submenu-testCatalog').hidden")
  assert.equal(await evaluate("document.activeElement.id"), 'admin-group-testCatalog')
  // Simulate a new selection supplied by a future route while the group is closed.
  await evaluate("document.querySelector('.admin-submenu button').click()")
  await waitFor("!document.getElementById('admin-submenu-testCatalog').hidden")
  await changeAdminLanguage('ar')
  await waitFor("document.documentElement.dir === 'rtl'")
  assert.equal(await evaluate("document.documentElement.lang"), 'ar')
  await inspectNavbar()
  await evaluate(`document.querySelectorAll('${nav}')[0].click()`)
  await inspectOverview()
  assert.ok(await evaluate("/[\\u0600-\\u06ff]/.test(document.querySelector('h1').textContent)"))
  assert.ok(await evaluate("document.querySelector('.admin-sidebar').getBoundingClientRect().left > document.querySelector('main').getBoundingClientRect().left"))
  await send('Page.reload')
  await pause(500)
  await waitFor("document.querySelector('.admin-layout') && document.documentElement.dir === 'rtl'")
  for (const width of [390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: false })
    await waitFor("getComputedStyle(document.querySelector('.admin-sidebar')).display === 'none'")
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
    await evaluate("document.querySelector('.admin-menu-toggle').click()")
    await waitFor("document.querySelector('.admin-menu-toggle').getAttribute('aria-expanded') === 'true'")
    assert.notEqual(await evaluate("getComputedStyle(document.querySelector('.admin-sidebar')).display"), 'none')
    await evaluate(`document.querySelectorAll('${nav}')[2].click()`)
    await waitFor("document.querySelector('.admin-menu-toggle').getAttribute('aria-expanded') === 'false'")
    assert.equal(await evaluate("document.activeElement.className"), 'admin-menu-toggle')
  }
  await changeAdminLanguage('en')
  await waitFor("document.documentElement.dir === 'ltr'")
  await evaluate("document.querySelector('.admin-menu-toggle').click()")
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
  await waitFor("document.querySelector('.admin-menu-toggle').getAttribute('aria-expanded') === 'false'")
  // Compare the actual Portal controls, rather than relying on copied declarations.
  async function controlStyles(languageSelector, bellSelector) {
    return evaluate(`(() => {
      const read = (element, keys) => { const style = getComputedStyle(element); return Object.fromEntries(keys.map(key => [key, style[key]])) }
      const root = document.querySelector(${JSON.stringify(languageSelector)})
      const bell = document.querySelector(${JSON.stringify(bellSelector)})
      const keys = ['display', 'padding', 'borderWidth', 'borderColor', 'borderRadius', 'backgroundColor', 'color']
      return { language: read(root, keys), segments: [...root.querySelectorAll('button')].map(button => read(button, [...keys, 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'minWidth', 'minHeight', 'transition'])), bell: read(bell, ['display', 'padding', 'borderWidth', 'borderRadius', 'backgroundColor', 'color']), icon: { width: bell.querySelector('svg').getAttribute('width'), stroke: bell.querySelector('svg').getAttribute('stroke-width') } }
    })()`)
  }
  async function navigationStyles(selector) {
    return evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(selector)})
      const read = element => {
        const style = getComputedStyle(element)
        const keys = ['display', 'gap', 'padding', 'borderWidth', 'borderRadius', 'backgroundColor', 'color', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'transition', 'boxShadow']
        return { styles: Object.fromEntries(keys.map(key => [key, style[key]])), iconSize: element.querySelector('svg').getAttribute('width'), stroke: element.querySelector('svg').getAttribute('stroke-width') }
      }
      return { active: read(root.querySelector('[aria-current]')), inactive: read(root.querySelector(':scope > button:not([aria-current])')) }
    })()`)
  }
  async function hoveredNavigation(selector) {
    const document = await send('DOM.getDocument')
    const { nodeId } = await send('DOM.querySelector', { nodeId: document.root.nodeId, selector: `${selector} > button:not([aria-current])` })
    await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] })
    await pause(250)
    const result = await navigationStyles(selector)
    await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] })
    await pause(250)
    return result.inactive
  }
  await send('DOM.enable')
  await send('CSS.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1650, height: 900, deviceScaleFactor: 1, mobile: false })
  await pause(250)
  const adminControls = await controlStyles('.admin-language-control .language-switcher', '.admin-notifications')
  const adminNavigation = await navigationStyles('.admin-navigation')
  const adminHover = await hoveredNavigation('.admin-navigation')
  await send('Page.navigate', { url: url.replace('/admin/index.html', '/#/__portal/dashboard') })
  await waitFor("!!document.querySelector('.portal-bell') && !!document.querySelector('.portal-sidebar .language-switcher')")
  await pause(250)
  const portalControls = await controlStyles('.portal-sidebar .language-switcher', '.portal-bell')
  assert.deepEqual(adminControls, portalControls, 'Language and bell control styles match the actual Patient Portal')
  assert.deepEqual(adminNavigation, await navigationStyles('.portal-sidebar nav'), 'Active and inactive navigation styles match the Patient Portal')
  assert.deepEqual(adminHover, await hoveredNavigation('.portal-sidebar nav'), 'Navigation hover styles match the Patient Portal')
  if (process.env.ADMIN_SCREENSHOTS) {
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    const path = join(temporary, 'patient-portal-control-reference.png')
    writeFileSync(path, Buffer.from(shot.data, 'base64'))
    console.log(`Portal reference screenshot: ${path}`)
  }
  await evaluate("document.querySelector('.portal-sidebar .language-switcher [lang=ar]').click()")
  await waitFor("document.documentElement.dir === 'rtl'")
  await pause(250)
  const portalArabicControls = await controlStyles('.portal-sidebar .language-switcher', '.portal-bell')
  const portalArabicNavigation = await navigationStyles('.portal-sidebar nav')
  await send('Page.navigate', { url })
  await waitFor("!!document.querySelector('.admin-language-control') && document.documentElement.lang === 'en'")
  assert.equal(await evaluate("localStorage.getItem('smart-lims.language')"), 'ar', 'Portal language is independent from Admin')
  await changeAdminLanguage('ar')
  await waitFor("document.documentElement.dir === 'rtl'")
  await pause(250)
  assert.deepEqual(await controlStyles('.admin-language-control .language-switcher', '.admin-notifications'), portalArabicControls, 'Arabic controls match the Portal too')
  assert.deepEqual(await navigationStyles('.admin-navigation'), portalArabicNavigation, 'Arabic navigation and mirrored accent match the Portal too')
  await changeAdminLanguage('en')
  await waitFor("document.documentElement.lang === 'en'")
  assert.equal(await evaluate("localStorage.getItem('smart-lims.language')"), 'ar', 'Admin switching does not change the Portal preference')
  assert.deepEqual(failures, [])
  console.log('PASS: equal desktop chart heights; exact point counts via mouse, keyboard and touch; no chart modal or expandable table in English/Arabic; existing overview filters, navigation parity, responsive layouts, and no mutation requests or browser errors.')
} finally {
  socket?.close()
  browser?.kill()
  await server.close()
}
