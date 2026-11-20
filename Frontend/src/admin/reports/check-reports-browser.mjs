import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const temporary = mkdtempSync(join(tmpdir(), 'smart-lims-reports-'))
const profile = join(temporary, 'chrome')
const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../../../', import.meta.url)), plugins: [react()], cacheDir: join(temporary, 'vite'), server: { host: '127.0.0.1', port: 0 } })
let browser, socket
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
  async function input(selector, value) {
    await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(element.tagName === 'SELECT' ? HTMLSelectElement.prototype : element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); })()`)
    await pause(35)
  }
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

  const url = `http://127.0.0.1:${server.httpServer.address().port}`
  await send('Page.navigate', { url: `${url}/#/__admin/reports` })
  await waitFor("document.querySelectorAll('.rp-status-table tbody tr').length===8")
  assert.equal(await evaluate("document.querySelector('.admin-header h1').textContent"), 'Reports')
  assert.ok(await evaluate("document.querySelector('.admin-navigation [aria-current=true]').textContent.includes('Reports')"))
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.rp-status-table thead tr')].map(r=>r.textContent)"), ['StatusOrdersShare', 'StatusTestsShare'])
  assert.ok(await evaluate("[...document.querySelectorAll('.rp-status-table')].every(table=>{const rows=[...table.querySelectorAll('tbody tr')];const total=rows.reduce((sum,row)=>sum+Number(row.querySelector('.rp-count').textContent),0);return rows.every(row=>row.querySelector('.rp-share').textContent===new Intl.NumberFormat('en',{style:'percent',maximumFractionDigits:1}).format(Number(row.querySelector('.rp-count').textContent)/total))})"))
  assert.ok(await evaluate("[...document.querySelectorAll('.rp-status-table')].every(table=>{const rows=[...table.querySelectorAll('tbody tr')],total=rows.reduce((sum,row)=>sum+Number(row.querySelector('.rp-count').textContent),0);return rows.every(row=>Math.abs(parseFloat(row.querySelector('.rp-share-track>span').style.inlineSize)-Number(row.querySelector('.rp-count').textContent)/total*100)<.001)})"))
  assert.ok(await evaluate("[...document.querySelectorAll('.rp-share-track')].every(bar=>bar.getAttribute('aria-hidden')==='true')"))
  assert.ok(await evaluate("[...document.querySelectorAll('.rp-status-table tbody tr')].every(row=>row.getBoundingClientRect().height>=36&&row.getBoundingClientRect().height<=40)"))
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.rp-period')).display"), 'none')
  assert.ok(await evaluate("!document.querySelector('#rp-operational-title')"))
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.rp-heading-actions button:last-child')).backgroundColor"), 'rgb(255, 255, 255)')
  assert.ok(await evaluate("Math.abs(document.querySelector('#rp-from').getBoundingClientRect().top-document.querySelector('#rp-to').getBoundingClientRect().top)<2"))
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false })
  assert.ok(await evaluate("document.querySelector('.admin-reports').getBoundingClientRect().width<=1280"))
  await screenshot('reports-en-wide-desktop')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  const original = await evaluate("document.querySelector('.rp-financial').textContent")
  await input('#rp-from', '2099-01-01'); await input('#rp-to', '2099-01-02')
  assert.equal(await evaluate("document.querySelector('.rp-financial').textContent"), original)
  assert.ok(await evaluate("document.querySelector('.rp-unapplied')!==null"))
  await click('.rp-toolbar button')
  await waitFor("document.querySelector('.rp-empty')")
  assert.ok(await evaluate("[...document.querySelectorAll('.rp-count')].every(cell=>cell.textContent==='0')"))
  assert.ok(await evaluate("[...document.querySelectorAll('.rp-share')].every(cell=>cell.textContent==='—')"))
  assert.equal(await evaluate("document.querySelectorAll('.rp-share-track').length"), 0)
  await input('#rp-from', '2099-02-01'); await click('.rp-toolbar button')
  assert.ok(await evaluate("document.querySelector('#rp-error')!==null"))
  assert.ok(await evaluate("document.querySelector('.rp-period').textContent.includes('1 Jan 2099')"))
  const period = await evaluate("import('/src/admin/reports/reportsModel.js').then(m=>m.defaultPeriod())")
  await input('#rp-from', period.from); await input('#rp-to', period.to); await click('.rp-toolbar button')
  assert.equal(await evaluate("document.querySelector('.rp-financial').textContent"), original)
  assert.equal(await evaluate("document.querySelectorAll('.rp-share-track').length"), 8)
  await input('#rp-from', period.to); await input('#rp-to', period.to); await click('.rp-toolbar button')
  assert.ok(await evaluate("document.querySelector('.rp-status-table .rp-share').textContent==='0%'"))
  assert.equal(await evaluate("document.querySelector('.rp-status-table .rp-status-COMPLETED .rp-share-track>span').style.inlineSize"), '100%')
  await input('#rp-from', period.from); await click('.rp-toolbar button')
  await click('.rp-heading-actions button:first-child')
  await waitFor("document.querySelector('dialog[open]')")
  assert.ok(await evaluate("document.querySelector('dialog').textContent.includes('confirmedAt') && document.querySelector('dialog').textContent.includes('parent order')"))
  await screenshot('reports-en-sources'); await key('Escape')
  assert.ok(await evaluate("document.activeElement.matches('.rp-heading-actions button:first-child')"))
  await screenshot('reports-en-desktop')
  await evaluate("window.print=()=>{window.reportPrinted=true}")
  await click('.rp-heading-actions button:last-child')
  assert.equal(await evaluate('window.reportPrinted'), true)
  await input('#rp-from', '2099-01-01')
  await send('Emulation.setEmulatedMedia', { media: 'print' })
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.admin-sidebar')).display"), 'none')
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.rp-toolbar')).display"), 'none')
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.rp-heading-actions')).display"), 'none')
  assert.ok(await evaluate("!document.querySelector('.rp-period').textContent.includes('2099')"))
  const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true })
  assert.ok(pdf.data.length > 2000)
  writeFileSync(join(temporary, 'reports-en-print.pdf'), Buffer.from(pdf.data, 'base64'))
  await screenshot('reports-en-print')
  await send('Emulation.setEmulatedMedia', { media: 'screen' })
  await input('#rp-from', period.from)
  await click('.admin-language-control button[lang=ar]')
  await waitFor("document.documentElement.lang==='ar'")
  assert.ok(await evaluate("document.querySelector('#rp-title').textContent==='التقارير التشغيلية والمالية'"))
  assert.equal(await evaluate("document.querySelector('#rp-from').value"), period.from)
  await screenshot('reports-ar-desktop')
  await send('Emulation.setEmulatedMedia', { media: 'print' })
  const arPdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true })
  writeFileSync(join(temporary, 'reports-ar-print.pdf'), Buffer.from(arPdf.data, 'base64'))
  await screenshot('reports-ar-print')
  await send('Emulation.setEmulatedMedia', { media: 'screen' })
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await screenshot('reports-ar-mobile')
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'))
  await click('.rp-heading-actions button:first-child'); await screenshot('reports-ar-mobile-sources'); await key('Escape')
  await evaluate("document.querySelector('.admin-language-control button[lang=en]').click()")
  await waitFor("document.documentElement.lang==='en'")
  await screenshot('reports-en-mobile')
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'))
  const revisit = async () => {
    await evaluate("document.querySelector('.admin-navigation button').click()")
    await evaluate("[...document.querySelectorAll('.admin-navigation button')].find(b=>b.textContent.includes('Reports')).click()")
  }
  await evaluate("import('/src/admin/reports/reportsService.js').then(m=>{window.realReportLoad=m.reportsService.load;m.reportsService.load=()=>new Promise((_,reject)=>setTimeout(()=>reject(new Error('offline')),300))})")
  await revisit(); await waitFor("document.querySelector('.rp-state[role=status]')")
  await waitFor("document.querySelector('.rp-state[role=alert] button')")
  assert.equal(await evaluate("document.querySelector('.rp-heading-actions button:last-child').disabled"), true)
  await evaluate("import('/src/admin/reports/reportsService.js').then(m=>m.reportsService.load=window.realReportLoad)")
  await click('.rp-state button'); await waitFor("document.querySelector('.rp-financial')")
  await evaluate("import('/src/admin/reports/reportsService.js').then(m=>m.reportsService.load=async()=>{const e=new Error();e.code='REPORTS_UNAVAILABLE';throw e})")
  await revisit(); await waitFor("document.querySelector('.rp-state').textContent.includes('have not been configured')")
  assert.deepEqual(errors, [])
  console.log(`PASS: Reports route/sidebar, applied/draft dates, invalid range, all-section empty period, source details/Escape/focus, print action and EN/AR print PDFs, desktop/mobile RTL/LTR, loading/error/retry/unavailable, disabled print and no API requests. Artifacts: ${temporary}`)
} finally { socket?.close(); browser?.kill(); await server.close() }

