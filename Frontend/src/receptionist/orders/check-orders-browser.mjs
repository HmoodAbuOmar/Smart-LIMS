import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, preview } from 'vite'
import react from '@vitejs/plugin-react'

const temporary = mkdtempSync(join(tmpdir(), 'smart-lims-orders-'))
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
      .catch(error => { throw new Error(`Browser evaluation failed: ${expression}`, { cause: error }) })
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
  await send('Page.addScriptToEvaluateOnNewDocument',{source:'window.__ordersBoot = crypto.randomUUID()'})
  async function reloadOrder() {
    const previous = await evaluate('window.__ordersBoot')
    await send('Page.reload')
    let changed = false
    for(let i=0;i<100;i++) {
      try { if(await evaluate(`!!window.__ordersBoot && window.__ordersBoot !== ${JSON.stringify(previous)}`)) { changed=true;break } } catch { /* Navigation can replace the execution context between polls. */ }
      await pause(50)
    }
    assert.ok(changed,'Refresh must load a new document')
    await waitFor("document.querySelector('#ro-tab-items') && document.querySelector('[data-balance=total]')")
  }
  const base = `http://127.0.0.1:${server.httpServer.address().port}`
  await send('Page.navigate', { url: `${base}/#/__receptionist/orders` })
  await waitFor("document.querySelectorAll('.ro-open').length===7")
  async function buttonStyle() { return evaluate("(()=>{const b=document.querySelector('.ro-open'),s=getComputedStyle(b);return {background:s.backgroundColor,color:s.color,outline:s.outlineStyle,outlineWidth:s.outlineWidth}})()") }
  for(const language of ['en','ar']) {
    await evaluate("import('/src/i18n.js').then(m=>m.default.changeLanguage("+JSON.stringify(language)+"))")
    await pause(100)
    const expected = await evaluate("import('/src/receptionist/walk-in/walkInService.js').then(async m=>{const number=document.querySelector('tbody tr td:first-child>div').textContent.trim();return (await m.walkInService.listAllOrders()).find(o=>o.orderNumber===number).id})")
    const point = await evaluate("(()=>{const r=document.querySelector('.ro-open').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point})
    assert.equal((await buttonStyle()).background,'rgb(18, 100, 95)')
    assert.equal((await buttonStyle()).color,'rgb(255, 255, 255)')
    await screenshot('open-order-hover-'+language)
    const rowPoint = await evaluate("(()=>{const r=document.querySelector('tbody tr td:first-child').getBoundingClientRect();return {x:r.x+5,y:r.y+r.height/2}})()")
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...rowPoint})
    assert.equal((await buttonStyle()).background,'rgb(8, 63, 61)')
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1})
    await click('.ro-search input');await key('Tab')
    assert.ok(await evaluate("document.activeElement.matches('.ro-open')"))
    assert.equal((await buttonStyle()).color,'rgb(255, 255, 255)')
    assert.equal((await buttonStyle()).outline,'solid')
    assert.notEqual((await buttonStyle()).outlineWidth,'0px')
    await screenshot('open-order-focus-'+language)
    await key('Enter');await waitFor("document.querySelector('.ro-context')")
    assert.ok(await evaluate("location.hash.includes("+JSON.stringify('orderId='+encodeURIComponent(expected))+")"))
    await click('.ro-back');await waitFor("document.querySelectorAll('.ro-open').length===7")
  }
  await evaluate("import('/src/i18n.js').then(m=>m.default.changeLanguage('en'))")
  assert.ok(await evaluate("document.querySelector('.ws-nav [aria-current=page]').textContent.includes('Orders')"))
  await input('.ro-search input', 'PO-2001'); await click('.ro-open'); await waitFor("document.querySelector('[data-balance=paid]')")
  assert.ok(await evaluate("document.querySelector('[data-balance=paid]').textContent.includes('130.00')"))
  assert.ok(await evaluate("document.querySelector('[data-balance=outstanding]').textContent.includes('20.00')"))
  assert.ok(await evaluate("document.querySelector('#ro-panel').textContent.includes('snapshots')"))
  await click('#ro-tab-appointment');assert.equal(await evaluate("document.querySelectorAll('#ro-panel tbody tr').length"),1)
  await click('#ro-tab-payments');assert.equal(await evaluate("document.querySelectorAll('#ro-panel tbody tr').length"),2)
  assert.equal(await evaluate("document.querySelector('.ro-payment-action button').disabled"),false)
  await click('#ro-tab-items');await key('ArrowRight')
  assert.equal(await evaluate("document.querySelector('#ro-tab-appointment').getAttribute('aria-selected')"),'true')
  const before = await evaluate("import('/src/receptionist/walk-in/walkInService.js').then(m=>m.walkInService.listAllOrders()).then(JSON.stringify)")
  await reloadOrder()
  assert.equal(await evaluate("document.querySelector('#ro-tab-items').getAttribute('aria-selected')"),'true')
  assert.equal(await evaluate("import('/src/receptionist/walk-in/walkInService.js').then(m=>m.walkInService.listAllOrders()).then(JSON.stringify)"),before)
  await screenshot('existing-order-en-desktop')
  await evaluate("location.hash='/__receptionist/today'");await waitFor("document.querySelector('.r01-walk-in')")
  const appointments = await evaluate("import('/src/receptionist/today/todayService.js').then(m=>m.todayService.load()).then(JSON.stringify)")
  await click('.r01-walk-in');await waitFor("document.querySelector('.r05-select-patient')")
  await input('#r02-search','P-1001');await waitFor("document.querySelectorAll('.r05-select-patient').length===1")
  await click('.r05-select-patient');await waitFor("document.querySelector('.r04-create')");await click('.r04-create')
  assert.equal(await evaluate("document.querySelectorAll('.r05-selected-details dt').length"),3)
  await input('.r05-search input','CBC');await click('.r05-test-list button')
  await evaluate("import('/src/admin/catalog/adminCatalogService.js').then(async m=>{const t=(await m.adminCatalogService.load()).tests[0];await m.adminCatalogService.saveTest({...t,price:30},t.id)})")
  await click('.r05-summary button[type=submit]');await waitFor("document.querySelector('.r05-error')?.textContent.includes('Prices have changed')")
  await evaluate("import('/src/admin/catalog/adminCatalogService.js').then(m=>m.adminCatalogService.setTestActive('catalog-test-1',false))")
  await click('.r05-summary button[type=submit]');await waitFor("document.querySelector('.r05-error')?.textContent.includes('no longer available')")
  await evaluate("import('/src/admin/catalog/adminCatalogService.js').then(async m=>{const t=(await m.adminCatalogService.load()).tests[0];await m.adminCatalogService.saveTest({...t,active:true,price:25},t.id)})")
  await evaluate("location.hash='/__receptionist/today'");await waitFor("document.querySelector('.r01-walk-in')");await click('.r01-walk-in');await waitFor("document.querySelector('.r05-select-patient')")
  await input('#r02-search','P-1001');await waitFor("document.querySelectorAll('.r05-select-patient').length===1");await click('.r05-select-patient');await waitFor("document.querySelector('.r04-create')");await click('.r04-create')
  await input('.r05-search input','CBC');await click('.r05-test-list button')
  await click('.r05-selected-toolbar button');assert.equal(await evaluate("document.querySelectorAll('.r05-summary li').length"),0)
  await click('.r05-test-list button');await input('.r05-search input','GLU');await click('.r05-test-list button')
  await input('#r05-notes','Saved workspace notes')
  await evaluate("import('/src/receptionist/walk-in/walkInService.js').then(m=>{window.createOrder=m.walkInService.create;m.walkInService.create=async()=>{throw new Error('offline')}})")
  await click('.r05-summary button[type=submit]');await waitFor("document.querySelector('.r05-error')")
  assert.equal(await evaluate("document.querySelector('#r05-notes').value"),'Saved workspace notes')
  await evaluate("import('/src/receptionist/walk-in/walkInService.js').then(m=>{window.writes=0;m.walkInService.create=async request=>{window.writes++;await new Promise(r=>setTimeout(r,300));return window.createOrder(request)}})")
  await click('.r05-summary button[type=submit]');assert.equal(await evaluate("document.querySelector('.r05-summary button[type=submit]').disabled"),true)
  await evaluate("document.querySelector('.r05-summary button[type=submit]').click()")
  await waitFor("document.querySelector('.ro-success') && document.querySelector('[data-balance=paid]')")
  assert.equal(await evaluate('window.writes'),1)
  assert.ok(await evaluate("location.hash.includes('orderId=r05-order-1')"))
  assert.equal(await evaluate("document.querySelectorAll('#ro-panel tbody tr').length"),2)
  assert.ok(await evaluate("document.querySelector('[data-balance=total]').textContent.includes('55.00')"))
  assert.ok(await evaluate("document.querySelector('[data-balance=paid]').textContent.includes('0.00')"))
  await click('#ro-tab-appointment');assert.ok(await evaluate("document.querySelector('#ro-panel').textContent.includes('No appointment')"))
  await click('#ro-tab-details');assert.ok(await evaluate("document.querySelector('#ro-panel').textContent.includes('Saved workspace notes')"))
  const stored = await evaluate("sessionStorage.getItem('smart-lims.receptionist-orders.v1')")
  assert.equal(await evaluate("import('/src/receptionist/today/todayService.js').then(m=>m.todayService.load()).then(JSON.stringify)"),appointments)
  await reloadOrder()
  assert.equal(await evaluate("sessionStorage.getItem('smart-lims.receptionist-orders.v1')"),stored)
  assert.equal(await evaluate("document.querySelector('.ro-success')"),null)
  for (const language of ['en','ar']) {
    await evaluate("import('/src/i18n.js').then(m=>m.default.changeLanguage("+JSON.stringify(language)+"))")
    for (const width of [1440,390]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:1000,deviceScaleFactor:1,mobile:width===390})
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'))
      for (const tab of ['items','appointment','payments','details']) { await click('#ro-tab-'+tab);await screenshot('workspace-'+language+'-'+width+'-'+tab) }
    }
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
  await evaluate("location.hash='/__receptionist/walk-in'");await waitFor("document.querySelector('.r02-add')");await click('.r02-add')
  await input('#r02-fullName','Fresh Workspace Patient');await input('#r02-dateOfBirth','02/01/2000');await click('#r02-gender-UNKNOWN');await input('#r02-phoneNumber','0599000111')
  await click('dialog button[type=submit]');await waitFor("document.querySelector('.r04-create')");await click('.r04-create')
  await input('.r05-search input','GLU');await click('.r05-test-list button');await click('.r05-summary button[type=submit]')
  await waitFor("location.hash.includes('orderId=r05-order-2') && document.querySelector('.ro-context')")
  await reloadOrder()
  assert.ok(await evaluate("document.querySelector('.ro-context').textContent.includes('Fresh Workspace Patient')"))
  await click('.ro-back');await waitFor("document.querySelectorAll('.ro-open').length===8")
  await input('.ro-search input','ORD-000002');await click('.ro-open');await waitFor("document.querySelector('.ro-context')")
  assert.ok(await evaluate("document.querySelector('.ro-context').textContent.includes('Fresh Workspace Patient')"))
  await evaluate("import('/src/i18n.js').then(m=>m.default.changeLanguage('en'))")
  await click('.r01-sidebar [data-page=payments]')
  await waitFor("document.querySelector('.rp-payments tbody')")
  assert.match(await evaluate("document.querySelector('.rp-collections').textContent"), /130\.00/)
  await input('.rp-filters [name=type]', 'REFUND')
  assert.equal(await evaluate("document.querySelectorAll('.rp-payments tbody tr').length"), 1)
  assert.match(await evaluate("document.querySelector('.rp-collections').textContent"), /-.*20\.00/)
  await input('.rp-filters [name=query]', 'Omar')
  assert.ok(await evaluate("Boolean(document.querySelector('.rp-payments .ro-empty'))"))
  await input('.rp-filters [name=query]', 'Lina')
  assert.equal(await evaluate("document.querySelectorAll('.rp-payments tbody tr').length"), 1)
  await input('.rp-filters [name=query]', '')
  await input('.rp-filters [name=type]', '')
  await click('.rp-payments header button')
  await input('.rp-form select:first-of-type', 'demo-patient-order-1')
  assert.match(await evaluate("document.querySelector('.rp-summary').textContent"), /150\.00.*130\.00.*20\.00/)
  await input('.rp-form input', '20.01')
  await input('.rp-form label:last-child select', 'CASH')
  await click('.rp-form button[type=submit]')
  assert.ok(await evaluate("Boolean(document.querySelector('.rp-error[role=alert]'))"))
  await input('.rp-form input', '10.50')
  await evaluate("document.querySelector('.rp-form button[type=submit]').click(); document.querySelector('.rp-form button[type=submit]').click()")
  await waitFor("document.querySelector('.rp-receipt[open]')")
  assert.match(await evaluate("document.querySelector('.rp-receipt').textContent"), /RCP-1.*PO-2001.*Cash.*10\.50/)
  await evaluate(`window.print = () => {
    window.receiptPrinted = document.fonts.status === 'loaded' &&
      [...document.querySelectorAll('.rp-receipt img')].every(image => image.complete && image.naturalWidth > 0)
  }`)
  for (const [language, direction] of [['en', 'ltr'], ['ar', 'rtl']]) {
    await evaluate(`import('/src/i18n.js').then(m => m.default.changeLanguage('${language}'))`)
    assert.equal(await evaluate("document.querySelector('.rp-receipt').dir"), direction)
    assert.match(await evaluate("document.querySelector('.rp-receipt-amount').textContent"), /ILS 10\.50/)
    await evaluate('window.receiptPrinted = false')
    await click('.rp-receipt .ro-primary')
    await waitFor('window.receiptPrinted')
    await screenshot(`receipt-${language}`)
    const pdf = await send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false })
    writeFileSync(join(temporary, `payment-receipt-${language}.pdf`), Buffer.from(pdf.data, 'base64'))
  }
  await evaluate("import('/src/i18n.js').then(m=>m.default.changeLanguage('en'))")
  await click('.rp-receipt button:first-child')
  assert.match(await evaluate("document.querySelector('.rp-collections').textContent"), /140\.50/)
  await click('.rp-payments .ro-pagination button:last-child')
  assert.equal(await evaluate("document.querySelectorAll('.rp-payments tbody tr').length"), 1)
  await input('.rp-filters [name=query]', 'PO-2001')
  assert.equal(await evaluate("document.querySelectorAll('.rp-payments tbody tr').length"), 3)
  await input('.rp-filters [name=type]', 'REFUND')
  await click('.rp-payments tbody button')
  assert.match(await evaluate("document.querySelector('.rp-receipt-amount').textContent"), /Amount refunded.*ILS 20\.00/)
  assert.match(await evaluate("document.querySelector('.rp-receipt-heading').textContent"), /Unavailable/)
  await click('.rp-receipt button:first-child')
  await input('.rp-filters [name=type]', '')
  const paymentDate = await evaluate("import('/src/admin/operationsPayments/operationsPaymentsModel.js').then(m=>m.reportDate())")
  await input('.rp-filters [name=from]', paymentDate)
  await input('.rp-filters [name=to]', paymentDate)
  assert.equal(await evaluate("document.querySelectorAll('.rp-payments tbody tr').length"), 1)
  await click('.rp-payments tbody a')
  await waitFor("document.querySelector('[data-balance=outstanding]')")
  assert.match(await evaluate("document.querySelector('[data-balance=outstanding]').textContent"), /9\.50/)
  await click('#ro-tab-payments')
  await click('.ro-payment-action button')
  await input('.rp-form input', '9.50')
  await input('.rp-form label:last-child select', 'CARD')
  await click('.rp-form button[type=submit]')
  await waitFor("document.querySelector('.rp-receipt[open]')")
  assert.match(await evaluate("document.querySelector('.rp-receipt').textContent"), /RCP-2.*Card terminal.*9\.50/)
  await click('.rp-receipt button:first-child')
  assert.match(await evaluate("document.querySelector('[data-balance=outstanding]').textContent"), /0\.00/)
  await reloadOrder()
  assert.match(await evaluate("document.querySelector('[data-balance=paid]').textContent"), /150\.00/)
  await click('.r01-sidebar [data-page=payments]')
  await waitFor("document.querySelector('.rp-payments tbody')")
  assert.match(await evaluate("document.querySelector('.rp-payments tbody').textContent"), /RCP-2/)
  for (const [language, direction] of [['en', 'ltr'], ['ar', 'rtl']]) {
    await evaluate("import('/src/i18n.js').then(m=>m.default.changeLanguage(" + JSON.stringify(language) + "))")
    assert.equal(await evaluate("document.querySelector('.reception-today-layout').dir"), direction)
    for (const width of [1920, 1366, 390]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: width === 390 ? 844 : 900, deviceScaleFactor: 1, mobile: width === 390 })
      const geometry = await evaluate(`(async () => {
        await document.fonts.ready
        const scroller = document.querySelector('.rp-table')
        const table = scroller.querySelector('table')
        const headers = [...table.rows[0].cells].map(cell => cell.getBoundingClientRect())
        const controls = [...document.querySelectorAll('.rp-filters :is(.ro-search, input[type=date], select)')]
          .map(control => control.getBoundingClientRect())
        const actions = [...table.querySelectorAll('td.rp-col-actions button')]
        const summary = document.querySelector('.rp-collections').getBoundingClientRect()
        const viewport = scroller.getBoundingClientRect()
        return {
          display: getComputedStyle(table).display,
          header: headers[0].height,
          rows: [...table.tBodies[0].rows].map(row => row.getBoundingClientRect().height),
          aligned: [...table.tBodies[0].rows].every(row => [...row.cells].every((cell, i) => {
            const rect = cell.getBoundingClientRect()
            return Math.abs(rect.x - headers[i].x) < 1 && Math.abs(rect.width - headers[i].width) < 1
          })),
          actionsFit: actions.every(button => {
            const range = document.createRange()
            range.selectNodeContents(button)
            const label = range.getBoundingClientRect()
            const cell = button.closest('td').getBoundingClientRect()
            const bounds = button.getBoundingClientRect()
            return getComputedStyle(button).whiteSpace === 'nowrap' && range.getClientRects().length === 1 &&
              label.left >= bounds.left && label.right <= bounds.right && bounds.left >= cell.left && bounds.right <= cell.right
          }),
          statusFits: [...table.querySelectorAll('.ro-badge')].every(badge => badge.getBoundingClientRect().width < badge.closest('td').getBoundingClientRect().width - 20),
          toolbarAligned: controls.every(control => Math.abs(control.top - controls[0].top) < 1 && Math.abs(control.bottom - controls[0].bottom) < 1),
          stripBelow: summary.top >= viewport.bottom && Math.abs(summary.width - viewport.width) < 1 && summary.height <= 48,
          tableScrolls: scroller.scrollWidth > scroller.clientWidth,
          pageFits: document.documentElement.scrollWidth <= innerWidth,
        }
      })()`)
      assert.equal(geometry.display, 'table')
      assert.ok(geometry.header >= 44 && geometry.header <= 50, JSON.stringify(geometry))
      assert.ok(geometry.rows.every(height => height >= 60 && height <= 68), JSON.stringify(geometry))
      assert.ok(geometry.aligned && geometry.actionsFit && geometry.statusFits && geometry.stripBelow && geometry.pageFits, JSON.stringify(geometry))
      assert.equal(geometry.tableScrolls, width === 390)
      if (width !== 390) assert.ok(geometry.toolbarAligned, JSON.stringify(geometry))
      await screenshot(`payments-${language}-${width}`)
      if (width === 390) {
        assert.ok(await evaluate(`(() => {
          const scroller = document.querySelector('.rp-table')
          const button = scroller.querySelector('tbody button')
          scroller.scrollLeft = ${direction === 'rtl' ? '-1' : '1'} * scroller.scrollWidth
          const viewport = scroller.getBoundingClientRect(), bounds = button.getBoundingClientRect()
          return bounds.left >= viewport.left && bounds.right <= viewport.right
        })()`))
        await screenshot(`payments-${language}-${width}-actions`)
      }
    }
    await click('.rp-payments tbody button')
    assert.equal(await evaluate("document.querySelector('.rp-receipt h2').textContent"), language === 'ar' ? 'إيصال المعاملة' : 'Payment receipt')
    await click('.rp-receipt button:first-child')
  }
  await evaluate("location.hash='/__receptionist/orders?orderId=missing'");await waitFor("document.querySelector('.ro-empty[role=alert]')")
  production = await preview({ configFile: false, root: fileURLToPath(new URL('../../../', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } })
  await send('Page.navigate',{url:`http://127.0.0.1:${production.httpServer.address().port}/#/receptionist/orders`})
  await waitFor("document.querySelector('.r01-access [role=alert]')")
  assert.equal(await evaluate("document.querySelector('.ro-orders')"),null)
  await send('Page.navigate',{url:`http://127.0.0.1:${production.httpServer.address().port}/#/receptionist/payments`})
  await waitFor("document.querySelector('.r01-access h1')?.textContent.match(/Payments|المدفوعات/)")
  assert.equal(await evaluate("document.querySelector('.rp-payments')"),null)
  assert.deepEqual(errors,[])
  console.log(`PASS: Orders navigation/search, existing order IDs and linked payments/refunds/appointments, Today → Walk-in, clear-all, failed drafts, duplicate prevention, saved-ID workspace navigation, read-only refresh/new patient persistence, Items defaults, four tabs, EN/AR desktop/mobile, missing order and production unavailable. Screenshots: ${temporary}`)
} finally { socket?.close(); browser?.kill(); await server.close(); if(production) await new Promise(resolve=>production.httpServer.close(resolve)) }
