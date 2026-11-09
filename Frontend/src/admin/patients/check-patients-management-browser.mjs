import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, preview } from 'vite'
import react from '@vitejs/plugin-react'

const temporary = mkdtempSync(join(tmpdir(), 'smart-lims-patients-'))
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
  async function waitFor(expression) { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await pause(60) } assert.fail(`Condition not met: ${expression}`) }
  async function click(selector) { await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); element.focus(); element.click(); })()`); await pause(40) }
  async function input(selector, value) {
    await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); })()`)
    await pause(35)
  }
  async function key(key, code = key) {
    const virtual = { Escape: 27, Tab: 9, Home: 36, End: 35, ArrowRight: 39, ArrowLeft: 37 }[key]
    const params = { key, code, windowsVirtualKeyCode: virtual, nativeVirtualKeyCode: virtual }
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...params })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...params })
    await pause(40)
  }
  async function patients() { await click(".admin-navigation > button:nth-of-type(3)"); await waitFor("!!document.querySelector('.ap-search')") }
  async function fill(name = 'Added Patient') {
    await input('#patient-nameAr', '\u0645\u0631\u064a\u0636 \u062c\u062f\u064a\u062f')
    await input('#patient-nameEn', name)
    await input('#patient-dateOfBirth', '2000-01-02')
    await input('#patient-phone', '+9700012345')
  }
  async function screenshot(name) { const result = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(temporary, `${name}.png`), Buffer.from(result.data, 'base64')) }
  await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  const developmentUrl = `http://127.0.0.1:${server.httpServer.address().port}`
  for (const [page, selector] of [['overview', '.admin-overview'], ['patients', '.admin-patients']]) {
    await send('Page.navigate', { url: `${developmentUrl}/#/__admin/${page}` })
    await waitFor(`!!document.querySelector('${selector}') && !!document.querySelector('[data-admin-development-preview]')`)
    assert.equal(await evaluate("document.querySelector('.admin-nav-item.is-active').getAttribute('aria-current')"), 'true')
  }
  // The original direct entry uses the same development-only demo boundary.
  await send('Page.navigate', { url: `${developmentUrl}/admin/index.html` })
  await waitFor("!!document.querySelector('.admin-navigation')")
  await patients()
  assert.equal(await evaluate("document.querySelector('.admin-header h1').textContent"), 'Patients')
  assert.equal(await evaluate("document.querySelector('.admin-nav-item.is-active').textContent"), 'Patients')
  assert.equal(await evaluate("document.querySelectorAll('.admin-patients tbody tr').length"), 7)
  // Every seeded record has a localized name; identity colors never use language.
  await input('.ap-pagination select', '25')
  const seeded = await evaluate("import('/src/admin/patients/adminPatientsService.js').then(({adminPatientsService:s}) => s.load()).then(data => data.patients)")
  const readRows = () => evaluate("[...document.querySelectorAll('.admin-patients tbody tr')].map(row=>({file:row.querySelector('th bdi').textContent,name:row.querySelector('.ap-person > span:last-child').textContent,tone:row.querySelector('.ap-avatar').className,initials:row.querySelector('.ap-avatar').textContent}))")
  const englishRows = await readRows()
  assert.equal(englishRows.length, seeded.length)
  englishRows.forEach(row => assert.equal(row.name, seeded.find(patient => patient.fileNumber === row.file).nameEn))
  await click(".admin-language-control button[lang='ar']")
  const arabicRows = await readRows()
  arabicRows.forEach(row => {
    assert.equal(row.name, seeded.find(patient => patient.fileNumber === row.file).nameAr)
    assert.equal(row.tone, englishRows.find(item => item.file === row.file).tone)
  })
  assert.equal(arabicRows[0].initials, 'لن')
  for (const value of ['لينا ناصر', 'Lina Nasser']) {
    await input('.ap-search input', value)
    assert.equal(await evaluate("document.querySelectorAll('.admin-patients tbody tr').length"), 2)
  }
  await click(".admin-language-control button[lang='en']")
  assert.equal(await evaluate("document.querySelector('.ap-search input').value"), 'Lina Nasser')
  await input('.ap-search input', '')
  await input('.ap-pagination select', '7')
  await click('.ap-pagination nav button:last-child')
  const pageFiles = (await readRows()).map(row => row.file)
  await click(".admin-language-control button[lang='ar']")
  assert.deepEqual((await readRows()).map(row => row.file), pageFiles)
  await click(".admin-language-control button[lang='en']")
  await click('.ap-pagination nav button:first-child')
  await screenshot('en-desktop')
  await click('.ap-pagination nav button:last-child')
  assert.match(await evaluate("document.querySelector('.ap-pagination nav span').textContent"), /2/)
  for (const [value, count] of [['Lina Nasser', 2], ['0599000111', 3], ['P-1001', 1]]) {
    await input('.ap-search input', value)
    assert.equal(await evaluate("document.querySelectorAll('.admin-patients tbody tr').length"), count)
    assert.match(await evaluate("document.querySelector('.ap-pagination nav span').textContent"), /Page 1/)
  }
  await input('.ap-search input', 'no-such-patient')
  assert.match(await evaluate("document.querySelector('.ap-empty').textContent"), /No patients match/)
  await click('.ap-empty button')
  await input('.ap-pagination select', '10')
  assert.equal(await evaluate("document.querySelectorAll('.admin-patients tbody tr').length"), 10)
  await click('.ap-heading .ap-primary')
  await waitFor("!!document.querySelector('dialog[open]')")
  assert.equal(await evaluate('document.activeElement.id'), 'patient-nameAr')
  await click('dialog button[type=submit]')
  assert.equal(await evaluate("document.querySelectorAll('dialog [role=alert]').length"), 4)
  await fill()
  // Switch within the native modal, without losing either unsaved name.
  await click('dialog .ap-language')
  assert.equal(await evaluate("document.querySelector('#patient-nameEn').value"), 'Added Patient')
  assert.equal(await evaluate("document.querySelector('#patient-nameAr').value"), 'مريض جديد')
  assert.equal(await evaluate("document.querySelector('#patient-nameAr').dir"), 'rtl')
  assert.equal(await evaluate("document.querySelector('#patient-nameEn').dir"), 'ltr')
  await click('dialog .ap-language')
  await input('#patient-dateOfBirth', '2999-01-01')
  await click('dialog button[type=submit]')
  assert.match(await evaluate("document.querySelector('#patient-error-dateOfBirth').textContent"), /future/)
  await input('#patient-dateOfBirth', '2000-01-02')
  // Inject a one-shot boundary failure; exercise UI recovery without backend calls.
  await evaluate("import('/src/admin/patients/adminPatientsService.js').then(({adminPatientsService:s}) => { const save=s.save; s.save=async()=>{s.save=save; throw new Error('simulated failure')}; })")
  await click('dialog button[type=submit]')
  await waitFor("!!document.querySelector('dialog .ap-error')")
  assert.equal(await evaluate("document.querySelector('#patient-nameEn').value"), 'Added Patient')
  await click('dialog button[type=submit]')
  assert.equal(await evaluate("document.querySelector('dialog button[type=submit]').disabled"), true)
  await click('dialog button[type=submit]')
  await waitFor("!document.querySelector('dialog')")
  assert.match(await evaluate("document.querySelector('.admin-patients tbody tr').textContent"), /Added Patient/)
  assert.match(await evaluate("document.querySelector('.admin-patients tbody tr').textContent"), /\+9700012345/)
  assert.match(await evaluate("document.querySelector('.ap-toolbar').textContent"), /15/)
  await click('.ap-row-actions button:first-child')
  await waitFor("!!document.querySelector('.ap-summary')")
  assert.equal(await evaluate('document.activeElement.id'), 'patient-profile-name')
  await click('.ap-summary .ap-primary')
  await input('#patient-nameEn', 'Changed Patient Name')
  await click('dialog button[type=submit]')
  await waitFor("!document.querySelector('dialog')")
  assert.equal(await evaluate("document.querySelector('#patient-profile-name').textContent"), 'Changed Patient Name')
  assert.equal(await evaluate("document.activeElement.classList.contains('ap-primary')"), true)
  for (const [tab, text] of [['orders', 'no orders'], ['appointments', 'no appointments'], ['financial', 'No financial data']]) {
    await click(`#patient-tab-${tab}`)
    assert.ok((await evaluate("document.querySelector('[role=tabpanel]').textContent")).includes(text))
  }
  await click('.ap-profile-nav button')
  await click('.ap-row-actions button:nth-child(2)')
  await input('#patient-nameEn', 'Cancelled edit')
  await key('Escape')
  assert.equal(await evaluate("document.querySelector('dialog') === null"), true)
  assert.match(await evaluate("document.querySelector('.admin-patients tbody tr').textContent"), /Changed Patient Name/)
  await input('.ap-search input', 'P-1001')
  await click('.ap-row-actions button:first-child')
  await click('#patient-tab-orders')
  assert.equal(await evaluate("document.querySelectorAll('[role=tabpanel] tbody tr').length"), 4)
  assert.equal(await evaluate("Array.from(document.querySelectorAll('[role=tabpanel] button')).every(button => button.disabled)"), true)
  await click('#patient-tab-appointments')
  assert.equal(await evaluate("document.querySelectorAll('[role=tabpanel] tbody tr').length"), 5)
  await click('#patient-tab-financial')
  assert.ok((await evaluate("document.querySelector('.ap-financial').textContent")).includes('130.00'))
  await key('Home')
  assert.equal(await evaluate('document.activeElement.id'), 'patient-tab-overview')
  await screenshot('en-profile')
  for (const lang of ['en', 'ar']) {
    if (lang === 'ar') { await click(".admin-language-control button[lang='ar']"); await waitFor("document.documentElement.dir === 'rtl'") }
    for (const width of [1440, 768, 390, 320]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 })
      assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), `${lang} ${width}px profile overflow`)
      if (width === 1440 || width === 390) await screenshot(`${lang}-profile-${width}`)
    }
    await click('.ap-profile-nav button')
    await input('.ap-search input', '')
    assert.match(await evaluate("document.querySelector('.admin-patients').textContent"), lang === 'ar' ? /المرضى/ : /Patients/)
    for (const width of [1440, 768, 390, 320]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 })
      assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), `${lang} ${width}px list overflow`)
      if (width === 1440 || width === 390) await screenshot(`${lang}-list-${width}`)
    }
    await click('.ap-heading .ap-primary')
    assert.ok(await evaluate("document.querySelector('dialog').getBoundingClientRect().width < innerWidth"))
    await input('#patient-phone', '000123')
    assert.equal(await evaluate("document.querySelector('#patient-phone').value"), '000123')
    // Native modal keeps keyboard focus inside and Escape cancels without saving.
    for (let i = 0; i < 12; i++) { await key('Tab'); assert.ok(await evaluate("document.querySelector('dialog').contains(document.activeElement)")) }
    await screenshot(`${lang}-mobile-form`)
    await key('Escape')
    if (lang === 'en') { await input('.ap-search input', 'P-1001'); await click('.ap-row-actions button:first-child') }
  }
  // Navigation preserves records during this session.
  await evaluate("document.querySelector('.admin-navigation > button:first-of-type').click()")
  await patients()
  await input('.ap-search input', 'Changed Patient Name')
  assert.equal(await evaluate("document.querySelectorAll('.admin-patients tbody tr').length"), 1)
  // One-shot load error and an empty dataset exercise both recovery states.
  await evaluate("import('/src/admin/patients/adminPatientsService.js').then(({adminPatientsService:s}) => { window.restorePatientLoad=s.load; s.load=async()=>{throw new Error('simulated load failure')}; })")
  await evaluate("document.querySelector('.admin-navigation > button:first-of-type').click()")
  await evaluate("document.querySelector('.admin-navigation > button:nth-of-type(3)').click()")
  await waitFor("!!document.querySelector('.ap-empty [role=alert]')")
  await evaluate("import('/src/admin/patients/adminPatientsService.js').then(({adminPatientsService:s}) => { s.load=window.restorePatientLoad; })")
  await click('.ap-empty button')
  await waitFor("!!document.querySelector('.ap-search')")
  await evaluate("import('/src/admin/patients/adminPatientsService.js').then(({adminPatientsService:s}) => { s.load=async()=>({patients:[],orders:[],appointments:[],transactions:[]}); })")
  await evaluate("document.querySelector('.admin-navigation > button:first-of-type').click()")
  await evaluate("document.querySelector('.admin-navigation > button:nth-of-type(3)').click()")
  await waitFor("!!document.querySelector('.ap-search') && !document.querySelector('.admin-patients tbody tr')")
  assert.ok(await evaluate("document.querySelector('.ap-empty').textContent.length > 10"))
  // Exercise the actual built entry points: preview routes cannot expose Admin.
  production = await preview({ root: fileURLToPath(new URL('../../../', import.meta.url)), preview: { host: '127.0.0.1', port: 0, strictPort: false } })
  const productionUrl = `http://127.0.0.1:${production.httpServer.address().port}`
  for (const page of ['overview', 'patients']) {
    await send('Page.navigate', { url: `${productionUrl}/#/__admin/${page}` })
    await waitFor("document.readyState === 'complete' && !!document.querySelector('#root')?.children.length")
    assert.equal(await evaluate("!!document.querySelector('.admin-layout, [data-admin-development-preview]')"), false)
  }
  await send('Page.navigate', { url: `${productionUrl}/admin/index.html` })
  await waitFor("document.readyState === 'complete' && !!document.querySelector('#root')")
  assert.equal(await evaluate("document.querySelector('#root').children.length"), 0)
  await send('Page.navigate', { url: `${productionUrl}/#/login` })
  await waitFor("!!document.querySelector('input[name=email]')")
  assert.equal(await evaluate("!!document.querySelector('.admin-layout, [data-admin-development-preview]')"), false)
  assert.deepEqual(errors, [])
  console.log('PASS: navigation, three-field search, pagination/page size, required/future-date validation, save failure/retry, add/edit/cancel, focus/Escape/tab keyboard access, profile tabs and empty states, finance totals, session navigation, load retry, empty list, English/Arabic at desktop/tablet/mobile widths, and no API calls.')
  console.log(`Screenshots: ${temporary}`)
  console.log('PASS: direct DEV Admin overview/patients previews, legacy DEV entry, production preview-route/standalone isolation, and unchanged production login entry.')
  console.log('PASS: all seeded bilingual names, identity colors across languages, bilingual search, pagination/query preservation, paired-name validation and unsaved modal input across language switches.')
} finally {
  socket?.close()
  browser?.kill()
  await server.close()
  if (production) await new Promise((resolve, reject) => production.httpServer.close(error => error ? reject(error) : resolve()))
}
