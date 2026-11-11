import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, preview } from 'vite'
import react from '@vitejs/plugin-react'

const temporary = mkdtempSync(join(tmpdir(), 'smart-lims-r02-'))
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
  await send('Page.navigate', { url: `${base}/#/__receptionist/patients` })
  await waitFor("document.querySelectorAll('.r02-patients tbody tr').length===8")
  assert.equal(await evaluate("document.querySelector('.ws-nav [aria-current=page]').textContent"), 'Patients')
  assert.ok(await evaluate("document.querySelector('.r02-pagination')?.textContent.includes('Showing 1–8 of 14')"))
  await click('.r02-pagination nav button:last-child'); await waitFor("document.querySelectorAll('.r02-patients tbody tr').length===6")
  assert.ok(await evaluate("document.querySelector('.r02-pagination')?.textContent.includes('Showing 9–14 of 14')"))
  for (const [search, count] of [['Lina', 2], ['لينا', 2], ['P-1001', 1], ['0599000111', 3]]) {
    await input('#r02-search', search); await waitFor(`document.querySelectorAll('.r02-patients tbody tr').length===${count}`)
    assert.ok(await evaluate("document.querySelector('.r02-pagination')?.textContent.includes('Showing 1–')"))
  }
  await input('#r02-search', 'no match here'); await waitFor("document.querySelector('.r02-state')?.textContent.includes('No patients found')")
  await click('.r02-state button'); await waitFor("document.querySelectorAll('.r02-patients tbody tr').length===8")
  assert.ok(await evaluate("!!document.querySelector('.r02-linked') && !!document.querySelector('.r02-unlinked')"))
  await screenshot('patients-en-desktop')
  await click('.r02-add'); await waitFor("document.querySelector('dialog[open]')")
  assert.equal(await evaluate('document.activeElement.name'), 'fullName')
  assert.ok(await evaluate("Math.abs(document.querySelector('dialog').getBoundingClientRect().right-document.documentElement.clientWidth)<2"))
  await input('#r02-fullName', 'Discard me'); await key('Escape')
  assert.ok(await evaluate("document.activeElement.matches('.r02-add')"))
  await input('#r02-search', 'Lina'); await waitFor("document.querySelectorAll('tbody tr').length===2")
  await click('.r02-add')
  assert.equal(await evaluate("document.querySelector('#r02-fullName').value"), '')
  assert.equal(await evaluate("document.querySelectorAll('input[name=gender]').length"), 3)
  assert.equal(await evaluate("document.querySelectorAll('input[name=gender]:checked').length"), 0)
  assert.equal(await evaluate("document.querySelector('#r02-gender-UNKNOWN').disabled"), false)
  await input('#r02-dateOfBirth', '29/02/2023')
  await click('dialog button[type=submit]')
  assert.equal(await evaluate("document.querySelector('#r02-dateOfBirth').getAttribute('aria-invalid')"), 'true')
  await input('#r02-dateOfBirth', '')
  await click('.r02-calendar-toggle')
  await input('.r02-calendar-heading input', '2000')
  await input('.r02-calendar-heading select', '1')
  await evaluate("document.querySelector('.r02-calendar-heading input').focus()")
  await key('Enter')
  assert.equal(await evaluate('document.activeElement.dataset.date'), '2000-02-01')
  await key('ArrowRight')
  assert.equal(await evaluate('document.activeElement.dataset.date'), '2000-02-02')
  await screenshot('patients-en-calendar')
  await click('[data-date="2000-02-29"]')
  assert.equal(await evaluate("document.querySelector('#r02-dateOfBirth').value"), '29/02/2000')
  assert.equal(await evaluate("document.activeElement.name"), 'dateOfBirth')
  await click('.r02-calendar-toggle'); await key('Escape')
  assert.ok(await evaluate("!!document.querySelector('dialog[open]') && !document.querySelector('#r02-birth-calendar')"))
  await input('#r02-dateOfBirth', '')
  await click('dialog button[type=submit]')
  assert.equal(await evaluate("document.querySelectorAll('dialog [aria-invalid=true]').length"), 4)
  await input('#r02-fullName', '   '); await input('#r02-dateOfBirth', '2099-01-01'); await click('#r02-gender-UNKNOWN'); await input('#r02-phoneNumber', 'invalid')
  await click('dialog button[type=submit]')
  assert.ok(await evaluate("document.querySelector('dialog').textContent.includes('future') && document.querySelector('dialog').textContent.includes('7–15')"))
  await input('#r02-fullName', 'Lina New Patient'); await input('#r02-dateOfBirth', '02/01/2000'); await input('#r02-phoneNumber', '0599000111'); await input('#r02-address', 'Test address')
  await screenshot('patients-en-drawer')
  await evaluate("import('/src/receptionist/patients/patientsService.js').then(m=>{window.r02Create=m.receptionistPatientsService.create;window.r02Writes=0;m.receptionistPatientsService.create=async(payload)=>{window.r02Writes++;window.r02Payload=payload;await new Promise(r=>setTimeout(r,350));const e=new Error('offline');e.fields={phoneNumber:'phoneInvalid'};throw e}})")
  await click('dialog button[type=submit]')
  assert.equal(await evaluate("document.querySelector('dialog button[type=submit]').disabled"), true)
  await evaluate("document.querySelector('dialog button[type=submit]').click()")
  await waitFor("!document.querySelector('dialog button[type=submit]').disabled")
  assert.equal(await evaluate('window.r02Writes'), 1)
  assert.equal(await evaluate('window.r02Payload.dateOfBirth'), '2000-01-02')
  assert.equal(await evaluate('window.r02Payload.gender'), 'UNKNOWN')
  assert.equal(await evaluate("document.querySelector('#r02-fullName').value"), 'Lina New Patient')
  assert.equal(await evaluate("document.querySelector('#r02-phoneNumber').value"), '0599000111')
  await waitFor("document.activeElement.name==='phoneNumber'")
  assert.ok(await evaluate("document.querySelector('dialog').textContent.includes('Could not save')"))
  await evaluate("import('/src/receptionist/patients/patientsService.js').then(m=>m.receptionistPatientsService.create=window.r02Create)")
  await click('dialog button[type=submit]'); await waitFor("!document.querySelector('dialog[open]') && document.querySelectorAll('tbody tr').length===3")
  assert.equal(await evaluate("document.querySelector('#r02-search').value"), 'Lina')
  assert.ok(await evaluate("document.querySelector('.r02-toast').textContent.includes('PAT-009001')"))
  assert.ok(await evaluate("!!document.querySelector('tbody tr .r02-unlinked')"))
  assert.ok(await evaluate("document.activeElement.matches('.r02-add')"))
  await input('#r02-search', ''); await waitFor("document.querySelector('.r02-pagination')?.textContent.includes('of 15')")
  await click('.ws-language button[lang=ar]'); await waitFor("document.documentElement.dir==='rtl'")
  await input('#r02-search', 'لينا'); await waitFor("document.querySelectorAll('tbody tr').length===2")
  await screenshot('patients-ar-desktop')
  await click('.r02-add')
  assert.ok(await evaluate("Math.abs(document.querySelector('dialog').getBoundingClientRect().left)<2"))
  await input('#r02-fullName', 'اسم محفوظ')
  await evaluate("import('/src/i18n.js').then(m=>m.default.changeLanguage('en'))")
  assert.equal(await evaluate("document.querySelector('#r02-fullName').value"), 'اسم محفوظ')
  await evaluate("import('/src/i18n.js').then(m=>m.default.changeLanguage('ar'))")
  await click('#r02-gender-FEMALE')
  await input('#r02-dateOfBirth', '\u0662\u0669/\u0660\u0662/\u0662\u0660\u0660\u0660')
  assert.equal(await evaluate("document.querySelector('#r02-dateOfBirth').value"), '29/02/2000')
  await click('.r02-calendar-toggle')
  await input('.r02-calendar-heading input', '\u0662\u0660\u0660\u0660')
  await input('.r02-calendar-heading select', '1')
  await screenshot('patients-ar-calendar')
  await click('[data-date="2000-02-29"]')
  assert.equal(await evaluate("document.querySelector('#r02-gender-FEMALE').checked"), true)
  await screenshot('patients-ar-drawer'); await key('Escape')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await screenshot('patients-ar-mobile')
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'))
  await click('.r02-add')
  assert.equal(await evaluate("document.querySelector('dialog').getBoundingClientRect().width"), 390)
  await click('.r02-calendar-toggle')
  await screenshot('patients-ar-mobile-calendar')
  assert.ok(await evaluate("document.querySelector('dialog').scrollWidth<=document.querySelector('dialog').clientWidth"))
  await key('Escape')
  await evaluate("document.querySelector('dialog').scrollTop=10000")
  assert.ok(await evaluate("document.querySelector('dialog footer').getBoundingClientRect().bottom<=innerHeight+1"))
  await screenshot('patients-ar-mobile-drawer'); await key('Escape')
  await click('.r01-menu-button'); await click('.ws-language button[lang=en]'); await key('Escape')
  await screenshot('patients-en-mobile')
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'))
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  async function revisit() {
    await click('.ws-nav button:first-child'); await waitFor("document.querySelector('.r01-heading')")
    await click('.ws-nav button:nth-child(2)'); await waitFor("document.querySelector('.r02-heading')")
  }
  await evaluate("import('/src/receptionist/patients/patientsService.js').then(m=>{window.r02List=m.receptionistPatientsService.list;m.receptionistPatientsService.list=async()=>{await new Promise(r=>setTimeout(r,350));throw new Error('offline')}})")
  await revisit(); await waitFor("document.querySelector('.r02-state[role=status]')"); await waitFor("document.querySelector('.r02-state[role=alert] button')")
  await evaluate("import('/src/receptionist/patients/patientsService.js').then(m=>m.receptionistPatientsService.list=window.r02List)")
  await click('.r02-state button'); await waitFor("document.querySelectorAll('.r02-patients tbody tr').length===8")
  await evaluate("import('/src/receptionist/patients/patientsService.js').then(m=>m.receptionistPatientsService.list=async()=>({content:[],totalElements:0,totalPages:0}))")
  await revisit(); await waitFor("document.querySelector('.r02-state')?.textContent.includes('No patients yet')")
  await evaluate("import('/src/receptionist/patients/patientsService.js').then(m=>m.receptionistPatientsService.list=async(...args)=>{const p=await window.r02List(...args);delete p.content[0].linkedAccountId;return p})")
  await revisit(); await waitFor("document.querySelector('.r02-unavailable')")
  production = await preview({ configFile: false, root: fileURLToPath(new URL('../../../', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } })
  const productionBase = `http://127.0.0.1:${production.httpServer.address().port}`
  await send('Page.navigate', { url: `${productionBase}/#/receptionist/patients` })
  await waitFor("document.querySelector('.r01-access [role=alert]')")
  assert.equal(await evaluate("document.querySelector('.r02-patients')"), null)
  await send('Page.navigate', { url: `${productionBase}/#/__receptionist/patients` }); await pause(250)
  assert.equal(await evaluate("document.querySelector('.r02-patients')"), null)
  assert.deepEqual(errors, [])
  console.log(`PASS: Patients/Today routes and active navigation, name/both scripts/file/phone search, pagination/reset/exact counts, linking states, field/future-date/phone validation, cancelled draft, failed save preserved values/field errors, duplicate blocking, confirmed save/current-search refresh/focus return, drawer edges/scrolling, unsaved language switch, EN/AR desktop/mobile, loading/retry/empty/missing link data, production isolation and no API calls. Screenshots: ${temporary}`)
} finally { socket?.close(); browser?.kill(); await server.close(); if (production) await new Promise(resolve => production.httpServer.close(resolve)) }
