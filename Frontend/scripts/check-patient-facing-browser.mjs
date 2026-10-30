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
  const forbidden=/development|preview|demo\b|mock\b|simulat|illustrative|\u062a\u0637\u0648\u064a\u0631\u064a|\u0646\u0645\u0648\u0630\u062c\u064a|\u062a\u062c\u0631\u064a\u0628\u064a|\u0645\u0639\u0627\u064a\u0646\u0629|\u0645\u062d\u0627\u0643\u0627\u0629/i
  const textClick=async(text,selector='button')=>{await evaluate(`(()=>{document.querySelector('[data-copy-click]')?.removeAttribute('data-copy-click');const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(el=>el.getClientRects().length&&el.textContent.trim()===${JSON.stringify(text)});if(!el)throw Error('Missing '+${JSON.stringify(text)});el.setAttribute('data-copy-click','yes')})()`);await click('[data-copy-click=yes]')}
  const audit=async(lang,page)=>{assert.ok(!forbidden.test((await evaluate('document.body.innerText')).replaceAll('\u0645\u0631\u064a\u0636 \u0646\u0645\u0648\u0630\u062c\u064a','')),lang+' '+page+' clean copy');if(await evaluate("location.port==='4173'"))assert.ok(await evaluate("!document.body.innerText.includes('SAMPLE-')"));for(const width of [320,768,1440]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await delay(250);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),lang+' '+page+' fits '+width)}}
  for(const lang of ['en','ar']){
    const c=portalResources[lang]
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:'about:blank'});await send('Page.navigate',{url:'http://localhost:4173/'})
    await waitFor("!!document.querySelector('.tech-hero')");await click('.language-switcher__segment',lang==='ar'?0:1);await audit(lang,'home');await click('.nav-cta');await waitFor("!!document.querySelector('.registration-form')");assert.equal(await evaluate('location.hash'),'#/signup');await audit(lang,'signup')
    await fill({name:'Patient Input',email:'patient@example.test',password:'StrongPassword9!',confirmPassword:'StrongPassword9!'});await click('.auth-submit[type=submit]');await waitFor("!!document.querySelector('form [role=alert]')");assert.equal(await evaluate('location.hash'),'#/signup','No fake account creation')
    await evaluate("location.hash='#/verify-email'");await waitFor("!!document.querySelector('.email-verification-card')");await audit(lang,'email verification');assert.ok(await evaluate("!document.querySelector('.email-verification-address') && !document.querySelector('.lucide-circle-check-big')"))
    await evaluate("location.hash='#/login'");await waitFor("!!document.getElementById('auth-email')");await fill({email:'patient@example.test',password:'anything'});await click('.auth-submit[type=submit]');await waitFor("!!document.querySelector('form [role=alert]')");assert.equal(await evaluate('location.hash'),'#/login');await audit(lang,'login')
    await send('Page.navigate',{url:'http://localhost:5173/#/__portal/dashboard'});await waitFor("!!document.querySelector('.portal-page-title')");await click('.language-switcher__segment',lang==='ar'?0:1)
    for(const page of ['dashboard','tests','orders','appointments','results','history','history?view=trends','notifications','profile','book','payment','booking-confirmation/pending']){
      await evaluate(`location.hash='#/__portal/${page}'`);await waitFor("!!document.querySelector('.portal-page-title')");await delay(100);await audit(lang,page)
      assert.ok(await evaluate("!document.querySelector('.booking-simulator')"),'No payment outcome selector')
    }
    // Explicit developer-only component test, not a website route. Real rejecting
    // adapters are used; no fake response or authentication token is injected.
    await evaluate("import('/src/dev/mountPatientCopyHarness.js').then(m=>m.mountPatientCopyHarness())")
    await waitFor("!!document.querySelector('.portal-test-card')");await click('.portal-test-card button:not(.is-secondary)');await waitFor("!!document.querySelector('.booking-summary')")
    await textClick(c.addMore,'.booking-summary button');await waitFor("!!document.querySelector('.portal-test-card')");await click('.portal-test-card button:not(.is-secondary):not(:disabled)');await waitFor("!!document.querySelector('.portal-calendar')")
    const day=new Date();day.setDate(day.getDate()+3);if(day.getDay()===5)day.setDate(day.getDate()+1);const date=`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`
    await fill({'appointment-date':date});await textClick('10:00','.portal-slots button');await textClick(c.bookingContinue);await textClick(c.bookingConfirm,'dialog button');await waitFor("!!document.querySelector('.booking-payment-options')");await audit(lang,'payment controls')
    assert.ok(await evaluate("!document.querySelector('.booking-simulator,input[name=card],input[name=cvv]')"))
    await click('input[value=online]');await waitFor("!!document.querySelector('.booking-card-form')");await fill({'receipt-email':'receipt@example.test'});await click('.portal-actions button:not(.is-secondary)');await waitFor("!!document.querySelector('.portal-card > .portal-error')");
    assert.ok((await evaluate("document.querySelector('.portal-card > .portal-error').innerText")).includes(c.cardUnavailable));assert.ok(await evaluate("!document.querySelector('dialog')"));await audit(lang,'hosted card unavailable');
    await click('input[value=laboratory]');assert.ok(await evaluate("!document.querySelector('.booking-card-form')"));await textClick(c.confirmBooking,'.portal-actions button');await textClick(c.confirmBooking,'dialog button');await waitFor("!!document.querySelector('.booking-receipt')");await audit(lang,'pending laboratory');
    await textClick(c.viewAppointments);await waitFor("!!document.querySelector('.portal-empty')");assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"),0,'No phantom booking')
    await click('.portal-sidebar [data-page=orders]');await waitFor("!!document.querySelector('.portal-empty')");assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"),0,'No phantom order')
  }
  assert.ok(!requests.some(r=>r.method==='POST'))
  assert.ok(await evaluate("Object.keys(localStorage).every(k=>k==='smart-lims.language')&&Object.keys(sessionStorage).every(k=>k==='smart-lims.dev-portal.v1')"))
  for(const path of ['dashboard','history','payment']){await send('Page.navigate',{url:'about:blank'});await send('Page.navigate',{url:'http://localhost:5173/#/patient/'+path});await waitFor("!!document.querySelector('.portal-access [role=alert]')");assert.ok(await evaluate("!document.querySelector('.portal-sidebar')"))}
  await send('Page.navigate',{url:'http://localhost:4173/'});await waitFor("!!document.querySelector('.tech-hero')");await click('.nav-cta');await waitFor("!!document.querySelector('.registration-form')");assert.equal(await evaluate('location.hash'),'#/signup')
  assert.deepEqual(exceptions,[])
  console.log('Patient-facing browser checks passed in EN/AR at 320/768/1440px: clean copy, real production auth errors/guards, isolated original fixtures, hosted field slots and receipt email, blocked unconfigured online payment, pending laboratory requests, retained selections, and no raw card inputs, storage or fabricated transactions.')
  await send('Browser.close')
} finally {clearInterval(keepAlive);socket?.close();browser.kill()}
