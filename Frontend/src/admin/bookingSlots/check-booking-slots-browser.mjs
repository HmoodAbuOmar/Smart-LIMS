import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const temporary = mkdtempSync(join(tmpdir(), 'smart-lims-slots-'))
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
    if(/^#bs-(create|edit)-(startTime|endTime)$/.test(selector)) {
      const [hour,minute]=value.split(':')
      await input(`${selector}-hour`,String(Number(hour)%12||12).padStart(2,'0'))
      await input(`${selector}-minute`,minute)
      await input(`${selector}-period`,Number(hour)<12?'AM':'PM')
      return
    }
    await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(element.tagName === 'SELECT' ? HTMLSelectElement.prototype : element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); })()`)
    await pause(35)
  }
  async function key(key, code = key) {
    const virtual = { Escape: 27, Tab: 9, Home: 36, End: 35, ArrowRight: 39, ArrowLeft: 37 }[key]
    const params = { key, code, windowsVirtualKeyCode: virtual, nativeVirtualKeyCode: virtual }
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...params })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...params })
    await pause(40)
  }
  async function screenshot(name) { const result = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(temporary, `${name}.png`), Buffer.from(result.data, 'base64')) }
  await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  const url=`http://127.0.0.1:${server.httpServer.address().port}`
  await send('Emulation.setTimezoneOverride',{timezoneId:'America/Los_Angeles'})
  await send('Page.navigate',{url:`${url}/#/__admin/bookingSlots`})
  await waitFor("document.querySelectorAll('.bs-list tbody tr').length === 3")
  assert.equal(await evaluate("document.querySelector('.admin-header h1').textContent"),'Booking Slots')
  assert.equal(await evaluate("document.querySelector('.admin-navigation [aria-current=true]').textContent.trim()"),'Booking Slots')
  const today=await evaluate("document.querySelector('.bs-dates [aria-current=date]').dataset.date")
  const future=await evaluate(`import('/src/admin/bookingSlots/bookingSlotsModel.js').then(m=>m.shiftDate(${JSON.stringify(today)},2))`)
  const appointments=await evaluate("import('/src/admin/bookingSlots/bookingSlotsService.js').then(m=>m.bookingSlotsService.load()).then(data=>data.appointments)")
  if(!await evaluate(`Boolean(document.querySelector('[data-date="${future}"]'))`))await click('.bs-month-heading button:last-child')
  await click(`[data-date="${future}"]`)
  assert.equal(await evaluate("document.querySelector('#bs-create-date').value"),future)
  assert.ok(await evaluate("document.querySelector('.bs-list .bs-empty') !== null"))
  await input('#bs-create-startTime','10:00');await input('#bs-create-endTime','09:30');await input('#bs-create-capacity','1.5')
  await click('.bs-create button[type=submit]');await waitFor("document.querySelector('dialog')")
  assert.equal(await evaluate("document.querySelector('#bs-dialog-title').textContent"),'Could not create booking slot')
  assert.equal(await evaluate("document.querySelector('#bs-create-capacity').getAttribute('aria-invalid')"),'true')
  assert.equal(await evaluate("document.querySelector('#bs-create-endTime-hour').getAttribute('aria-invalid')"),'true')
  await click('dialog [data-result-action]');assert.equal(await evaluate('document.activeElement.id'),'bs-create-endTime-hour')
  await input('#bs-create-endTime','10:30');await input('#bs-create-capacity','3')
  await evaluate("import('/src/admin/bookingSlots/bookingSlotsService.js').then(({bookingSlotsService:s})=>{const original=s.save;s.save=async()=>{s.save=original;throw new Error('test create failure')}})")
  await click('.bs-create button[type=submit]');await waitFor("document.querySelector('dialog .bs-result-error')")
  assert.equal(await evaluate("document.querySelector('#bs-create-startTime-hour').value"),'10')
  assert.equal(await evaluate("document.querySelector('#bs-create-capacity').value"),'3')
  await click('dialog [data-result-action]');assert.equal(await evaluate("document.activeElement === document.querySelector('.bs-create button[type=submit]')"),true)
  await evaluate("document.querySelector('.bs-create form').requestSubmit();document.querySelector('.bs-create form').requestSubmit()")
  await waitFor("document.querySelectorAll('.bs-list tbody tr').length === 1 && !document.querySelector('.bs-today-action').disabled")
  assert.equal(await evaluate("document.querySelector('#bs-dialog-title').textContent"),'Booking slot created')
  assert.equal(await evaluate("document.querySelector('.bs-result-time').textContent"),'10:00 AM – 10:30 AM')
  assert.equal(await evaluate("document.querySelector('dialog time').dateTime"),future)
  await screenshot('create-success-en');await click('dialog [data-result-action]')
  assert.equal(await evaluate("document.querySelector('.bs-notice').textContent"),'Slot created')
  assert.ok(await evaluate(`document.querySelector('[data-date="${future}"] i') !== null`))
  await input('#bs-create-startTime','10:15');await input('#bs-create-endTime','10:45');await input('#bs-create-capacity','2');await click('.bs-create button[type=submit]')
  await waitFor("document.querySelector('.bs-create [role=alert]')");await waitFor("document.querySelector('dialog .bs-result-error')");await click('dialog [data-result-action]')
  await input('#bs-create-startTime','10:30');await input('#bs-create-endTime','11:00');await click('.bs-create button[type=submit]')
  await waitFor("document.querySelectorAll('.bs-list tbody tr').length === 2 && !document.querySelector('.bs-today-action').disabled")
  await click('dialog [data-result-action]')
  await input('#bs-create-capacity','9');await click('.bs-create .bs-form-actions button:first-child');assert.equal(await evaluate("document.querySelector('#bs-create-capacity').value"),'')
  await click('.bs-list tbody tr:first-child .bs-actions button:first-child');assert.equal(await evaluate("document.querySelector('#bs-edit-startTime-hour').disabled"),false)
  await input('#bs-edit-startTime','12:00');await input('#bs-edit-endTime','12:30');await click('dialog button[type=submit]');await waitFor("!document.querySelector('dialog')")
  await click('.bs-today-action')
  await click('[data-slot=slot-1] .bs-actions button:first-child')
  for(const key of ['date','startTime','endTime'])assert.equal(await evaluate(`document.querySelector('#bs-edit-${key}${key==='date'?'':'-hour'}').disabled`),true)
  await input('#bs-edit-capacity','1');await click('dialog button[type=submit]');await waitFor("document.querySelector('#bs-edit-capacity-error')")
  await input('#bs-edit-capacity','4')
  await evaluate("import('/src/admin/bookingSlots/bookingSlotsService.js').then(({bookingSlotsService:s})=>{const original=s.save;s.save=async()=>{s.save=original;throw new Error('test save failure')}})")
  await click('dialog button[type=submit]');await waitFor("document.querySelector('dialog .bs-error')")
  assert.equal(await evaluate("document.querySelector('#bs-edit-capacity').value"),'4')
  await input('#bs-edit-capacity','2');await click('dialog button[type=submit]');await waitFor("!document.querySelector('dialog')")
  assert.ok(await evaluate("document.querySelector('[data-slot=slot-1] .bs-badge').classList.contains('bs-full')"))
  await click('[data-slot=slot-1] .bs-actions button:last-child');await key('Escape');assert.ok(await evaluate("!document.querySelector('dialog')"))
  await click('[data-slot=slot-1] .bs-actions button:last-child');await click('dialog .bs-primary')
  await waitFor("document.querySelector('[data-slot=slot-1] .bs-badge').classList.contains('bs-inactive') && !document.querySelector('dialog')")
  assert.deepEqual(await evaluate("import('/src/admin/bookingSlots/bookingSlotsService.js').then(m=>m.bookingSlotsService.load()).then(data=>data.appointments)"),appointments)
  assert.equal(await evaluate("document.querySelector('[data-slot=slot-1] [role=meter]').getAttribute('aria-valuenow')"),'2')
  await click('[data-slot=slot-1] .bs-actions button:last-child');await waitFor("document.querySelector('[data-slot=slot-1] .bs-badge').classList.contains('bs-full')")
  assert.equal(await evaluate("document.querySelector('.bs-notice').textContent"),'Changes saved')
  await click('.bs-month-heading button:last-child');await click('.bs-today-action');assert.equal(await evaluate("document.querySelector('.bs-selected').dataset.date"),today)
  await evaluate("document.querySelector('.bs-selected').focus()");await key('ArrowRight');assert.notEqual(await evaluate("document.querySelector('.bs-selected').dataset.date"),today);await click('.bs-today-action')
  const additionalDate=await evaluate(`import('/src/admin/bookingSlots/bookingSlotsModel.js').then(m=>m.shiftDate(${JSON.stringify(today)},5))`)
  for(const [start,end,label] of [['00:00','00:05','12:00 AM – 12:05 AM'],['12:00','12:05','12:00 PM – 12:05 PM'],['19:04','19:09','07:04 PM – 07:09 PM']]) {
    await input('#bs-create-date',additionalDate);await input('#bs-create-startTime',start);await input('#bs-create-endTime',end);await input('#bs-create-capacity','3')
    await click('.bs-create button[type=submit]');await waitFor("document.querySelector('dialog .bs-result-success')")
    assert.equal(await evaluate("document.querySelector('.bs-result-time').textContent"),label)
    assert.ok(await evaluate(`import('/src/admin/bookingSlots/bookingSlotsService.js').then(m=>m.bookingSlotsService.load()).then(data=>data.slots.some(slot=>slot.date===${JSON.stringify(additionalDate)}&&slot.startTime===${JSON.stringify(start)}&&slot.endTime===${JSON.stringify(end)}))`))
    await click('dialog [data-result-action]')
  }
  await click('.admin-language-control button[lang=ar]');await click('.bs-create button[type=submit]');await waitFor("document.querySelector('dialog .bs-result-error')")
  assert.equal(await evaluate("document.querySelector('#bs-dialog-title').textContent"),'تعذّر إضافة فترة الحجز')
  await screenshot('create-error-ar');await click('dialog [data-result-action]')
  assert.equal(await evaluate('document.activeElement.id'),'bs-create-startTime-hour')
  assert.deepEqual(await evaluate("[...document.querySelector('#bs-create-startTime-period').options].map(o=>o.textContent)"),['ص','م'])
  await input('#bs-create-startTime','19:20');await input('#bs-create-endTime','19:25');await input('#bs-create-capacity','3');await click('.bs-create button[type=submit]')
  await waitFor("document.querySelector('dialog .bs-result-success')")
  assert.equal(await evaluate("document.querySelector('#bs-dialog-title').textContent"),'تمت إضافة فترة الحجز')
  assert.ok(await evaluate("document.querySelector('.bs-result-time').textContent.includes('م')"));await screenshot('create-success-ar');await key('Tab');await key('Escape')
  await click('.admin-language-control button[lang=en]');await click('.bs-today-action')
  for(const language of ['en','ar']){
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
    if(language==='ar')await click('.admin-language-control button[lang=ar]')
    for(const width of [1440,1024,768,390,320]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<761});await pause(100)
      assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'),false,`${language}/${width}`)
      assert.equal(await evaluate("document.querySelectorAll('.bs-list tbody tr:first-child td').length"),6)
      assert.ok(await evaluate("(()=>{const box=document.querySelector('.bs-list').getBoundingClientRect();return [...document.querySelectorAll('.bs-actions button')].every(button=>{const r=button.getBoundingClientRect();return r.left>=box.left&&r.right<=box.right})})()"))
      if(width<761)assert.equal(await evaluate("getComputedStyle(document.querySelector('.bs-list tbody tr:first-child .bs-cell-label')).display"),'block')
      if(width===1440)assert.equal(await evaluate("document.querySelector('.bs-calendar').getBoundingClientRect().left < document.querySelector('.bs-list').getBoundingClientRect().left"),language==='en')
      await evaluate('window.scrollTo(0,0)');await screenshot(`slots-${language}-${width}`)
    }
  }
  assert.deepEqual(errors,[])
  console.log(`PASS: direct route/sidebar, date selection/month/Today/keyboard, create, validation, overlap/adjacency, unbooked time editing, booked time lock/capacity floor, failed save retry, cancel, deactivation/activation with unchanged appointments, occupancy, EN/AR and desktop/mobile layouts, no API calls. Screenshots: ${temporary}`)
}finally{socket?.close();browser?.kill();await server.close()}