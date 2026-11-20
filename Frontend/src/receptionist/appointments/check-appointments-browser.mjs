import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, preview } from 'vite'
import react from '@vitejs/plugin-react'

const temporary = mkdtempSync(join(tmpdir(), 'smart-lims-appointments-'))
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

  async function input(selector, value) {
    await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`)
    await pause(50)
  }
  const base = `http://127.0.0.1:${server.httpServer.address().port}`
  await send('Page.navigate', { url: `${base}/#/__receptionist/appointments` })
  await waitFor("document.querySelectorAll('.ra-table tbody tr').length===7")
  await evaluate("import('/src/receptionist/appointments/appointmentsService.js').then(m=>{window.originalOrders=m.appointmentsService.orders;m.appointmentsService.orders=async()=>{await new Promise(r=>setTimeout(r,350));return []}})")
  await click('.ra-create');await waitFor("document.querySelector('#ra-order')?.selectedOptions[0].textContent.includes('Loading eligible orders')")
  assert.equal(await evaluate("document.querySelector('#ra-order').disabled"),true)
  await waitFor("document.querySelector('#ra-order')?.selectedOptions[0].textContent==='No orders available'")
  assert.equal(await evaluate("document.querySelector('#ra-order').options.length"),1)
  assert.equal(await evaluate("document.querySelector('#ra-order').disabled"),true)
  await key('Escape')
  await evaluate("import('/src/receptionist/appointments/appointmentsService.js').then(m=>m.appointmentsService.orders=async()=>{throw new Error('offline')})")
  await click('.ra-create');await waitFor("document.querySelector('.ra-orders-retry')")
  assert.ok(await evaluate("document.querySelector('#ra-order').selectedOptions[0].textContent.includes('Could not load eligible orders')"))
  await evaluate("import('/src/receptionist/appointments/appointmentsService.js').then(m=>m.appointmentsService.orders=window.originalOrders)")
  await click('.ra-orders-retry');await waitFor("document.querySelector('#ra-order option[value=\"preview-pending-1\"]')");await key('Escape')
  const date = await evaluate("document.querySelector('#ra-day').value")
  assert.equal(date,await evaluate("import('/src/receptionist/today/todayModel.js').then(m=>m.todayDate())"))
  const tomorrow = await evaluate("(()=>{const d=new Date(document.querySelector('#ra-day').value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)})()")
  await input('#ra-status','BOOKED');await waitFor("document.querySelectorAll('.ra-table tbody tr').length===3")
  await input('#ra-status','CHECKED_IN');await waitFor("document.querySelectorAll('.ra-table tbody tr').length===1")
  await input('#ra-status','all');await waitFor("document.querySelectorAll('.ra-table tbody tr').length===7")
  const first = '[data-appointment-id="r01-appointment-1"]'
  await click(`${first} .ra-arrive`);await waitFor(`document.querySelector('${first} .ra-CHECKED_IN')`)
  await evaluate("location.hash='/__receptionist/today'");await waitFor("document.querySelector('.r01-table-container')")
  assert.ok(await evaluate("document.querySelector('[data-appointment-id=\"r01-appointment-1\"] .r01-CHECKED_IN')!==null"))
  await click('[data-appointment-id="r01-appointment-4"] .r01-check-in');await waitFor("document.querySelector('[data-appointment-id=\"r01-appointment-4\"] .r01-CHECKED_IN')")
  await evaluate("location.hash='/__receptionist/appointments'");await waitFor("document.querySelector('[data-appointment-id=\"r01-appointment-4\"] .ra-CHECKED_IN')")
  await click(`${first} .ra-order`);await waitFor("document.querySelector('.ro-context')")
  assert.ok(await evaluate("location.hash.includes('orderId=r01-order-1')"))
  assert.ok(await evaluate("document.querySelector('.ro-context').textContent.includes('Lina Haddad')"))
  assert.ok(await evaluate("!document.querySelector('.ro-balances').textContent.includes('NaN')"))
  // Create the pending order through the existing Walk-in flow.
  await evaluate("location.hash='/__receptionist/walk-in'");await waitFor("document.querySelector('.r05-select-patient')")
  await input('#r02-search','P-1001');await waitFor("document.querySelectorAll('.r05-select-patient').length===1")
  await click('.r05-select-patient');await waitFor("document.querySelector('.r04-create')");await click('.r04-create')
  await input('.r05-search input','CBC');await click('.r05-test-list button');await click('.r05-summary button[type=submit]')
  await waitFor("location.hash.includes('orderId=r05-order-1') && document.querySelector('.ro-context')")
  await click('#ro-tab-appointment')
  assert.equal(await evaluate("document.querySelector('.ro-create-booking').disabled"),false)
  await click('.ro-create-booking')
  await waitFor("document.querySelector('#ra-order option[value=\"r05-order-1\"]')")
  assert.equal(await evaluate("document.querySelector('#ra-order').value"),'r05-order-1')
  assert.equal(await evaluate("document.querySelector('#ra-order').disabled"),false)
  assert.equal(await evaluate("document.querySelector('#ra-order option[value=\"r05-order-1\"]').textContent"),'ORD-000001 — Lina Nasser')
  await evaluate("import('/src/i18n.js').then(m=>m.default.changeLanguage('ar'))")
  assert.equal(await evaluate("document.querySelector('#ra-order option[value=\"r05-order-1\"]').textContent"),'ORD-000001 — لينا ناصر')
  assert.equal(await evaluate("document.querySelector('#ra-order').value"),'r05-order-1')
  await screenshot('eligible-order-ar')
  await evaluate("import('/src/i18n.js').then(m=>m.default.changeLanguage('en'))")
  await input('#ra-order','r05-order-1');await input('#ra-slot-date',tomorrow)
  await waitFor("document.querySelectorAll('.ra-slots button').length===9")
  const lastSpace = await evaluate("import('/src/receptionist/appointments/appointmentsService.js').then(m=>m.appointmentsService.slots("+JSON.stringify(tomorrow)+")).then(slots=>slots.find(s=>s.capacity===1).id)")
  await click(`[data-slot-id="${lastSpace}"]`)
  // Another receptionist takes the final place after the editor loaded.
  await evaluate("Promise.all([import('/src/receptionist/walk-in/walkInService.js'),import('/src/receptionist/appointments/appointmentsService.js')]).then(async([w,a])=>{const t=(await w.walkInService.listTests())[0];const order=await w.walkInService.create({patientId:'demo-patient-2',testIds:[t.id],quotedTests:[t],source:'WALK_IN',notes:'',idempotencyKey:crypto.randomUUID()});await a.appointmentsService.book({orderId:order.id,slotId:"+JSON.stringify(lastSpace)+",typeId:'r07-collection',idempotencyKey:crypto.randomUUID()})})")
  await click('.ra-dialog button[type=submit]');await waitFor("document.querySelector('.ra-error')?.textContent.includes('full')")
  assert.equal(await evaluate("document.querySelector('#ra-order').value"),'r05-order-1')
  await waitFor("document.querySelector('.ra-dialog form').getAttribute('aria-busy')==='false'")
  await waitFor("document.querySelector('[data-slot-id="+JSON.stringify(lastSpace)+"]')?.disabled===true")
  assert.equal(await evaluate("document.querySelector('#ra-order option[value=\"r05-order-2\"]')"),null)
  const other = await evaluate("document.querySelector('.ra-slots button:not(:disabled)').dataset.slotId")
  await click(`[data-slot-id="${other}"]`);await waitFor("!document.querySelector('.ra-dialog button[type=submit]').disabled");await click('.ra-dialog button[type=submit]')
  await waitFor("!document.querySelector('dialog[open]') && document.querySelector('#ra-day').value==="+JSON.stringify(tomorrow))
  await waitFor("document.querySelectorAll('.ra-table tbody tr').length===2")
  const appointmentId = await evaluate("import('/src/receptionist/appointments/appointmentsService.js').then(m=>m.appointmentsService.load("+JSON.stringify(tomorrow)+")).then(rows=>rows.find(r=>r.orderId==='r05-order-1').id)")
  const row = `[data-appointment-id="${appointmentId}"]`
  const beforeTimes = await evaluate("import('/src/receptionist/appointments/appointmentsService.js').then(m=>m.appointmentsService.slots("+JSON.stringify(tomorrow)+")).then(slots=>JSON.stringify(slots.map(({id,startsAt,endsAt})=>({id,startsAt,endsAt}))))")
  await click(`${row} .ra-move`);await waitFor("document.querySelector('.ra-slots button:not(:disabled)')")
  const movedTo = await evaluate("document.querySelector('.ra-slots button:not(:disabled)').dataset.slotId")
  await click(`[data-slot-id="${movedTo}"]`);await click('.ra-dialog button[type=submit]');await waitFor("!document.querySelector('dialog[open]')")
  const afterTimes = await evaluate("import('/src/receptionist/appointments/appointmentsService.js').then(m=>m.appointmentsService.slots("+JSON.stringify(tomorrow)+")).then(slots=>JSON.stringify(slots.map(({id,startsAt,endsAt})=>({id,startsAt,endsAt}))))")
  assert.equal(afterTimes,beforeTimes)
  await click(`${row} .ra-cancel`);await click('.ra-dialog button[type=submit]')
  assert.ok(await evaluate("document.querySelector('.ra-error').textContent.includes('reason')"))
  await input('#ra-reason','Patient requested cancellation');await click('.ra-dialog button[type=submit]')
  await waitFor(`document.querySelector('${row} .ra-CANCELLED')`)
  assert.equal(await evaluate("import('/src/receptionist/walk-in/walkInService.js').then(m=>m.walkInService.getOrder('r05-order-1')).then(order=>order.status)"),'PENDING')
  // Book again, then cancel via Order Details and verify the appointment cascade.
  await click('.ra-create');await waitFor("document.querySelector('#ra-order option[value=\"r05-order-1\"]')")
  await input('#ra-order','r05-order-1');await waitFor("document.querySelector('.ra-slots button:not(:disabled)')")
  await click('.ra-slots button:not(:disabled)');await click('.ra-dialog button[type=submit]');await waitFor("!document.querySelector('dialog[open]')")
  await evaluate("location.hash='/__receptionist/orders?orderId=r05-order-1'");await waitFor("document.querySelector('#ro-tab-details')")
  await click('#ro-tab-details');await click('.ro-cancel-order summary');await input('#ro-cancel-reason','Order cancelled by request');await click('.ro-cancel-order button[type=submit]')
  await waitFor("document.querySelector('.ro-context .ro-CANCELLED')")
  await evaluate("location.hash='/__receptionist/appointments'");await waitFor("document.querySelector('#ra-day')");await input('#ra-day',tomorrow)
  await waitFor("document.querySelectorAll('.ra-table tbody tr').length===3")
  assert.equal(await evaluate("document.querySelectorAll('.ra-CANCELLED').length"),2)
  assert.deepEqual(await evaluate("import('/src/receptionist/appointments/appointmentsService.js').then(m=>m.appointmentsService.orders()).then(orders=>orders.map(order=>order.id).sort())"),['preview-pending-1','preview-pending-2'])
  for(const language of ['en','ar']) {
    await evaluate("import('/src/i18n.js').then(m=>m.default.changeLanguage("+JSON.stringify(language)+"))")
    for(const width of [1440,390]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:1000,deviceScaleFactor:1,mobile:width===390})
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'))
      const point=await evaluate("(()=>{const r=document.querySelector('.ra-create').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point})
      assert.equal(await evaluate("getComputedStyle(document.querySelector('.ra-create')).color"),'rgb(255, 255, 255)')
      assert.equal(await evaluate("getComputedStyle(document.querySelector('.ra-create')).backgroundColor"),'rgb(18, 100, 95)')
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1});await evaluate("document.querySelector('#ra-status').focus()");await key('Tab')
      assert.ok(await evaluate("document.activeElement.matches('button') && getComputedStyle(document.activeElement).outlineStyle==='solid'"))
      await screenshot('appointments-'+language+'-'+width)
      await click('.ra-create');await waitFor("document.querySelector('.ra-slots')");await screenshot('booking-editor-'+language+'-'+width);await key('Escape')
    }
  }
  await evaluate("location.hash='/__receptionist/orders?orderId=r05-order-2'");await waitFor("document.querySelector('#ro-tab-appointment')");await click('#ro-tab-appointment')
  assert.equal(await evaluate("document.querySelector('.ro-create-booking').disabled"),true)
  await evaluate("import('/src/receptionist/walk-in/walkInService.js').then(async m=>{const t=(await m.walkInService.listTests())[0];await m.walkInService.create({patientId:'demo-patient-2',testIds:[t.id],quotedTests:[t],source:'WALK_IN',notes:'',idempotencyKey:crypto.randomUUID()})})")
  await evaluate("location.hash='/__receptionist/appointments?orderId=r05-order-2'");await waitFor("document.querySelector('#ra-order option[value=\"r05-order-3\"]')")
  assert.equal(await evaluate("document.querySelector('#ra-order').value"),'')
  assert.equal(await evaluate("document.querySelector('#ra-order option[value=\"r05-order-2\"]')"),null)
  assert.equal(await evaluate("document.querySelector('#ra-order').disabled"),false)
  await key('Escape')
  production = await preview({configFile:false,root:fileURLToPath(new URL('../../../',import.meta.url)),preview:{host:'127.0.0.1',port:0}})
  await send('Page.navigate',{url:`http://127.0.0.1:${production.httpServer.address().port}/#/receptionist/appointments`})
  await waitFor("document.querySelector('.r01-access [role=alert]')")
  assert.equal(await evaluate("document.querySelector('.ra-page')"),null)
  assert.deepEqual(errors,[])
  console.log(`PASS: date/status filters, two-way Today check-in synchronization, linked-order IDs, Walk-in entry, stale-full slot rejection, retained draft, booking, reschedule without slot edits, cancellation reason/order preservation, order-cancel cascade, EN/AR desktop/mobile hover/focus, dialog Escape and production isolation. Screenshots: ${temporary}`)
} finally { socket?.close();browser?.kill();await server.close();if(production)await new Promise(resolve=>production.httpServer.close(resolve)) }
