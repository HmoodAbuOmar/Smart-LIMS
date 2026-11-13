import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, preview } from 'vite'
import react from '@vitejs/plugin-react'

const temporary = mkdtempSync(join(tmpdir(), 'smart-lims-r05-'))
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
  async function previewStep(name) {
    const original = await evaluate('({language:document.documentElement.lang,width:innerWidth,height:innerHeight})')
    for (const language of ['en','ar']) {
      await evaluate("import('/src/i18n.js').then(m=>m.default.changeLanguage("+JSON.stringify(language)+"))")
      await waitFor("document.documentElement.dir==="+JSON.stringify(language==='ar'?'rtl':'ltr'))
      for (const width of [1440,390]) {
        await send('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:1000,deviceScaleFactor:1,mobile:width===390})
        await pause(80)
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'))
        if(name==='confirmation') {
          const geometry=await evaluate("(()=>{const c=document.querySelector('.r05-receipt').getBoundingClientRect(),h=document.querySelector('.r05-heading').getBoundingClientRect(),m=document.querySelector('.r01-main').getBoundingClientRect(),b=document.querySelector('.r05-back').getBoundingClientRect();return {center:Math.abs((c.left+c.right-m.left-m.right)/2),left:Math.abs(c.left-h.left),right:Math.abs(c.right-h.right),back:document.documentElement.dir==='rtl'?Math.abs(b.left-c.left):Math.abs(b.right-c.right),width:c.width}})()")
          assert.ok(geometry.center<2);assert.ok(geometry.left<2&&geometry.right<2)
          if(width===1440){assert.equal(geometry.width,800);assert.ok(geometry.back<2)}
        }
        await screenshot(name+'-'+language+'-'+width)
      }
    }
    await evaluate("import('/src/i18n.js').then(m=>m.default.changeLanguage("+JSON.stringify(original.language)+"))")
    await send('Emulation.setDeviceMetricsOverride',{width:original.width,height:original.height,deviceScaleFactor:1,mobile:original.width<600})
  }
  const base = `http://127.0.0.1:${server.httpServer.address().port}`
  await send('Page.navigate', { url: `${base}/#/__receptionist/today` })
  await waitFor("document.querySelectorAll('.r01-table-container tbody tr').length===7")
  const appointments = await evaluate("import('/src/receptionist/today/todayService.js').then(m=>m.todayService.load()).then(JSON.stringify)")
  await click('.r01-walk-in'); await waitFor("document.querySelector('.r05-walk-in')")
  await waitFor("document.querySelectorAll('.r02-patients tbody tr').length===8")
  assert.equal(await evaluate("document.querySelector('.r05-workspace')"), null);await previewStep('patient-search')
  for (const [search, count] of [['Lina', 2], ['P-1001', 1], ['0599000111', 3], ['\u0644\u064a\u0646\u0627', 2]]) {
    await input('#r02-search', search); await waitFor(`document.querySelectorAll('.r02-patients tbody tr').length===${count}`)
    assert.equal(await evaluate("document.querySelector('.r05-patient')"), null)
  }
  await click('.r05-select-patient'); await waitFor("document.querySelector('.r04-create')");assert.equal(await evaluate("document.querySelector('#r04-tab-orders').getAttribute('aria-selected')"),'true');assert.equal(await evaluate("document.querySelectorAll('.r04-orders li').length"),4);assert.equal(await evaluate("document.querySelectorAll('.r04-summary .r04-create').length"),0);assert.equal(await evaluate("document.querySelectorAll('.r04-create').length"),1);assert.equal(await evaluate("document.querySelector('.r05-heading p').textContent"),'View patient details, orders, and appointments.');assert.equal(await evaluate("document.querySelector('.r05-back').textContent"),'Back to patient search');await screenshot('profile-existing-en');await previewStep('patient-profile');await click('#r04-tab-details');await click('#r04-tab-appointments');assert.equal(await evaluate("document.querySelectorAll('.r04-orders li').length"),5);await click('#r04-tab-orders');await click('.r04-create');await waitFor("document.querySelector('.r05-patient')")
  await click('.r05-summary button[type=submit]')
  assert.ok(await evaluate("document.querySelector('.r05-error')?.textContent.includes('at least one')"))
  await input('.r05-search input', 'CBC'); await waitFor("document.querySelectorAll('.r05-test-list li').length===1")
  await click('.r05-test-list button')
  assert.equal(await evaluate("document.querySelector('.r05-test-list button').disabled"), true)
  await input('#r05-notes', 'Preserve these notes')
  await evaluate("import('/src/admin/catalog/adminCatalogService.js').then(async m=>{const t=(await m.adminCatalogService.load()).tests[0];await m.adminCatalogService.saveTest({...t,price:(t.priceCents+500)/100},t.id)})")
  await click('.r05-summary button[type=submit]'); await waitFor("document.querySelector('.r05-error')?.textContent.includes('Prices have changed')")
  assert.ok(await evaluate("document.querySelector('.r05-summary .r05-total').textContent.includes('30.00')"))
  await evaluate("import('/src/admin/catalog/adminCatalogService.js').then(m=>m.adminCatalogService.setTestActive('catalog-test-1',false))")
  await click('.r05-summary button[type=submit]'); await waitFor("document.querySelector('.r05-error')?.textContent.includes('no longer available')")
  assert.equal(await evaluate("document.querySelector('#r05-notes').value"), 'Preserve these notes')
  await click('.r05-remove')
  await input('.r05-search input', 'Glucose'); await click('.r05-test-list button')
  await previewStep('create-order')
  await evaluate("import('/src/receptionist/walk-in/walkInService.js').then(m=>{window.originalCreate=m.walkInService.create;window.createCalls=0;m.walkInService.create=async request=>{window.createCalls++;window.request=request;await new Promise(r=>setTimeout(r,350));throw new Error('offline')}})")
  await click('.r05-summary button[type=submit]')
  assert.equal(await evaluate("document.querySelector('.r05-summary button[type=submit]').disabled"), true)
  await evaluate("document.querySelector('.r05-summary button[type=submit]').click()")
  await waitFor("document.querySelector('.r05-error')?.textContent.includes('Could not confirm')")
  assert.equal(await evaluate('window.createCalls'), 1)
  assert.equal(await evaluate('window.request.source'), 'WALK_IN')
  assert.equal(await evaluate('window.request.slotId'), undefined)
  assert.equal(await evaluate("document.querySelector('#r05-notes').value"), 'Preserve these notes')
  await screenshot('walk-in-en-desktop')
  const retryKeyValue = await evaluate('window.request.idempotencyKey')
  await evaluate("import('/src/receptionist/walk-in/walkInService.js').then(m=>m.walkInService.create=async request=>{window.retryKey=request.idempotencyKey;return window.originalCreate(request)})")
  await click('.r05-summary button[type=submit]'); await waitFor("document.querySelector('.r05-receipt')")
  assert.equal(await evaluate('window.retryKey'), retryKeyValue)
  assert.ok(await evaluate("document.querySelector('.r05-receipt').textContent.includes('ORD-000001')"))
  assert.equal(await evaluate("document.querySelectorAll('.r05-receipt button:disabled').length"), 0)
  assert.equal(await evaluate("document.querySelectorAll('.r05-receipt-actions button').length"), 2)
  assert.equal(await evaluate("document.querySelector('.r05-heading p')"), null)
  assert.equal(await evaluate("document.querySelector('#r05-title').textContent"),'Walk-in order created')
  assert.equal(await evaluate("document.querySelector('.r05-receipt').getBoundingClientRect().width"),800);await previewStep('confirmation')
  assert.equal(await evaluate("document.querySelector('#r05-r06-unavailable')"),null)
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
  assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"))
  await screenshot('walk-in-en-confirmed-mobile')
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
  assert.equal(await evaluate("import('/src/receptionist/today/todayService.js').then(m=>m.todayService.load()).then(JSON.stringify)"), appointments)
  await screenshot('walk-in-en-confirmed')
  await click('.r05-receipt .r05-back-profile');await waitFor("document.querySelector('.r04-orders')?.textContent.includes('ORD-000001')");await click('.r05-back');await waitFor("document.querySelector('.r02-add')");await input('#r02-search','No Matching Person');await waitFor("document.querySelector('.r05-add-hint')");
  assert.ok(await evaluate("document.querySelector('.r02-add').closest('.r02-toolbar')!==null"));
  // Search text is not treated as an explicitly entered patient name.
  await click('.r05-back');await waitFor("document.querySelector('.r01-walk-in')");await click('.r01-walk-in');await waitFor("document.querySelector('.r02-add')");await input('#r02-search','No Matching Person');await waitFor("document.querySelector('.r05-add-hint')"); await waitFor("document.querySelector('.r02-add')")
  await click('.r02-add');await previewStep('add-patient')
  await click('.r02-calendar-toggle')
  await input('.r02-calendar-heading input', '2000'); await input('.r02-calendar-heading select', '0')
  await click('[data-date="2000-01-02"]')
  assert.equal(await evaluate("document.querySelector('#r02-dateOfBirth').value"), '02/01/2000')
  await input('#r02-fullName', 'Walk In New Patient'); await input('#r02-dateOfBirth', '02/01/2000')
  await click('#r02-gender-UNKNOWN'); await input('#r02-phoneNumber', '0599000111')
  await evaluate("import('/src/receptionist/patients/patientsService.js').then(m=>{window.createPatient=m.receptionistPatientsService.create;m.receptionistPatientsService.create=async()=>{throw new Error('offline')}})")
  await click('dialog button[type=submit]');await waitFor("document.querySelector('dialog [role=alert]')")
  assert.equal(await evaluate("document.querySelector('#r02-fullName').value"),'Walk In New Patient')
  await evaluate("import('/src/receptionist/patients/patientsService.js').then(m=>m.receptionistPatientsService.create=window.createPatient)")
  await click('dialog button[type=submit]');await waitFor("document.querySelector('.r04-create')")
  assert.equal(await evaluate("document.querySelector('.r04-profile').dataset.patientId"),'r02-patient-9001')
  assert.ok(await evaluate("document.querySelector('.r04-created').textContent.includes('Patient file created')"))
  assert.ok(await evaluate("document.querySelector('.r04-summary').textContent.includes('Walk In New Patient')"))
  assert.ok(await evaluate("document.querySelector('#r04-content').textContent.includes('No orders')"));assert.ok(await evaluate("document.querySelector('.r04-unlinked')!==null"));await screenshot('profile-new-en');await click('.r04-created button');assert.equal(await evaluate("document.querySelector('.r04-created')"),null);await click('.r04-create');await waitFor("document.querySelector('.r05-summary')")
  await click('.ws-language button[lang=ar]'); await waitFor("document.documentElement.dir==='rtl'")
  await input('.r05-search input', '\u0633\u0643\u0631 \u0627\u0644\u062f\u0645'); await waitFor("document.querySelectorAll('.r05-test-list button').length===1")
  await click('.r05-test-list button'); await input('#r05-notes', '\u0645\u0644\u0627\u062d\u0638\u0629')
  await screenshot('walk-in-ar-desktop')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'))
  await screenshot('walk-in-ar-mobile')
  await click('.r05-summary button[type=submit]'); await waitFor("document.querySelector('.r05-receipt')")
  assert.ok(await evaluate("document.querySelector('.r05-receipt').textContent.includes('ORD-000002')"))
  await screenshot('walk-in-ar-confirmed')
  await click('.r05-back'); await waitFor("document.querySelector('.r01-walk-in')")
  await click('.r01-walk-in'); await waitFor("document.querySelectorAll('.r05-select-patient').length===8")
  await input('#r02-search', 'P-1002'); await waitFor("document.querySelectorAll('.r05-select-patient').length===1")
  await click('.r05-select-patient');await waitFor("document.querySelector('.r04-create')");await screenshot('profile-ar-mobile');await click('.r04-create')
  await input('.r05-search input', 'GLU'); await click('.r05-test-list button')
  await click('.r05-summary button[type=submit]'); await waitFor("document.querySelector('.r05-receipt')")
  assert.ok(await evaluate("document.querySelector('.r05-receipt').textContent.includes('ORD-000003')"))
  await click('.r05-back'); await waitFor("document.querySelector('.r01-walk-in')")
  await click('.r01-menu-button'); await click('.ws-language button[lang=en]'); await key('Escape')
  await click('.r01-walk-in'); await waitFor("document.querySelectorAll('.r05-select-patient').length===8")
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'))
  await screenshot('walk-in-en-mobile')
  await click('.r05-back'); await waitFor("document.querySelector('.r01-walk-in')")
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await evaluate("import('/src/receptionist/walk-in/walkInService.js').then(m=>{window.listTests=m.walkInService.listTests;m.walkInService.listTests=async()=>{throw new Error('offline')}})")
  await click('.r01-walk-in');await waitFor("document.querySelector('.r05-select-patient')");await click('.r05-select-patient');await waitFor("document.querySelector('.r04-create')");await click('.r04-create'); await waitFor("document.querySelector('.r05-state button')")
  await evaluate("import('/src/receptionist/walk-in/walkInService.js').then(m=>m.walkInService.listTests=window.listTests)")
  await click('.r05-state button'); await waitFor("document.querySelectorAll('.r05-test-list li').length===12")
  await evaluate("location.hash='/__receptionist/walk-in?patientId=demo-patient-2&from=patients&tab=details'")
  await waitFor("document.querySelector('#r04-tab-details')?.getAttribute('aria-selected')==='true'")
  await click('#r04-tab-orders');await click('.r04-create');await input('.r05-search input','GLU');await click('.r05-test-list button')
  await click('.r05-summary button[type=submit]');await waitFor("document.querySelector('.r05-receipt')")
  await click('.r05-receipt .r05-back-profile');await waitFor("document.querySelector('#r04-tab-orders')?.getAttribute('aria-selected')==='true'")
  production = await preview({ configFile: false, root: fileURLToPath(new URL('../../../', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } })
  await send('Page.navigate', { url: `http://127.0.0.1:${production.httpServer.address().port}/#/receptionist/walk-in` })
  await waitFor("document.querySelector('.r01-access [role=alert]')?.textContent.includes('WALK_IN')")
  assert.equal(await evaluate("document.querySelector('.r05-walk-in')"), null)
  assert.deepEqual(errors, [])
  console.log(`PASS: Today entry, explicit patient selection/search in both scripts/file/phone, R02 add-and-return, active/unique tests, removal, price/deactivation checks, preserved failed draft, duplicate prevention, stable retry key, confirmed local orders in EN/AR, unchanged appointments, desktop/mobile, catalog retry and production unavailable. Screenshots: ${temporary}`)
} finally { socket?.close(); browser?.kill(); await server.close(); if (production) await new Promise(resolve => production.httpServer.close(resolve)) }
