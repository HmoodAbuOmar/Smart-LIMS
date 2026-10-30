// Run dev on localhost:5173 and the production build server on localhost:4173.
// Override CHROME_PATH and AUTH_TEST_URL for other local environments.
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

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
  const audit=async(lang,page)=>{assert.ok(!forbidden.test((await evaluate('document.body.innerText')).replaceAll('\u0645\u0631\u064a\u0636 \u0646\u0645\u0648\u0630\u062c\u064a','')),lang+' '+page+' clean copy');if(await evaluate("location.port==='4173'"))assert.ok(await evaluate("!document.body.innerText.includes('SAMPLE-')"));for(const width of [320,768,1440]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await delay(250);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),lang+' '+page+' fits '+width)}}
  for(const lang of ['en','ar']){
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:'about:blank'});await send('Page.navigate',{url:'http://localhost:4173/#/login'})
    await waitFor("!!document.getElementById('auth-email')");await click('.language-switcher__segment',lang==='ar'?0:1);await audit(lang,'real login')
    await click('.auth-submit[type=submit]');assert.equal(await evaluate("document.querySelectorAll('[aria-invalid=true]').length"),2)
    await fill({email:'patient@example.test',password:'ExistingPassword9!'});await click('.auth-submit[type=submit]');await waitFor("!!document.querySelector('form [role=alert]')");assert.equal(await evaluate('location.hash'),'#/login')
    await click('.auth-password-toggle');assert.equal(await evaluate("document.querySelector('[name=password]').type"),'text');await click('.auth-password-toggle')
    await click('a[href="#/signup"]');await waitFor("!!document.querySelector('.registration-form')");await click('.auth-submit[type=submit]');assert.equal(await evaluate("document.querySelectorAll('[aria-invalid=true]').length"),4)
    await fill({name:'Patient Account',email:'patient@example.test',password:'StrongPassword9!',confirmPassword:'DifferentPassword9!'});await click('.auth-submit[type=submit]');assert.ok(await evaluate("document.querySelector('[name=confirmPassword]').getAttribute('aria-invalid')==='true'"))
    await fill({confirmPassword:'StrongPassword9!'});await click('.auth-submit[type=submit]');await waitFor("!!document.querySelector('form [role=alert]')");assert.equal(await evaluate('location.hash'),'#/signup');await audit(lang,'real account signup')
    await evaluate("location.hash='#/verify-email'");await waitFor("!!document.querySelector('.email-verification-card')");assert.ok(await evaluate("document.querySelector('.email-verification-card button[type=submit]').disabled"));assert.equal(await evaluate("document.querySelectorAll('.email-verification-card input').length"),0,'No invented OTP/code-entry screen');await audit(lang,'pending verification')
    await click('.email-verification-card a.auth-switch');await waitFor("!!document.getElementById('auth-email')")
    await click('a[href="#/forgot-password"]');await waitFor("!!document.getElementById('recovery-email')");await click('.auth-submit[type=submit]');assert.ok(await evaluate("document.querySelector('[name=email]').getAttribute('aria-invalid')==='true'"))
    await fill({email:'patient@example.test'});await click('.auth-submit[type=submit]');await waitFor("!!document.querySelector('form [role=alert]')");assert.equal(await evaluate('location.hash'),'#/forgot-password');await audit(lang,'forgot password')
    await evaluate("location.hash='#/reset-password'");await waitFor("!!document.getElementById('recovery-password')");await click('.auth-submit[type=submit]');assert.equal(await evaluate("document.querySelectorAll('[aria-invalid=true]').length"),2)
    await fill({password:'StrongPassword9!',confirmPassword:'StrongPassword9!'});await click('.auth-submit[type=submit]');await waitFor("!!document.querySelector('form [role=alert]')");assert.equal(await evaluate('location.hash'),'#/reset-password');assert.ok(await evaluate("!document.querySelector('.auth-supporting')"),'No fake reset success');await audit(lang,'reset password invalid link')
    await evaluate("location.hash='#/verify-email?token=untrusted-negative-test'");await waitFor("!!document.querySelector('.email-verification-card [role=alert]')");assert.equal(await evaluate('location.hash'),'#/verify-email');assert.ok(await evaluate("!document.querySelector('a.auth-submit')"),'No fake verified status')
    await evaluate("location.hash='#/patient/file/new'");await waitFor("!!document.querySelector('[role=alert]')");assert.ok(await evaluate("!document.querySelector('.registration-form')"),'Patient-file authorization remains closed')
  }
  assert.ok(!requests.some(request=>request.method==='POST'));assert.deepEqual(exceptions,[])
  assert.ok(await evaluate("Object.keys(localStorage).every(k=>k==='smart-lims.language')&&sessionStorage.length===0"))
  console.log('Auth module browser checks passed EN/AR at 320/768/1440px: login/signup validation and visibility, honest unavailable services, pending/invalid verification, forgot/reset password validation and failure states, navigation, protected patient routes and no new sessions/API writes.')
  await send('Browser.close')
} finally {clearInterval(keepAlive);socket?.close();browser.kill()}
