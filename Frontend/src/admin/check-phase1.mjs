// Standalone browser verification; starts and stops its own preview server.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

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
    assert.equal(await evaluate("document.querySelectorAll('.admin-notification-indicator').length"), 1)
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
    await evaluate(`(() => { const select = document.querySelector(${JSON.stringify(selector)}); select.value = ${JSON.stringify(String(value))}; select.dispatchEvent(new Event('change', { bubbles: true })) })()`)
  }
  async function searchOrders(value) {
    await evaluate(`(() => { const input = document.querySelector('.admin-order-search input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  }
  async function inspectOverview() {
    await waitFor("document.querySelectorAll('.admin-overview-kpi').length === 6")
    assert.ok(await evaluate("document.querySelector('.admin-sample-indicator').getAttribute('title').length > 40"))
    assert.equal(await evaluate("document.querySelectorAll('.admin-overview-demo, .admin-ui-only').length"), 0)
    assert.ok(await evaluate("document.querySelector('.admin-overview-kpis').textContent.includes('₪')"))
    assert.equal(await evaluate("document.querySelectorAll('.admin-activity-column').length"), 7)
    assert.equal(await evaluate("document.querySelectorAll('.admin-donut-segment').length"), 6)
    assert.equal(await evaluate("document.querySelectorAll('.admin-test-legend li').length"), 6)
    assert.equal(await evaluate("document.querySelectorAll('.admin-appointments-table tbody tr').length"), 6)
    assert.equal(await evaluate("document.querySelectorAll('.admin-orders-section tbody tr').length"), 8)
    const firstOrder = await evaluate("document.querySelector('.admin-orders-section tbody th').textContent")
    await evaluate("document.querySelectorAll('.admin-order-pagination button')[1].click()")
    await waitFor(`document.querySelector('.admin-orders-section tbody th').textContent !== ${JSON.stringify(firstOrder)}`)
    await changeSelect('.admin-period-control select', 14)
    await waitFor("document.querySelectorAll('.admin-activity-column').length === 14")
    await evaluate("document.querySelector('.admin-chart-data summary').click()")
    assert.equal(await evaluate("document.querySelector('.admin-chart-data').open"), true)
    assert.equal(await evaluate("document.querySelectorAll('.admin-chart-data tbody tr').length"), 14)
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
    assert.equal(await evaluate("document.querySelectorAll('.admin-quick-actions button')[2].disabled"), true)
    await evaluate("document.querySelectorAll('.admin-quick-actions button')[0].click()")
    await waitFor("document.querySelector('.admin-order-filters select').value === 'review' && document.querySelectorAll('.admin-orders-section tbody tr').length > 0")
    assert.ok(await evaluate("[...document.querySelectorAll('.admin-orders-section tbody .admin-overview-status')].every(element => element.classList.contains('admin-order-review'))"))
    await changeSelect('.admin-appointment-filter select', '0')
    await waitFor("document.querySelectorAll('.admin-appointments-table tbody tr').length === 2")
    await evaluate("document.querySelectorAll('.admin-quick-actions button')[1].click()")
    await waitFor("document.querySelectorAll('.admin-appointments-table tbody tr').length === 6")
    assert.ok(await evaluate("document.activeElement.getAttribute('aria-labelledby') === 'admin-appointments-heading'"))
    await evaluate("document.querySelectorAll('.admin-quick-actions button')[3].click()")
    await waitFor("document.querySelector('.admin-period-control select').value === '7' && document.querySelector('.admin-order-filters select').value === 'all'")
    for (const width of [1440, 1024, 768, 390, 320]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
      assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), `Overview fits ${width}px`)
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
    await evaluate('window.scrollTo(0, 0)')
    if (process.env.ADMIN_SCREENSHOTS) {
      const direction = await evaluate('document.documentElement.dir')
      const shot = await send('Page.captureScreenshot', { format: 'png' })
      const path = join(temporary, `admin-overview-${direction}.png`)
      writeFileSync(path, Buffer.from(shot.data, 'base64'))
      console.log(`Screenshot: ${path}`)
    }
  }
  const nav = '.admin-navigation > button'
  await send('Runtime.enable')
  await send('Network.enable')
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: temporary })
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url })
  await waitFor(`document.querySelectorAll('${nav}').length === 8`)
  await inspectNavbar()
  assert.equal(await evaluate("document.documentElement.dir"), 'ltr')
  await inspectOverview()
  await evaluate("document.querySelectorAll('.admin-quick-actions button')[2].click()")
  let exported
  for (let attempt = 0; attempt < 40; attempt++) {
    exported = readdirSync(temporary).find(name => name.endsWith('.csv'))
    if (exported) break
    await pause(100)
  }
  assert.ok(exported, 'CSV download completes')
  const csv = readFileSync(join(temporary, exported), 'utf8')
  assert.ok(csv.includes('DEMO-O-') && csv.includes('ILS'))
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
  await evaluate("document.querySelector('.admin-language-toggle').click()")
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
  await evaluate("document.querySelector('.admin-language-toggle').click()")
  await waitFor("document.documentElement.dir === 'ltr'")
  await evaluate("document.querySelector('.admin-menu-toggle').click()")
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
  await waitFor("document.querySelector('.admin-menu-toggle').getAttribute('aria-expanded') === 'false'")
  assert.deepEqual(failures, [])
  console.log('PASS: overview KPIs, charts, period controls, order search/filter/pagination/details, appointments, quick actions, CSV download, ₪, responsive LTR/RTL, existing navbar/sidebar, Arabic/English, focus, Escape, and no mutation requests or browser errors.')
} finally {
  socket?.close()
  browser?.kill()
  await server.close()
}
