// Run dev on localhost:5173 and the production build server on localhost:4173.
// Override CHROME_PATH and AUTH_TEST_URL for other local environments.
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { portalResources } from '../src/portal/portalCopy.js'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const profile = mkdtempSync(join(tmpdir(), 'smartlims-browser-'))
const browser = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9337', `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' })
let socket
let keepAlive
try {
  let targets
  for (let i = 0; i < 40; i++) {
    try { targets = await fetch('http://127.0.0.1:9337/json').then(response => response.json()) } catch { /* Starting Chrome. */ }
    if (targets?.some(target => target.type === 'page')) break
    await delay(250)
  }
  assert.ok(targets?.length, 'Chrome debugging is available')
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl)
  keepAlive = setInterval(() => {}, 1000)
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Chrome connection timed out')), 5000)
    socket.addEventListener('open', () => { clearTimeout(timeout); resolve() }, { once: true })
    socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Chrome connection failed')) }, { once: true })
  })
  const pending = new Map()
  const exceptions = []
  const requests = []
  let id = 0
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const request = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) request.reject(new Error(JSON.stringify(message.error)))
      else request.resolve(message.result)
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') exceptions.push(message.params.args.map(a=>a.value||a.description).join(' '));
    if (message.method === 'Network.loadingFailed') console.log('Network failure',message.params.errorText);
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) console.log('Response error', message.params.response.url, message.params.response.status);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text)
    if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request)
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id
    pending.set(next, { resolve, reject })
    socket.send(JSON.stringify({ id: next, method, params }))
  })
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Network.enable')
  const waitFor=async expression=>{for(let i=0;i<200;i++){if(await evaluate(expression))return;await delay(75)}console.log('UI failure',await evaluate('({url:location.href,body:document.body.innerHTML,resources:performance.getEntriesByType("resource").slice(-8).map(r=>r.name)})'),exceptions);assert.fail('UI timeout: '+expression)}
  const click=async(selector,index=0)=>{
    const point=await evaluate(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(el=>el.getClientRects().length)[${index}];if(!el)throw Error('Visible control missing');el.scrollIntoView({block:'center',behavior:'instant'});const b=el.getBoundingClientRect();const hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);if(!el.contains(hit))throw Error('Control is blocked');return {x:b.left+b.width/2,y:b.top+b.height/2}})()`)
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point})
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point})
    await delay(50)
  }
  const fill=async values=>{for(const [field,value] of Object.entries(values)){await evaluate(`(()=>{const el=document.querySelector('[name="${field}"]');const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`)}}
  const downloads = mkdtempSync(join(tmpdir(), 'smartlims-pdf-'))
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads })
  const textClick = async (text, selector = 'button') => {
    await evaluate(`(()=>{document.querySelector('[data-click-target]')?.removeAttribute('data-click-target');const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(el=>el.getClientRects().length&&el.textContent.trim()===${JSON.stringify(text)});if(!el)throw Error('Missing button: '+${JSON.stringify(text)});el.setAttribute('data-click-target','yes')})()`)
    await click('[data-click-target=yes]')
  }
  const nav = async page => { if (await evaluate('innerWidth<=850')) { await click('.portal-menu'); await delay(250) } await click(`.portal-sidebar [data-page="${page}"]`); await waitFor(`document.querySelector('.portal-sidebar [data-page="${page}"]')?.getAttribute('aria-current')==='page'`) }
  const inspect = async (lang, page) => {
    await waitFor("!!document.querySelector('.portal-page-title')")
    for (const width of [320, 768, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false }); await delay(250)
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'), `${lang} ${page} fits ${width}`)
      assert.ok(await evaluate("!document.body.innerText.includes('[object Object]') && !document.body.innerText.includes('portal:')"))
      if (process.env.AUTH_TEST_SCREENSHOTS && [320,1440].includes(width)) { await evaluate('scrollTo(0,0)'); const shot=await send('Page.captureScreenshot',{format:'png'}); const file=join(profile,`${lang}-portal-${page}-${width}.png`);writeFileSync(file,Buffer.from(shot.data,'base64'));console.log('Screenshot: '+file) }
    }
  }
  for (const lang of ['en', 'ar']) {
    const c = portalResources[lang]
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
    await send('Page.navigate', { url: 'http://localhost:5173/#/__portal/dashboard' })
    await waitFor("!!document.querySelector('.portal-stats')")
    await click('.portal-sidebar .language-switcher__segment',lang==='ar'?0:1)
    assert.equal(await evaluate('document.documentElement.dir'),lang==='ar'?'rtl':'ltr')
    await inspect(lang,'P01')
    await nav('profile');await inspect(lang,'P02')
    await textClick(c.edit);await fill({name:'X',phone:'abc',email:'bad'});await click('.portal-form button[type=submit]');assert.ok(await evaluate("document.querySelectorAll('[aria-invalid=true]').length>=3"))
    await fill({name:'Sample Updated',phone:'+970599111111',email:'updated@example.invalid'});await click('.portal-form button[type=submit]');await waitFor("!!document.querySelector('.portal-notice')")
    await textClick(c.backDashboard);assert.ok(await evaluate("document.querySelector('.portal-welcome').textContent.includes('Sample Updated')"))
    await nav('tests');await inspect(lang,'P03')
    await fill({'test-search':'nothing-matches'});assert.ok(await evaluate("!!document.querySelector('.portal-empty')"));await textClick(c.clear)
    await fill({'test-category':'vitamins'});assert.equal(await evaluate("document.querySelectorAll('.portal-test-card').length"),1)
    await textClick(c.view,'.portal-test-card button');await inspect(lang,'P04')
    await textClick(c.add);await waitFor("!!document.querySelector('.booking-summary')");await textClick(c.catalogBack,'.portal-actions button');await textClick(c.review+' (1)');await inspect(lang,'P05')
    await textClick(c.addMore);await textClick(c.clear);await click('.portal-test-card button:not(.is-secondary):not(:disabled)');await waitFor("!!document.querySelector('.booking-summary')");await textClick(c.catalogBack,'.portal-actions button');await textClick(c.review+' (2)')
    await click('.portal-danger-icon');assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"),1)
    await textClick(c.confirmOrder);await waitFor("!!document.querySelector('.portal-timeline')");await inspect(lang,'P07-new')
    assert.ok(await evaluate("!!document.querySelector('.portal-notice') && [...document.querySelectorAll('tbody button')].every(el=>el.disabled)"))
    await nav('orders');await inspect(lang,'P06')
    await textClick(c.completed,'.portal-filter-tabs button');assert.ok(await evaluate("document.querySelectorAll('tbody tr').length>0 && [...document.querySelectorAll('tbody tr')].every(row=>row.querySelector('.status-completed'))"))
    await click('tbody .portal-button');await inspect(lang,'P07')
    await click('tbody .portal-button');await inspect(lang,'P11')
    assert.ok(await evaluate("!!document.querySelector('.portal-report-watermark')"))
    const before=readdirSync(downloads).length;await textClick(c.downloadPdf);for(let i=0;i<100&&readdirSync(downloads).filter(n=>n.endsWith('.pdf')).length<=before;i++)await delay(100)
    const pdf=readdirSync(downloads).filter(n=>n.endsWith('.pdf')).at(-1);assert.ok(pdf);assert.ok(readFileSync(join(downloads,pdf)).subarray(0,8).toString().startsWith('%PDF-1.4'))
    await evaluate('window.__printed=false;window.print=()=>{window.__printed=true}')
    await textClick(c.print);assert.ok(await evaluate('window.__printed'))
    await textClick(c.backResults);await inspect(lang,'P10')
    await textClick(c.resultsPending,'.portal-filter-tabs button');assert.ok(await evaluate("[...document.querySelectorAll('tbody button')].every(el=>el.disabled)"))
    await nav('appointments');await inspect(lang,'P09')
    await textClick(c.book);await inspect(lang,'P08')
    await click('.portal-card form button[type=submit]');assert.ok(await evaluate("!!document.querySelector('form [role=alert]')"))
    await textClick(c.addMore,'.booking-summary button');await waitFor("!!document.querySelector('.portal-test-grid')");await click('.portal-test-card button:not(.is-secondary):not(:disabled)');await waitFor("!!document.querySelector('.portal-calendar')");await click('.portal-calendar-grid button:not(:disabled)',2);await click('.portal-slots button:not(:disabled)',1);await textClick(c.bookingContinue);await textClick(c.bookingConfirm,'dialog button');await waitFor("!!document.querySelector('.booking-payment-options')");await click('input[value=laboratory]');await textClick(c.confirmBooking,'.portal-actions button');await textClick(c.confirmBooking,'dialog button');await waitFor("!!document.querySelector('.booking-receipt')");await textClick(c.viewAppointments);await waitFor("!!document.querySelector('tbody')")
    await textClick(c.reschedule,'tbody button');await waitFor("!!document.querySelector('.portal-calendar')");await click('.portal-slots button:not(:disabled)',2);await click('.portal-card form button[type=submit]');await waitFor("!!document.querySelector('.portal-notice')")
    await textClick(c.cancel,'tbody button');await waitFor("!!document.querySelector('dialog[open]')");await textClick(c.keep,'dialog button');assert.ok(await evaluate("!document.querySelector('dialog[open]')"))
    await textClick(c.cancel,'tbody button');await textClick(c.confirmCancel,'dialog button');await waitFor("!document.querySelector('dialog[open]')");await textClick(c.past,'.portal-filter-tabs button');assert.ok(await evaluate("!!document.querySelector('.status-cancelled')"))
    await nav('notifications');await inspect(lang,'P12');await textClick(c.unread,'.portal-filter-tabs button');await textClick(c.markRead);await textClick(c.markAll);assert.ok(await evaluate("!!document.querySelector('.portal-empty')"))
    await textClick(c.clear);await click('.portal-notifications article:has(.lucide-file-text) .portal-notification-link');await waitFor("!!document.querySelector('.portal-report')")
    await nav('dashboard');await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:false});await delay(150);await click('.portal-menu');await delay(250);await click('.portal-sidebar [data-page=tests]');await delay(250);assert.ok(await evaluate("!document.querySelector('.portal-sidebar').classList.contains('is-open')"))
    await fill({'portal-search':lang==='ar'?'\u0641\u064a\u062a\u0627\u0645\u064a\u0646 \u062f':'Vitamin D'});await click('.portal-search button');await waitFor("!!document.querySelector('.portal-test-grid')");assert.equal(await evaluate("document.querySelectorAll('.portal-test-card').length"),1)
    await click('.portal-account > button');await textClick(c.profile,'.portal-account-menu button');await waitFor("!!document.querySelector('.portal-form')")
    await click('.portal-account > button');await textClick(c.logout,'.portal-account-menu button');await waitFor("!!document.querySelector('.auth-tabs')")
  }
  assert.ok(!requests.some(r=>r.method==='POST'),'No fake requests')
  assert.ok(await evaluate("Object.keys(localStorage).every(k=>k==='smart-lims.language')&&sessionStorage.length===0"),'No sensitive persistence')
  for (const page of ['dashboard','tests','orders','book','appointments','results','notifications','profile']) {
    await evaluate(`location.hash='#/patient/${page}'`);await waitFor("!!document.querySelector('.portal-access [role=alert]')")
    assert.ok(await evaluate("!document.querySelector('.portal-sidebar,.portal-report,.portal-stats')"),'Real route stays protected')
  }
  await send('Page.navigate',{url:'http://localhost:4173/#/__portal/dashboard'});await waitFor("!!document.querySelector('.tech-hero')");assert.ok(await evaluate("!document.querySelector('.patient-portal')"),'No dev portal in production')
  assert.deepEqual(exceptions,[])
  console.log('All 12 portal pages passed in EN/AR at 320/768/1440px: navigation, validation, search/filter, cart/order, calendar booking/reschedule/cancel/dialogs, publication gating, PDF signature/download, print action, notifications, profile editing, mobile sidebar, no API writes/storage, real route guards, and production DEV exclusion.')
  await send('Browser.close')
} finally { clearInterval(keepAlive);socket?.close();browser.kill() }
