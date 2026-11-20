import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const temporary = mkdtempSync(join(tmpdir(), 'smart-lims-appointments-'))
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

  async function input(selector, value) {
    await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`)
    await pause(50)
  }
  const base = `http://127.0.0.1:${server.httpServer.address().port}`


  await send('Page.navigate', { url: base + '/#/__receptionist/appointments' })
  await waitFor("document.querySelector('.ra-create')")
  const date = await evaluate("import('/src/receptionist/today/todayModel.js').then(m=>{const d=new Date(m.todayDate()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)})")
  for (const [index,language] of ['en','ar'].entries()) {
    await evaluate("import('/src/i18n.js').then(m=>m.default.changeLanguage("+JSON.stringify(language)+"))")
    await click('.ra-create')
    const id = 'preview-pending-'+(index+1)
    await waitFor("document.querySelector('#ra-order option[value='+"+JSON.stringify(id)+"+']')")
    assert.equal(await evaluate("document.querySelector('#ra-order').disabled"),false)
    assert.equal(await evaluate("document.querySelector('#ra-order-state')"),null)
    assert.equal(await evaluate("document.querySelector('.ra-dialog a')"),null)
    const labels=await evaluate("Array.from(document.querySelector('#ra-order').options).slice(1).map(o=>o.textContent)")
    if(index===0) assert.deepEqual(labels,['ORD-007001 \u2014 Lina Nasser','ORD-007002 \u2014 Omar Khalil'])
    else assert.equal(labels.length,1)
    const order = await evaluate("import('/src/receptionist/walk-in/walkInService.js').then(m=>m.walkInService.getOrder("+JSON.stringify(id)+"))")
    assert.equal(order.status,'PENDING');assert.ok(order.items.length);assert.equal(order.appointments.length,0)
    await click('#ra-order');await input('#ra-order',id)
    await input('#ra-slot-date',date)
    await waitFor("document.querySelector('.ra-slots button:not(:disabled)')")
    await click('.ra-slots button:not(:disabled)');await waitFor("!document.querySelector('.ra-dialog button[type=submit]').disabled")
    await screenshot('preview-orders-'+language)
    await click('.ra-dialog button[type=submit]');await waitFor("!document.querySelector('dialog[open]')")
    const rows=await evaluate("import('/src/receptionist/appointments/appointmentsService.js').then(m=>m.appointmentsService.load("+JSON.stringify(date)+"))")
    assert.equal(rows.filter(r=>r.orderId===id&&r.status==='BOOKED').length,1)
  }

  for (const [index,language] of ['en','ar'].entries()) {
    await evaluate("import('/src/i18n.js').then(m=>m.default.changeLanguage("+JSON.stringify(language)+"))")
    await click('.ra-create');await waitFor("document.querySelector('.ra-create-order')")
    assert.equal(await evaluate("document.querySelector('#ra-order').disabled"),true)
    assert.equal(await evaluate("document.querySelector('.ra-dialog button[type=submit]')"),null)
    assert.equal(await evaluate("document.querySelector('.ra-dialog a')"),null)
    assert.equal(await evaluate("document.querySelector('.ra-create-order').disabled"),false)
    await key('Escape');await waitFor("!document.querySelector('dialog[open]')");await click('.ra-create');await waitFor("document.querySelector('.ra-create-order')")
    await input('#ra-slot-date',date)
    const before=await evaluate("import('/src/receptionist/today/todayService.js').then(m=>m.todayService.load()).then(r=>JSON.stringify(r))")
    await screenshot('empty-footer-'+language)
    await click('.ra-create-order');await waitFor("document.querySelector('.r05-select-patient')")
    assert.ok(await evaluate("location.hash.includes('purpose=scheduled') && location.hash.includes('bookingDate='+"+JSON.stringify(date)+")"))
    await input('#r02-search','P-100'+(index+3));await waitFor("document.querySelectorAll('.r05-select-patient').length===1")
    await click('.r05-select-patient');await waitFor("document.querySelector('.r04-create')");await click('.r04-create')
    await input('.r05-search input','CBC');await click('.r05-test-list button');await click('.r05-summary button[type=submit]')
    await waitFor("document.querySelector('#ra-order')?.value.startsWith('r05-order-')")
    const id=await evaluate("document.querySelector('#ra-order').value")
    assert.equal(await evaluate("document.querySelector('#ra-slot-date').value"),date)
    assert.equal(await evaluate("document.querySelector('#ra-day').value"),date)
    assert.equal(await evaluate("document.querySelector('.ra-create-order')"),null)
    assert.equal(await evaluate("document.querySelector('.ra-dialog button[type=submit]').disabled"),true)
    assert.equal(await evaluate("import('/src/receptionist/today/todayService.js').then(m=>m.todayService.load()).then(r=>JSON.stringify(r))"),before)
    const order=await evaluate("import('/src/receptionist/walk-in/walkInService.js').then(m=>m.walkInService.getOrder("+JSON.stringify(id)+"))")
    assert.equal(order.status,'PENDING');assert.equal(order.source,undefined);assert.equal(order.appointments.length,0)
    await waitFor("document.querySelector('.ra-slots button:not(:disabled)')")
    await click('.ra-slots button:not(:disabled)');await waitFor("!document.querySelector('.ra-dialog button[type=submit]').disabled")
    await screenshot('returned-booking-'+language)
    await click('.ra-dialog button[type=submit]');await waitFor("!document.querySelector('dialog[open]')")
    assert.equal(await evaluate("import('/src/receptionist/appointments/appointmentsService.js').then(m=>m.appointmentsService.load("+JSON.stringify(date)+")).then(rows=>rows.filter(r=>r.orderId==="+JSON.stringify(id)+"&&r.status==='BOOKED').length)"),1)
  }
  assert.deepEqual(errors,[])
  console.log('PASS: fresh preview has two pending orders with items and no appointments; enabled picker, order/patient labels, EN/AR selection and booking, booked-order exclusion, empty-footer action, scheduled-order reuse, no premature appointment, preserved date and preselected order, confirmation gated by slot. Screenshots: '+temporary)
} finally { socket?.close();browser?.kill();await server.close() }
