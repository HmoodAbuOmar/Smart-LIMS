// Run dev on localhost:5173 and the production build server on localhost:4173.
// Override CHROME_PATH and AUTH_TEST_URL for other local environments.
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
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
  const waitFor=async expression=>{for(let i=0;i<200;i++){if(await evaluate(expression))return;await delay(75)}console.log('UI failure',await evaluate('({url:location.href,body:document.body.innerText.slice(0,1200),resources:performance.getEntriesByType("resource").slice(-8).map(r=>r.name)})'),exceptions);assert.fail('UI timeout: '+expression)}
  const click=async(selector,index=0)=>{
    const point=await evaluate(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(el=>el.getClientRects().length)[${index}];if(!el)throw Error('Visible control missing');el.scrollIntoView({block:'center',behavior:'instant'});const b=el.getBoundingClientRect();const hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);if(!el.contains(hit))throw Error('Control is blocked');return {x:b.left+b.width/2,y:b.top+b.height/2}})()`)
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point})
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point})
    await delay(50)
  }
  const fill=async values=>{for(const [field,value] of Object.entries(values)){await evaluate(`(()=>{const el=document.querySelector('[name="${field}"]');const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`)}}
  const textClick=async(text,selector='button')=>{await evaluate(`(()=>{document.querySelector('[data-copy-click]')?.removeAttribute('data-copy-click');const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(el=>el.getClientRects().length&&el.textContent.trim()===${JSON.stringify(text)});if(!el)throw Error('Missing '+${JSON.stringify(text)});el.setAttribute('data-copy-click','yes')})()`);await click('[data-copy-click=yes]')}
  const audit=async(lang,page)=>{assert.ok(!/development|preview|demo\b|mock\b|simulat|illustrative/i.test(await evaluate("(()=>{const el=document.body.cloneNode(true);el.querySelectorAll('.dev-walkthrough-indicator').forEach(n=>n.remove());return el.textContent})()")),lang+' '+page+' clean copy');if(await evaluate("location.port==='4173'"))assert.ok(await evaluate("!document.body.innerText.includes('SAMPLE-')"));for(const width of [320,768,1440]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await delay(250);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),lang+' '+page+' fits '+width)}}

  for(const lang of ['en','ar']){
    const c=portalResources[lang]
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:'about:blank'});await send('Page.navigate',{url:'http://localhost:5173/#/onboarding/dashboard'})
    await waitFor("!!document.querySelector('.portal-stats')");await click('.language-switcher__segment',lang==='ar'?0:1)
    const nav=async page=>{await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await click('.portal-sidebar [data-page='+page+']');await delay(80)}
    await audit(lang,'fixture dashboard')
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.portal-stat strong')].map(el=>el.textContent)"),[9,1,33,3].map(n=>new Intl.NumberFormat(lang).format(n)))
    await nav('tests');assert.equal(await evaluate("document.querySelectorAll('.portal-test-card').length"),7)
    await fill({'test-search':lang==='en'?'Kidney':'\u0643\u0644\u0649'});assert.equal(await evaluate("document.querySelectorAll('.portal-test-card').length"),1)
    await fill({'test-search':''});await fill({'test-category':'kidney'});assert.equal(await evaluate("document.querySelectorAll('.portal-test-card').length"),1)
    await fill({'test-category':'all'});await click('.portal-test-card button.is-secondary');await waitFor("!!document.querySelector('.portal-test-details') || !!document.querySelector('.portal-detail-grid')")
    await nav('orders');assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"),9)
    for(const [status,count]of [['pending',1],['inProgress',1],['completed',6],['cancelled',1]]){await textClick(c[status],'.portal-filter-tabs button');assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"),count)}
    await textClick(c.all,'.portal-filter-tabs button');await audit(lang,'orders')
    await nav('appointments');assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"),1)
    await textClick(c.past,'.portal-filter-tabs button');assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"),7);await audit(lang,'appointments')
    await nav('results');assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"),34)
    await textClick(c.viewResult,'tbody button');await waitFor("!!document.querySelector('.portal-report')");assert.ok(await evaluate("document.querySelector('.portal-report').innerText.includes('SAMPLE-P001')"));await audit(lang,'report')
    await nav('history');assert.equal(await evaluate("document.querySelectorAll('.history-visit').length"),6);await audit(lang,'archive')
    await nav('profile');assert.equal(await evaluate("document.querySelector('[name=name]').value"),'Sample Patient');await audit(lang,'profile');await textClick(c.edit,'.portal-heading button');await fill({name:'Sample Patient Edited'});await textClick(c.save,'.portal-form button');await nav('dashboard');await nav('profile');assert.equal(await evaluate("document.querySelector('[name=name]').value"),'Sample Patient Edited','Profile edits survive navigation')
    await nav('notifications');assert.equal(await evaluate("document.querySelectorAll('.portal-notifications article').length"),4)
    await textClick(c.markAll);assert.equal(await evaluate("document.querySelectorAll('.portal-notifications article.is-unread').length"),0)
    await nav('tests');await click('.portal-test-card button:not(.is-secondary):not(:disabled)');await waitFor("!!document.querySelector('.portal-calendar')")
    await textClick(c.addMore,'.booking-summary button');await waitFor("!!document.querySelector('.portal-test-grid')");await click('.portal-test-card button:not(.is-secondary):not(:disabled)');await waitFor("!!document.querySelector('.portal-calendar')")
    assert.equal(await evaluate("document.querySelectorAll('.booking-summary li').length"),2)
    const day=new Date();day.setDate(day.getDate()+3);if(day.getDay()===5)day.setDate(day.getDate()+1);const date=day.getFullYear()+'-'+String(day.getMonth()+1).padStart(2,'0')+'-'+String(day.getDate()).padStart(2,'0')
    await fill({'appointment-date':date});await textClick('08:00','.portal-slots button');await textClick(c.bookingContinue);await textClick(c.bookingConfirm,'dialog button');await waitFor("!!document.querySelector('.booking-payment-options')")
    await click('input[value=laboratory]');await textClick(c.confirmBooking,'.portal-actions button');
    assert.ok((await evaluate("document.querySelector('dialog').innerText")).includes(c.bookingFinalReview));assert.ok((await evaluate("document.querySelector('dialog').innerText")).includes(c.laboratory));
    assert.equal(await evaluate("document.querySelectorAll('dialog .booking-summary li').length"),2);
    assert.ok(await evaluate("document.querySelector('dialog').innerText.includes(document.querySelector('.portal-account-name').textContent)"),'Final review includes patient name');
    await textClick(c.bookingEdit,'dialog button');assert.ok(await evaluate("!document.querySelector('dialog')"),'Cancel preserves payment form');
    await textClick(c.confirmBooking,'.portal-actions button');await textClick(c.confirmBooking,'dialog button');await waitFor("!!document.querySelector('.booking-receipt')")
    assert.ok((await evaluate("document.querySelector('.booking-receipt').innerText")).includes(c.bookingAwaiting),'No real booking claimed');
    assert.ok((await evaluate("document.querySelector('.booking-receipt [role=alert]').innerText")).includes(c.bookingUnavailable),'Unavailable operation is not hidden');
    const requestId=await evaluate("JSON.parse(sessionStorage.getItem('smart-lims.dev-portal.v1')).draft.requestId");const pendingOrigin=await evaluate('performance.timeOrigin');await send('Page.reload',{ignoreCache:true});await waitFor('performance.timeOrigin!=='+pendingOrigin);await waitFor("!!document.querySelector('.booking-receipt')");
    assert.ok(await evaluate("document.querySelector('.booking-receipt').innerText.includes('08:00')"),'Pending time survives refresh');assert.equal(await evaluate("JSON.parse(sessionStorage.getItem('smart-lims.dev-portal.v1')).draft.requestId"),requestId,'Retry identity survives refresh');assert.equal(await evaluate("document.querySelectorAll('.booking-receipt-tests li').length"),2);
    await textClick(c.retry,'.portal-actions button');await click('input[value=online]');await waitFor("!!document.querySelector('.booking-card-form')");
    assert.equal(await evaluate("document.querySelectorAll('[data-hosted-field]').length"),4);assert.equal(await evaluate("document.querySelector('[name=receipt-email]').value"),'patient@example.invalid');
    assert.ok(await evaluate("document.querySelector('.portal-actions button:not(.is-secondary)').innerText.includes('45.00')"));
    await fill({'receipt-email':''});await click('.portal-actions button:not(.is-secondary)');assert.ok(await evaluate("document.querySelector('[name=receipt-email]').getAttribute('aria-invalid')==='true'"));
    await fill({'receipt-email':'receipt@example.test'});await click('.portal-actions button:not(.is-secondary)');await waitFor("!!document.querySelector('.portal-error[role=alert]')");
    assert.ok((await evaluate("document.querySelector('.portal-card > .portal-error').innerText")).includes(c.cardUnavailable));assert.ok(await evaluate("!document.querySelector('dialog,[name=card],[name=cvv],input[autocomplete=cc-number],input[autocomplete=cc-csc]')"));
    await audit(lang,'hosted card form');assert.ok(await evaluate("!JSON.stringify(sessionStorage).includes('receipt@example.test')"),'Receipt email is not persisted');
    await nav('orders');assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"),9,'No phantom order')
    const origin=await evaluate('performance.timeOrigin');await send('Page.reload',{ignoreCache:true});await waitFor('performance.timeOrigin!=='+origin);await waitFor("!!document.querySelector('.portal-page-title')")
    await nav('tests');assert.equal(await evaluate("document.querySelectorAll('.portal-test-card').length"),7,'Fixtures survive refresh')
    await nav('notifications');assert.equal(await evaluate("document.querySelectorAll('.portal-notifications article.is-unread').length"),0,'Read state survives refresh')
    await nav('dashboard');assert.equal(await evaluate("document.querySelectorAll('.portal-stat').length"),4)
    // Restore read state only in this browser test's own tab for the next language.
    await evaluate("sessionStorage.removeItem('smart-lims.dev-portal.v1')")
  }
  for(const url of ['http://localhost:5173/#/patient/dashboard','http://localhost:4173/#/patient/dashboard']){await send('Page.navigate',{url:'about:blank'});await send('Page.navigate',{url});await waitFor("!!document.querySelector('.portal-access [role=alert]')");assert.ok(await evaluate("!document.querySelector('.portal-sidebar')"))}
  assert.ok(!requests.some(r=>r.method==='POST'));assert.deepEqual(exceptions,[])
  console.log('Original fixture regression passed EN/AR: 7 tests, 9 orders/status filters, 8 appointments, 34 reports, 6 visits, profile, dashboard counts, notifications, cart, pending lab checkout/unconfigured hosted-card handling, refresh, responsive layouts, and protected routes.')
  await send('Browser.close')
} finally {clearInterval(keepAlive);socket?.close();browser.kill()}
