// Run dev on localhost:5173 and the production build server on localhost:4173.
// Override CHROME_PATH and AUTH_TEST_URL for other local environments.
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
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
  const textClick=async(text,selector='button')=>{await evaluate(`(()=>{document.querySelector('[data-click-target]')?.removeAttribute('data-click-target');const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(el=>el.getClientRects().length&&el.textContent.trim()===${JSON.stringify(text)});if(!el)throw Error('Missing: '+${JSON.stringify(text)});el.setAttribute('data-click-target','yes')})()`);await click('[data-click-target=yes]')}
  const nav=async page=>{if(await evaluate('innerWidth<=850')){await click('.portal-menu');await delay(250)}await click(`.portal-sidebar [data-page="${page}"]`);await delay(100)}
  const inspect=async(lang,page)=>{for(const width of [320,768,1440]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await delay(250);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),lang+' '+page+' fits '+width);if(process.env.AUTH_TEST_SCREENSHOTS&&[320,1440].includes(width)){await evaluate('scrollTo(0,0)');const shot=await send('Page.captureScreenshot',{format:'png'});const file=join(profile,lang+'-booking-'+page+'-'+width+'.png');writeFileSync(file,Buffer.from(shot.data,'base64'));console.log('Screenshot: '+file)}}}
  const future=days=>{const d=new Date();d.setDate(d.getDate()+days);if(d.getDay()===5)d.setDate(d.getDate()+1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
  for(const lang of ['en','ar']){
    const c=portalResources[lang], firstDate=future(3), secondDate=future(6)
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
    await send('Page.navigate',{url:'about:blank'});await send('Page.navigate',{url:'http://localhost:5173/#/__portal/dashboard'});await waitFor("!!document.querySelector('.portal-stats')")
    await click('.portal-sidebar .language-switcher__segment',lang==='ar'?0:1)
    await nav('orders');const baselineOrders=await evaluate("document.querySelectorAll('tbody tr').length");await nav('tests');await click('.portal-test-card button:not(.is-secondary):not(:disabled)');await waitFor("!!document.querySelector('.booking-summary')")
    assert.ok(await evaluate("document.querySelector('.booking-summary').innerText.includes('25.00')"))
    await fill({'appointment-date':firstDate});await textClick('10:00','.portal-slots button')
    await textClick(c.addMore,'.booking-summary button');await waitFor("!!document.querySelector('.portal-test-grid')")
    assert.ok(await evaluate("document.querySelector('.portal-test-card button:not(.is-secondary)').disabled"),'Duplicate selection disabled')
    await click('.portal-test-card button:not(.is-secondary):not(:disabled)');await waitFor("!!document.querySelector('.booking-summary')")
    assert.equal(await evaluate("document.querySelector('[name=appointment-date]').value"),firstDate)
    assert.equal(await evaluate("document.querySelector('.portal-slots [aria-pressed=true]').textContent"),'10:00')
    assert.equal(await evaluate("document.querySelectorAll('.booking-summary li').length"),2)
    assert.ok(await evaluate("document.querySelector('.booking-total').innerText.includes('45.00')"))
    await fill({'appointment-date':secondDate});assert.ok(await evaluate("!document.querySelector('.portal-slots [aria-pressed=true]')"))
    await textClick('11:00','.portal-slots button');await inspect(lang,'selection')
    await textClick(c.bookingContinue);await waitFor("!!document.querySelector('dialog[open]')");await textClick(c.bookingEdit,'dialog button');assert.ok(await evaluate("!document.querySelector('dialog[open]')"))
    await nav('orders');assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"),baselineOrders,'No records before final payment decision')
    await nav('appointments');assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"),1)
    await textClick(c.book,'.portal-heading button');await waitFor("!!document.querySelector('.booking-summary')")
    assert.equal(await evaluate("document.querySelector('[name=appointment-date]').value"),secondDate)
    await textClick(c.bookingContinue);await textClick(c.bookingConfirm,'dialog button');await waitFor("!!document.querySelector('.booking-payment-options')")
    await click('input[value=laboratory]');await textClick(c.bookingEdit,'.portal-actions button');await waitFor("!!document.querySelector('.portal-calendar')")
    assert.equal(await evaluate("document.querySelector('.portal-slots [aria-pressed=true]').textContent"),'11:00')
    await textClick(c.bookingContinue);await textClick(c.bookingConfirm,'dialog button');await waitFor("!!document.querySelector('.booking-payment-options')")
    assert.ok(await evaluate("document.querySelector('input[value=laboratory]').checked"))
    await inspect(lang,'payment-laboratory');await textClick(c.confirmBooking,'.portal-actions button');await waitFor("!!document.querySelector('dialog[open]')")
    await textClick(c.back,'dialog button');assert.ok(await evaluate("!document.querySelector('dialog[open]')"))
    await textClick(c.confirmBooking,'.portal-actions button');await waitFor("!!document.querySelector('dialog[open]')")
    await evaluate("(()=>{const b=document.querySelector('dialog .portal-actions button:last-child');b.click();b.click()})()")
    await waitFor("!!document.querySelector('.booking-receipt')");await inspect(lang,'laboratory-confirmation')
    assert.equal(await evaluate("document.querySelectorAll('.booking-receipt-tests li').length"),2)
    assert.ok(await evaluate(`document.querySelector('.booking-receipt').innerText.includes(${JSON.stringify(c.sampleLaboratoryPending)})`))
    assert.ok(await evaluate("document.querySelector('.booking-receipt').innerText.includes('11:00') && document.querySelector('.booking-receipt').innerText.includes('45.00')"))
    await textClick(c.viewBooking);await waitFor("!!document.querySelector('.booking-receipt')");assert.ok(await evaluate("!document.querySelector('.booking-success')"))
    await nav('orders');assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"),baselineOrders+1,'Double submit creates one order')
    await nav('appointments');assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"),2,'Double submit creates one appointment')
    // A declined online attempt must be recoverable without a phantom record.
    await nav('tests');await click('.portal-test-card button:not(.is-secondary):not(:disabled)');await waitFor("!!document.querySelector('.portal-calendar')")
    await fill({'appointment-date':future(9)});await textClick('09:00','.portal-slots button');await textClick(c.bookingContinue);await textClick(c.bookingConfirm,'dialog button')
    await waitFor("!!document.querySelector('.booking-payment-options')");await click('input[value=online]');await fill({'simulation-outcome':'declined'})
    assert.ok(await evaluate("!document.querySelector('input[name=card],input[name=cvv],input[autocomplete=cc-number],input[autocomplete=cc-csc]')"))
    await textClick(c.confirmPay,'.portal-actions button');await waitFor("!!document.querySelector('dialog[open]')");await textClick(c.cancel,'dialog button')
    await textClick(c.confirmPay,'.portal-actions button');await textClick(c.confirmPay,'dialog button');await waitFor("!!document.querySelector('.portal-error[role=alert]')")
    assert.ok(await evaluate(`document.querySelector('[role=alert]').textContent===${JSON.stringify(c.simulatedFailure)}`));assert.ok(await evaluate("!document.querySelector('.booking-receipt')"))
    await inspect(lang,'online-declined');await fill({'simulation-outcome':'approved'});await textClick(c.confirmPay,'.portal-actions button');await textClick(c.confirmPay,'dialog button');await waitFor("!!document.querySelector('.booking-receipt')")
    assert.ok(await evaluate(`document.querySelector('.booking-receipt').innerText.includes(${JSON.stringify(c.sampleOnlinePaid)})`));await inspect(lang,'online-approved')
    await nav('orders');assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"),baselineOrders+2,'Decline did not create an order')
    // Connectivity failure -> choose pay at laboratory, keeping the selection.
    await nav('tests');await click('.portal-test-card button:not(.is-secondary):not(:disabled)');await waitFor("!!document.querySelector('.portal-calendar')");await fill({'appointment-date':future(12)});await textClick('13:00','.portal-slots button');await textClick(c.bookingContinue);await textClick(c.bookingConfirm,'dialog button')
    await waitFor("!!document.querySelector('.booking-payment-options')");await click('input[value=online]');await fill({'simulation-outcome':'unavailable'});await textClick(c.confirmPay,'.portal-actions button');await textClick(c.confirmPay,'dialog button');await waitFor("!!document.querySelector('.portal-error[role=alert]')")
    await click('input[value=laboratory]');await textClick(c.confirmBooking,'.portal-actions button');await textClick(c.confirmBooking,'dialog button');await waitFor("!!document.querySelector('.booking-receipt')")
    await textClick(c.viewAppointments);await waitFor("!!document.querySelector('tbody')");assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"),4)
    await nav('orders');assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"),baselineOrders+3)
    await nav('dashboard');await textClick(c.book,'.portal-quick button');await waitFor("!!document.querySelector('.portal-page-title')")
    assert.ok(await evaluate("!document.querySelector('.booking-payment-options')"),'Completed checkout cannot be replayed')
  }
  assert.ok(!requests.some(r=>r.method==='POST'),'No fake payment or booking requests')
  assert.ok(await evaluate("Object.keys(localStorage).every(k=>k==='smart-lims.language')&&sessionStorage.length===0"))
  for(const route of ['payment','booking-confirmation/test','appointments/test']){await evaluate(`location.hash='#/patient/${route}'`);await waitFor("!!document.querySelector('.portal-access [role=alert]')");assert.ok(await evaluate("!document.querySelector('.booking-payment-options,.booking-receipt')"))}
  assert.deepEqual(exceptions,[])
  console.log('Connected booking passed in AR/EN at 320/768/1440px: automatic navigation, multiple tests/no duplicates, draft/date/time preservation, cancelled dialogs, laboratory payment, online decline/retry/approval, connection-failure fallback, dynamic receipts, linked orders/appointments, duplicate-submit protection, no card fields/storage/API writes, and real route guards.')
  await send('Browser.close')
} finally {clearInterval(keepAlive);socket?.close();browser.kill()}
