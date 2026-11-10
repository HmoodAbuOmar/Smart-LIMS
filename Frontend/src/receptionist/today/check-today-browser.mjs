import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, preview } from 'vite'
import react from '@vitejs/plugin-react'

const temporary = mkdtempSync(join(tmpdir(), 'smart-lims-receptionist-'))
const profile = join(temporary, 'chrome')
const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../../../', import.meta.url)), plugins: [react()], cacheDir: join(temporary, 'vite'), server: { host: '127.0.0.1', port: 0 } })
let browser, socket, production
const errors = []
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
try {
  await server.listen()
  browser = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  browser.on('error', error => errors.push(error.message))
  let port
  for (let i = 0; i < 80; i++) { try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; break } catch { await pause(100) } }
  assert.ok(port, `Chrome failed to start: ${errors.join('; ')}`)
  const targets = await fetch(`http://127.0.0.1:${port}/json`).then(response => response.json())
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  let sequence = 0
  const pending = new Map()
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id) { const request = pending.get(message.id); pending.delete(message.id); if (message.error) request.reject(new Error(JSON.stringify(message.error))); else request.resolve(message.result) }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text)
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push('Browser console error')
    if (message.method === 'Network.requestWillBeSent' && /\/api\//.test(message.params.request.url)) errors.push('Unexpected API request')
  })
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)) }, 10000)
      pending.set(id, { resolve: result => { clearTimeout(timeout); resolve(result) }, reject: error => { clearTimeout(timeout); reject(error) } })
      socket.send(JSON.stringify({ id, method, params }))
    })
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  async function waitFor(expression) { for (let i = 0; i < 100; i++) { if (await evaluate(`Boolean(${expression})`)) return; await pause(60) } assert.fail(`Condition not met: ${expression}`) }
  async function click(selector) { await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); element.focus(); element.click(); })()`); await pause(40) }
  async function key(key, code = key) {
    const virtual = { Enter: 13, Escape: 27, Tab: 9, Home: 36, End: 35, ArrowRight: 39, ArrowLeft: 37 }[key]
    const params = { key, code, windowsVirtualKeyCode: virtual, nativeVirtualKeyCode: virtual, ...(key==='Enter'?{text:'\r',unmodifiedText:'\r'}:{}) }
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...params })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...params })
    await pause(40)
  }
  async function screenshot(name) { const result = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(temporary, `${name}.png`), Buffer.from(result.data, 'base64')) }
  await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })

  const base = `http://127.0.0.1:${server.httpServer.address().port}`
  await send('Page.navigate', { url: `${base}/#/__receptionist/today` })
  await waitFor("document.querySelectorAll('.r01-table-container tbody tr').length===7")
  assert.equal(await evaluate("document.querySelector('.r01-heading h1').textContent"), 'Today')
  assert.ok(await evaluate("document.querySelector('.r01-sidebar [aria-current=page]').textContent.includes('Today')"))
  assert.equal(await evaluate("document.querySelectorAll('.r01-sidebar nav button:disabled').length"), 4)
  assert.equal(await evaluate("document.querySelector('.r01-role-label').textContent"), 'Receptionist')
  assert.equal(await evaluate("document.querySelectorAll('.r01-language-control .language-switcher').length"), 1)
  assert.equal(await evaluate("document.querySelectorAll('.r01-header .language-switcher').length"), 0)
  assert.ok(await evaluate("document.querySelector('.r01-sidebar-footer').getBoundingClientRect().bottom<=innerHeight"))
  assert.deepEqual(await evaluate("[...document.querySelectorAll('thead th')].map(cell=>cell.textContent)"), ['Time', 'Patient File', 'Patient', 'Order', 'Appointment Status', 'Action'])
  assert.ok(await evaluate("[...document.querySelectorAll('tbody tr')].every(row=>row.getBoundingClientRect().height>=36&&row.getBoundingClientRect().height<=40)"))
  assert.ok(await evaluate("[...document.querySelectorAll('.r01-status-dot')].every(dot=>dot.getAttribute('aria-hidden')==='true')"))
  assert.equal(await evaluate("document.querySelectorAll('.r01-check-in').length"), 7)
  assert.equal(await evaluate("document.querySelectorAll('.r01-check-in:not(:disabled)').length"), 2)
  assert.ok(await evaluate("[...document.querySelectorAll('.r01-check-in')].every(button=>{const b=button.getBoundingClientRect(),c=button.closest('td').getBoundingClientRect();return b.width===96&&b.height===31&&Math.abs((b.left+b.right-c.left-c.right)/2)<1&&button.scrollWidth<=button.clientWidth})"))
  const counts = () => evaluate("[...document.querySelectorAll('.r01-tabs button span')].map(e=>e.textContent.replace(/[()]/g,''))")
  assert.deepEqual(await counts(), ['7', '1', '3'])
  assert.equal(await evaluate("document.querySelectorAll('.r01-NO_SHOW').length"), 1)
  await click('#r01-tab-checkedIn')
  assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"), 1)
  await key('ArrowRight')
  assert.equal(await evaluate("document.activeElement.id"), 'r01-tab-notArrived')
  assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"), 3)
  assert.equal(await evaluate("document.querySelectorAll('.r01-check-in:not(:disabled)').length"), 2)
  await click('#r01-tab-arrivals')
  await click('.r01-heading .r01-primary')
  assert.ok(await evaluate("document.querySelector('dialog').textContent.includes('not available')")); await key('Escape')
  assert.ok(await evaluate("document.activeElement.matches('.r01-heading .r01-primary')"))
  await click('.r01-order-link')
  assert.ok(await evaluate("document.querySelector('dialog').textContent.includes('order details screen')")); await key('Escape')
  await click('.r01-more summary'); await key('Escape')
  assert.ok(await evaluate("document.activeElement.matches('.r01-more summary')"))
  await click('.r01-more summary'); await click('.r01-reschedule')
  assert.ok(await evaluate("document.querySelector('dialog').textContent.includes('rescheduling flow')")); await key('Escape')
  await screenshot('receptionist-en-desktop')
  // Replace only the service in this temporary browser to exercise write failures.
  await evaluate("import('/src/receptionist/today/todayService.js').then(m=>{window.originalCheckIn=m.todayService.checkIn;window.checkCalls=0;m.todayService.checkIn=async()=>{window.checkCalls++;await new Promise(r=>setTimeout(r,350));throw new Error('offline')}})")
  const original = await evaluate("document.querySelector('[data-appointment-id=\"r01-appointment-1\"]').textContent")
  await click('[data-appointment-id="r01-appointment-1"] .r01-check-in')
  assert.equal(await evaluate("document.querySelector('.r01-check-in').disabled"), true)
  assert.ok(await evaluate("[...document.querySelectorAll('.r01-check-in')].every(button=>button.disabled&&button.getBoundingClientRect().width===96&&button.getBoundingClientRect().height===31)"))
  await evaluate("document.querySelector('.r01-check-in').click()")
  await waitFor("document.querySelector('.r01-toast-error')")
  assert.equal(await evaluate('window.checkCalls'), 1)
  assert.equal(await evaluate("document.querySelector('[data-appointment-id=\"r01-appointment-1\"]').textContent"), original)
  assert.deepEqual(await counts(), ['7', '1', '3'])
  await evaluate("import('/src/receptionist/today/todayService.js').then(m=>m.todayService.checkIn=window.originalCheckIn)")
  await click('[data-appointment-id="r01-appointment-1"] .r01-check-in')
  await waitFor("document.querySelector('[data-appointment-id=\"r01-appointment-1\"] .r01-CHECKED_IN')")
  assert.deepEqual(await counts(), ['7', '2', '2'])
  assert.ok(await evaluate("document.querySelector('.r01-toast[role=status]').textContent.includes('Arrival recorded')"))
  assert.ok(await evaluate("document.querySelector('[data-appointment-id=\"r01-appointment-1\"] .r01-arrival-time bdi').textContent.length>0"))
  await click('#r01-tab-notArrived')
  assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"), 2)
  await click('#r01-tab-arrivals')
  await click('.r01-refresh')
  await waitFor("document.querySelectorAll('tbody tr').length===7")
  assert.deepEqual(await counts(), ['7', '2', '2'])
  const noShowBefore = await evaluate("document.querySelectorAll('.r01-NO_SHOW').length")
  if (await evaluate("!!document.querySelector('.r01-no-show')")) {
    await click('.r01-more:has(.r01-no-show) summary'); await click('.r01-no-show')
    assert.ok(await evaluate("document.querySelector('dialog').textContent.includes('slot has ended')"))
    await click('dialog footer button:first-child')
    assert.equal(await evaluate("document.querySelectorAll('.r01-NO_SHOW').length"), noShowBefore)
    await click('.r01-no-show'); await click('dialog footer .r01-primary')
    await waitFor(`document.querySelectorAll('.r01-NO_SHOW').length===${noShowBefore + 1}`)
  }
  await click('.r01-sidebar-footer .language-switcher button[lang=ar]')
  await waitFor("document.querySelector('.reception-today-layout').dir==='rtl'")
  assert.ok(await evaluate("[...document.querySelectorAll('.r01-check-in')].every(button=>button.getBoundingClientRect().width===96&&button.scrollWidth<=button.clientWidth)"))
  assert.ok(await evaluate("document.querySelector('.r01-heading h1').textContent==='اليوم'"))
  await screenshot('receptionist-ar-desktop')
  assert.equal(await evaluate("localStorage.getItem('smart-lims.language')"), 'ar')
  await send('Page.reload')
  await pause(250)
  await waitFor("document.querySelectorAll('tbody tr').length===7 && document.querySelector('.reception-today-layout').dir==='rtl'")
  assert.equal(await evaluate("document.querySelector('.r01-language-control button[lang=ar]').getAttribute('aria-pressed')"), 'true')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await screenshot('receptionist-ar-mobile')
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'))
  await click('.r01-menu-button')
  assert.equal(await evaluate("document.querySelector('.r01-sidebar').dataset.open"), 'true')
  await key('Escape')
  assert.ok(await evaluate("document.activeElement.matches('.r01-menu-button')"))
  await click('.r01-menu-button'); await click('.r01-sidebar-footer .language-switcher button[lang=en]'); await key('Escape')
  await waitFor("document.querySelector('.reception-today-layout').dir==='ltr'")
  assert.equal(await evaluate("localStorage.getItem('smart-lims.language')"), 'en')
  await screenshot('receptionist-en-mobile')
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'))
  await evaluate("import('/src/receptionist/today/todayService.js').then(m=>{window.originalLoad=m.todayService.load;m.todayService.load=async()=>[]})")
  await click('.r01-refresh'); await waitFor("document.querySelector('.r01-state').textContent.includes('No bookings for today')")
  assert.deepEqual(await counts(), ['0', '0', '0'])
  await evaluate("import('/src/receptionist/today/todayService.js').then(m=>m.todayService.load=async()=>{throw new Error('offline')})")
  await click('.r01-refresh'); await waitFor("document.querySelector('.r01-state[role=alert] button')")
  await evaluate("import('/src/receptionist/today/todayService.js').then(m=>m.todayService.load=window.originalLoad)")
  await click('.r01-state button'); await waitFor("document.querySelectorAll('tbody tr').length===7")
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 420, deviceScaleFactor: 1, mobile: false })
  await evaluate("document.querySelector('.r01-sidebar').scrollTop=10000")
  assert.ok(await evaluate("(()=>{const s=document.querySelector('.r01-sidebar'),f=document.querySelector('.r01-sidebar-footer'),l=document.querySelector('.r01-logout');return s.scrollHeight>s.clientHeight&&f.getBoundingClientRect().bottom<=innerHeight&&l.getBoundingClientRect().top>=0})()"))
  await screenshot('receptionist-short-sidebar')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await click('.r01-logout')
  await waitFor("document.querySelector('.r01-logout-error')")
  assert.ok(await evaluate("document.querySelector('.r01-logout-error').textContent.includes('not configured')"))
  assert.equal(await evaluate('location.hash'), '#/__receptionist/today')
  await evaluate("import('/src/receptionist/receptionistSession.js').then(m=>{window.signOutCalls=0;m.receptionistSession.signOut=async()=>{window.signOutCalls++;await new Promise(r=>setTimeout(r,350));throw new Error('offline')}})")
  await click('.r01-logout')
  assert.equal(await evaluate("document.querySelector('.r01-logout').disabled"), true)
  await evaluate("document.querySelector('.r01-logout').click()")
  await waitFor("document.querySelector('.r01-logout-error')")
  assert.equal(await evaluate('window.signOutCalls'), 1)
  assert.equal(await evaluate('location.hash'), '#/__receptionist/today')
  await evaluate("import('/src/receptionist/receptionistSession.js').then(m=>m.receptionistSession.signOut=async()=>{await new Promise(r=>setTimeout(r,350))})")
  await click('.r01-logout')
  assert.equal(await evaluate('location.hash'), '#/__receptionist/today')
  await waitFor("location.hash==='#/login'")
  assert.equal(await evaluate("localStorage.getItem('smart-lims.language')"), 'en')
  // Production renders an unavailable entry, never a preview or patient role bypass.
  production = await preview({ configFile: false, root: fileURLToPath(new URL('../../../', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } })
  const productionBase = `http://127.0.0.1:${production.httpServer.address().port}`
  await send('Page.navigate', { url: `${productionBase}/#/receptionist/today` })
  await waitFor("document.querySelector('.r01-access [role=alert]')")
  assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"), 0)
  await send('Page.navigate', { url: `${productionBase}/#/__receptionist/today` })
  await pause(300)
  assert.equal(await evaluate("document.querySelector('.reception-today-layout')"), null)
  assert.deepEqual(errors, [])
  console.log(`PASS: Today/sidebar, all tab filters/counts, recorded no-shows, check-in failure preserving row, duplicate blocking, success/arrival/counts/refresh, unavailable flows, manual no-show confirmation when eligible, empty/error/retry, EN/AR desktop/mobile and production fail-closed entry with no API requests. Screenshots: ${temporary}`)
} finally { socket?.close(); browser?.kill(); await server.close(); if (production) await new Promise(resolve => production.httpServer.close(resolve)) }

