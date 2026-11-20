import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const temporary = mkdtempSync(join(tmpdir(), 'smart-lims-audit-'))
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

  const url='http://127.0.0.1:'+server.httpServer.address().port
  await send('Page.navigate',{url:url+'/#/__admin/auditLog'})
  await waitFor("document.querySelectorAll('.al-table-container tbody tr').length===8")
  assert.equal(await evaluate("document.querySelector('.admin-header h1').textContent"),'Audit Log')
  await click('.al-footer nav button:last-child')
  await input('#al-search','CFG-1001')
  assert.equal(await evaluate("document.querySelectorAll('.al-table-container tbody tr').length"),1)
  assert.ok(await evaluate("document.querySelector('.al-footer nav').textContent.includes('Page 1')"))
  await input('#al-search','تعريف')
  assert.ok(await evaluate("document.querySelectorAll('.al-table-container tbody tr').length>0"))
  await input('#al-search','')
  await input('#al-action','UPDATED')
  assert.ok(await evaluate("[...document.querySelectorAll('.al-badge')].every(b=>b.textContent==='Updated')"))
  await input('#al-actor','actor-2')
  assert.ok(await evaluate("[...document.querySelectorAll('tbody tr')].every(r=>r.textContent.includes('Omar Nasser'))"))
  await input('#al-action','');await input('#al-actor','')
  await click('tbody tr')
  await waitFor("document.querySelector('dialog[open]')")
  assert.ok(await evaluate("document.querySelector('dialog').textContent.includes('request-2001')"))
  assert.ok(await evaluate("Math.abs(document.querySelector('dialog').getBoundingClientRect().right-innerWidth)<2"))
  await screenshot('audit-en-desktop-drawer')
  await key('Escape')
  assert.ok(await evaluate("document.activeElement.matches('tbody tr')"))
  await key('Enter');await waitFor("document.querySelector('dialog[open]')")
  await click('dialog button');await input('#al-from','2099-01-01')
  assert.ok(await evaluate("document.querySelector('.al-state').textContent.includes('No matching')"))
  await input('#al-to','2000-01-01')
  assert.ok(await evaluate("document.querySelector('#al-date-error')!==null"))
  await click('.al-state button')
  await screenshot('audit-en-desktop')
  await evaluate("document.querySelector('.admin-language-control button[lang=ar]').click()")
  await waitFor("document.documentElement.lang==='ar'")
  await click('tbody tr')
  assert.ok(await evaluate("Math.abs(document.querySelector('dialog').getBoundingClientRect().left)<2"))
  await screenshot('audit-ar-desktop-drawer');await key('Escape')
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
  await screenshot('audit-ar-mobile')
  assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"))
  await click('tbody tr');await screenshot('audit-ar-mobile-drawer');await key('Escape')
  await evaluate("document.querySelector('.admin-language-control button[lang=en]').click()")
  await waitFor("document.documentElement.lang==='en'")
  await screenshot('audit-en-mobile')
  assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"))
  const revisit=async()=>{await evaluate("document.querySelectorAll('.admin-navigation button')[0].click()");await evaluate("[...document.querySelectorAll('.admin-navigation button')].find(b=>b.textContent.includes('Audit Log')).click()")}
  await evaluate("import('/src/admin/auditLog/auditLogService.js').then(m=>{window.auditLoad=m.auditLogService.load;m.auditLogService.load=async()=>{throw new Error('offline')}})")
  await revisit();await waitFor("document.querySelector('.al-state[role=alert] button')")
  await evaluate("import('/src/admin/auditLog/auditLogService.js').then(m=>m.auditLogService.load=window.auditLoad)")
  await click('.al-state button');await waitFor("document.querySelector('tbody tr')")
  await evaluate("import('/src/admin/auditLog/auditLogService.js').then(m=>m.auditLogService.load=async()=>[])")
  await revisit();await waitFor("document.querySelector('.al-state').textContent.includes('No audit events')")
  await evaluate("import('/src/admin/auditLog/auditLogService.js').then(m=>m.auditLogService.load=()=>m.loadAuditEvents(false))")
  await revisit();await waitFor("document.querySelector('.al-state').textContent.includes('not been configured')")
  assert.deepEqual(errors,[])
  console.log('PASS: route, search both scripts/ID, actor/action/date filters, page reset, pagination, keyboard drawer/focus return, EN/AR drawer edges, desktop/mobile, error/retry/empty/unavailable. Screenshots: '+temporary)
}finally{socket?.close();browser?.kill();await server.close()}
