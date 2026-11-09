import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const temporary = mkdtempSync(join(tmpdir(), 'smart-lims-catalog-'))
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
    const virtual = { Escape: 27, Tab: 9, Home: 36, End: 35, ArrowRight: 39, ArrowLeft: 37 }[key]
    const params = { key, code, windowsVirtualKeyCode: virtual, nativeVirtualKeyCode: virtual }
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...params })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...params })
    await pause(40)
  }
  async function screenshot(name) { const result = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(temporary, `${name}.png`), Buffer.from(result.data, 'base64')) }
  await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  const developmentUrl = `http://127.0.0.1:${server.httpServer.address().port}`
  await send('Page.navigate', { url: `${developmentUrl}/#/__admin/tests` })
  await waitFor("document.querySelectorAll('.ac-test-item').length === 7")
  assert.equal(await evaluate("document.querySelectorAll('.ac-form-test').length"), 1)
  await click('#catalog-tab-referenceRanges')
  assert.equal(await evaluate("document.querySelector('.ac-range-select select').value"),'catalog-parameter-1')
  assert.ok(await evaluate("document.querySelector('.ac-range-context').textContent.includes('CBC') && document.querySelector('.ac-range-context').textContent.includes('MEASURE-A')"))
  assert.equal(await evaluate("document.querySelector('#catalog-range-lower').value"),'')
  assert.equal(await evaluate("document.querySelector('#catalog-range-validFrom').value"),'')
  assert.equal(await evaluate("document.querySelector('.ac-range-empty').getBoundingClientRect().bottom <= document.querySelector('.ac-inline-range').getBoundingClientRect().top"),true)
  await input('#catalog-range-lower','7'); await click('.ac-form-range .ac-form-actions button:first-child')
  await waitFor("document.querySelector('.ac-discard-dialog')"); await click('.ac-discard-dialog button:last-child')
  assert.equal(await evaluate("document.querySelector('#catalog-range-lower').value"),'')
  await click('.ac-test-items li:nth-child(2) button')
  assert.deepEqual(await evaluate("[...document.querySelector('.ac-range-select select').options].map(option=>option.value)"),['catalog-parameter-3'])
  await click('.ac-test-items li:nth-child(3) button')
  assert.equal(await evaluate("document.querySelector('.ac-form-range')"),null)
  assert.ok(await evaluate("document.querySelector('.ac-ranges-tab').textContent.includes('Add a parameter first')"))
  await click('.ac-ranges-tab .ac-empty button'); await waitFor("document.querySelector('#catalog-tab-parameters').getAttribute('aria-selected') === 'true'")
  await click('.ac-test-items li:first-child button')
  await click('.ac-more'); await click('[role=menu] button:nth-child(2)'); await waitFor("document.querySelector('.ac-parameters-table tbody tr:first-child .ac-badge').textContent.includes('Inactive')")
  await click('.ac-test-items li:nth-child(2) button'); await click('.ac-test-items li:first-child button'); await click('#catalog-tab-referenceRanges')
  assert.equal(await evaluate("document.querySelector('.ac-range-select select').value"),'catalog-parameter-2')
  for (const language of ['en','ar']) {
    if(language==='ar') await click('.admin-language-control button[lang=ar]')
    for(const width of [1440,390]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<761}); await pause(100)
      if(await evaluate("getComputedStyle(document.querySelector('.ac-editor-pane')).display === 'none'")) await click('.ac-test-item')
      assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'),false)
      assert.equal(await evaluate("document.querySelector('.ac-range-empty').getBoundingClientRect().bottom <= document.querySelector('.ac-inline-range').getBoundingClientRect().top"),true)
      assert.equal(await evaluate("getComputedStyle(document.querySelector('.ac-range-empty p')).color"),'rgb(53, 83, 76)')
      await evaluate('window.scrollTo(0,0)'); await screenshot(`reference-empty-${language}-${width}`)
    }
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
  await click('.admin-language-control button[lang=en]'); await click('#catalog-tab-parameters')
  await click('.ac-more'); await click('[role=menu] button:nth-child(2)'); await waitFor("document.querySelector('.ac-parameters-table tbody tr:first-child .ac-badge').textContent.includes('Active')")
  await click('#catalog-tab-tests')
  await input('.ac-search input', 'AST'); assert.equal(await evaluate("document.querySelectorAll('.ac-test-item').length"), 1)
  await input('.ac-search input', 'تعداد الدم'); assert.equal(await evaluate("document.querySelectorAll('.ac-test-item').length"), 1)
  await input('.ac-search input', '')
  await click('.ac-status-filters button:nth-child(3)'); assert.equal(await evaluate("document.querySelectorAll('.ac-test-item').length"), 3)
  await click('.ac-status-filters button:first-child')
  await click('.ac-list-pagination button:last-child'); assert.equal(await evaluate("document.querySelectorAll('.ac-test-item').length"), 5)
  await click('.ac-list-pagination button:first-child')
  await input('#catalog-nameEn', 'Unsaved name')
  await click('.ac-test-items li:nth-child(2) button'); await waitFor("document.querySelector('.ac-discard-dialog[open]')")
  await click('.ac-discard-dialog button:first-child'); assert.equal(await evaluate("document.querySelector('#catalog-nameEn').value"), 'Unsaved name')
  await click('#catalog-tab-parameters'); await click('.ac-discard-dialog button:last-child')
  await waitFor("document.querySelectorAll('.ac-more').length === 2")
  await click('.ac-parameters-table tbody tr:nth-child(2) .ac-more'); await click('[role=menu] button:first-child')
  await input('#catalog-nameEn','An extended parameter name with multiple descriptive words and one uninterruptedidentifier'.repeat(2))
  await input('#catalog-nameAr','اسم معيار طويل لاختبار التفاف النص وظهور جميع الحقول والإجراءات '.repeat(3))
  await input('#catalog-methodEn','A long laboratory measurement method with additional descriptive wording')
  await input('#catalog-methodAr','طريقة قياس مخبرية ذات وصف طويل للتحقق من التفاف النص داخل الجدول')
  await click('dialog button[type=submit]'); await waitFor("!document.querySelector('dialog')")
  for (const layoutLanguage of ['en','ar']) {
    if(layoutLanguage === 'ar') await click('.admin-language-control button[lang=ar]')
    for (const width of [1440,1280,1024,768,390,320]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<761})
      await pause(90)
      if(await evaluate("getComputedStyle(document.querySelector('.ac-editor-pane')).display === 'none'")) await click('.ac-test-item')
      const layout = await evaluate(`(() => {
        const wrap=document.querySelector('.ac-parameters-table'),table=wrap.querySelector('table'),bounds=wrap.getBoundingClientRect();
        return { fits:wrap.scrollWidth<=wrap.clientWidth+1 && table.getBoundingClientRect().width<=bounds.width+1,
          pageFits:document.documentElement.scrollWidth<=innerWidth,
          cells:[...wrap.querySelectorAll('tbody tr:first-child > th,tbody tr:first-child > td')].length,
          visible:[...wrap.querySelectorAll('tbody tr:first-child > th,tbody tr:first-child > td')].every(cell=>{const r=cell.getBoundingClientRect();return r.left>=bounds.left-1&&r.right<=bounds.right+1}),
          actions:[...wrap.querySelectorAll('.ac-more')].every(button=>{const r=button.getBoundingClientRect();return r.left>=bounds.left-1&&r.right<=bounds.right+1}),
          stacked:getComputedStyle(table).display==='block',
          labels:[...wrap.querySelectorAll('tbody tr:first-child .ac-parameter-label')].every(label=>getComputedStyle(label).display!=='none')};
      })()`)
      assert.equal(layout.fits,true,JSON.stringify({layoutLanguage,width,layout}))
      assert.equal(layout.pageFits,true);assert.equal(layout.cells,9);assert.equal(layout.visible,true);assert.equal(layout.actions,true)
      if(width<761){assert.equal(layout.stacked,true);assert.equal(layout.labels,true)}
      if(width>=1280) assert.equal(layout.stacked,false)
      if(width===390) {
        await click('.ac-more'); await waitFor("document.querySelector('[role=menu]')")
        await pause(150); await waitFor("document.activeElement === document.querySelector('[role=menu] button:first-child')"); await key('End'); assert.equal(await evaluate("document.activeElement === document.querySelector('[role=menu] button:last-child')"),true)
        await key('Escape'); assert.equal(await evaluate("document.activeElement.classList.contains('ac-more')"),true)
      }
      await evaluate('window.scrollTo(0,0)'); await screenshot(`parameters-${layoutLanguage}-${width}`)
    }
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
  await click('.admin-language-control button[lang=en]')
  await click('.ac-more'); await click('[role=menu] button:first-child')
  assert.equal(await evaluate("document.querySelector('#catalog-unit').disabled"), true)
  await key('Escape')
  await click('.ac-more'); await click('[role=menu] button:last-child')
  await waitFor("document.querySelector('.ac-form-range')")
  assert.equal(await evaluate("document.querySelector('#catalog-range-lower').value"), '')
  await input('#catalog-range-lower', '1'); await input('#catalog-range-upper', '2'); await input('#catalog-range-minAgeDays', '0'); await input('#catalog-range-maxAgeDays', '10')
  await click('.ac-form-range button[type=submit]'); await waitFor("document.querySelectorAll('.ac-table-scroll tbody tr').length === 1")
  await input('#catalog-range-lower', '3'); await input('#catalog-range-minAgeDays', '5'); await input('#catalog-range-maxAgeDays', '15')
  await click('.ac-form-range button[type=submit]'); await waitFor("document.querySelector('.ac-form-range [role=alert]')")
  await input('#catalog-range-minAgeDays', '10'); await click('.ac-form-range button[type=submit]'); await waitFor("document.querySelectorAll('.ac-table-scroll tbody tr').length === 2")
  await evaluate('window.scrollTo(0,0)'); await screenshot('ranges-en-desktop')
  await click('.ac-table-scroll tbody tr:first-child button')
  await input('#catalog-validTo','2026-01-01'); await click('dialog .ac-form button[type=submit]')
  await waitFor("document.querySelector('.ac-expired')")
  await click('.ac-history input'); assert.equal(await evaluate("document.querySelectorAll('.ac-table-scroll tbody tr').length"),1)
  await click('.ac-history input')
  await input('.ac-range-select select','catalog-parameter-2')
  assert.equal(await evaluate("document.querySelector('#catalog-range-lower')"),null)
  await input('#catalog-range-referenceEn','Reviewed'); await input('#catalog-range-referenceAr','تمت المراجعة')
  await click('.ac-form-range button[type=submit]'); await waitFor("document.querySelector('.ac-table-scroll tbody')?.textContent.includes('Reviewed')")
  await waitFor("!document.querySelector('.ac-heading > button').disabled")
  await click('#catalog-tab-parameters'); await click('.ac-section-heading button')
  await input('#catalog-code','MEASURE-A'); await input('#catalog-nameEn','Extra measurement'); await input('#catalog-nameAr','قياس إضافي')
  await click('dialog .ac-form button[type=submit]'); await waitFor("document.querySelector('#catalog-error-parameter-code')")
  await input('#catalog-code','EXTRA'); await click('dialog .ac-form button[type=submit]'); await waitFor("document.querySelectorAll('.ac-more').length === 3 && !document.querySelector('dialog')")
  await click('#catalog-tab-tests')
  await click('.ac-heading > button')
  assert.equal(await evaluate("document.querySelector('#catalog-tab-parameters').disabled"), true)
  await click('.ac-form-test button[type=submit]'); assert.ok(await evaluate("document.querySelectorAll('.ac-form-test [aria-invalid=true]').length >= 4"))
  assert.equal(await evaluate("document.querySelector('.ac-inline-test .ac-language')"),null)
  assert.equal(await evaluate("document.querySelector('#catalog-nameAr')"),null)
  for (const [field,value] of Object.entries({code:'CBC',nameEn:'New panel',price:'2.345',sampleType:'SERUM'})) await input(`#catalog-${field}`,value)
  await input('#catalog-descriptionEn','English description retained')
  await click('.ac-form-test button[type=submit]'); assert.ok(await evaluate("Boolean(document.querySelector('#catalog-error-test-code') && document.querySelector('#catalog-error-test-price'))"))
  await input('#catalog-code','NEW-001'); await input('#catalog-price','2.50'); await click('.ac-form-test button[type=submit]')
  await waitFor("document.documentElement.lang === 'ar' && document.querySelector('#catalog-nameAr')")
  assert.equal(await evaluate("document.querySelector('#catalog-nameEn')"),null)
  await input('#catalog-nameAr','فحص جديد'); await input('#catalog-descriptionAr','وصف عربي محفوظ')
  await click('.admin-language-control button[lang=en]')
  assert.equal(await evaluate("document.querySelector('#catalog-nameEn').value"),'New panel')
  assert.equal(await evaluate("document.querySelector('#catalog-descriptionEn').value"),'English description retained')
  assert.equal(await evaluate("document.querySelector('#catalog-sampleType').value"),'SERUM')
  await click('.ac-form-test button[type=submit]')
  await waitFor("document.querySelector('.ac-test-header').textContent.includes('NEW-001') && !document.querySelector('.ac-active-toggle button').disabled")
  await click('.admin-language-control button[lang=ar]')
  assert.equal(await evaluate("document.querySelector('#catalog-nameAr').value"),'فحص جديد')
  assert.equal(await evaluate("document.querySelector('#catalog-descriptionAr').value"),'وصف عربي محفوظ')
  assert.equal(await evaluate("document.querySelector('#catalog-sampleType option:checked').textContent"),'مصل')
  await click('.admin-language-control button[lang=en]')
  await click('.ac-active-toggle button'); await click('.ac-form-test button[type=submit]'); await waitFor("document.querySelector('.ac-form-note button')")
  await click('.ac-form-note button'); await waitFor("document.querySelector('.ac-active-toggle button').getAttribute('aria-checked') === 'false' && !document.querySelector('.ac-form-note button')")
  for (const language of ['en','ar']) {
    if (language === 'ar') await click('.admin-language-control button[lang=ar]')
    for (const width of [1440,768,390,320]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<761})
      await pause(100)
      assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, `${language}/${width} page overflow`)
      if (width < 761) {
        await click('.ac-mobile-back'); assert.equal(await evaluate("getComputedStyle(document.querySelector('.ac-editor-pane')).display"),'none')
        await click('.ac-test-item'); assert.equal(await evaluate("getComputedStyle(document.querySelector('.ac-list-pane')).display"),'none')
      } else {
        const sides = await evaluate("(() => { const a=document.querySelector('.ac-list-pane').getBoundingClientRect(),b=document.querySelector('.ac-editor-pane').getBoundingClientRect();return a.x < b.x })()")
        assert.equal(sides,language==='en')
      }
      await evaluate('window.scrollTo(0,0)'); await screenshot(`workspace-${language}-${width}`)
    }
  }
  assert.deepEqual(errors,[])
  console.log(`PASS: workspace, bilingual/mobile layouts, search/filter/pagination, unsaved guards, parameter menu/locks, inline range overlap/adjacency, add-test validation, save/deactivation. Screenshots: ${temporary}`)
} finally {
  if(socket?.readyState===WebSocket.OPEN) socket.close()
  browser?.kill()
  await server.close()
}
