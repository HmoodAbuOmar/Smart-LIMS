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
  async function verifyOpenFiles(language) {
    for (const [file,id] of [['P-1001','demo-patient-1'],['P-1002','demo-patient-2']]) {
      await input('#r02-search',file);await waitFor("document.querySelectorAll('.r02-open-file').length===1")
      const name=await evaluate("document.querySelector('tbody td:nth-child(2)>div').textContent")
      assert.equal(await evaluate("document.querySelector('.r02-open-file').textContent"),language==='ar'?'\u0641\u062a\u062d \u0627\u0644\u0645\u0644\u0641':'Open file')
      await click('.r02-open-file');await waitFor("document.querySelector('.r04-summary')")
      assert.equal(await evaluate("document.querySelector('.r04-profile').dataset.patientId"),id)
      assert.equal(await evaluate("document.querySelector('.r04-summary h2').textContent"),name)
      assert.equal(await evaluate("document.querySelector('#r04-tab-details').getAttribute('aria-selected')"),'true')
      assert.ok(await evaluate("document.querySelector('#r04-content .r04-details').textContent.includes("+JSON.stringify(file)+")"))
      await screenshot('open-file-'+language+'-'+file)
      if(file==='P-1002'){await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));await screenshot('profile-'+language+'-mobile');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})}
      await click('.r05-back');await waitFor("document.querySelector('.r02-open-file')")
    }
    await input('#r02-search','');await waitFor("document.querySelectorAll('tbody tr').length===8")
  }
  assert.equal(await evaluate("document.querySelector('.r02-add')"),null)
  await verifyOpenFiles('en')
  await click('.ws-language button[lang=ar]');await waitFor("document.documentElement.dir==='rtl'")
  assert.equal(await evaluate("document.querySelector('.r02-add')"),null)
  await screenshot('patients-ar-desktop');await verifyOpenFiles('ar')
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'))
  await screenshot('patients-ar-mobile')
  await click('.r01-menu-button');await click('.ws-language button[lang=en]');await key('Escape')
  assert.equal(await evaluate("document.querySelector('.r02-add')"),null)
  await screenshot('patients-en-mobile')
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
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
  console.log(`PASS: Patients/Today routes and active navigation, name/both scripts/file/phone search, pagination/reset/exact counts, linking states, no standalone Add patient action in either language, correct Open file IDs/default details tabs, EN/AR desktop/mobile, loading/retry/empty/missing link data, production isolation and no API calls. Screenshots: ${temporary}`)
} finally { socket?.close(); browser?.kill(); await server.close(); if (production) await new Promise(resolve => production.httpServer.close(resolve)) }
