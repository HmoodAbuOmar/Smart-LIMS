// Run against an existing Vite server; Chrome/Chromium must be installed.
// Override CHROME_PATH and AUTH_TEST_URL for other local environments.
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
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
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "localStorage.setItem('smart-lims.language', 'en')" })
  const base = process.env.AUTH_TEST_URL || 'http://localhost:5173/'
  await send('Page.navigate', { url: base + '#/signup' })
  const waitFor = async expression => {
    for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await delay(75) }
    assert.fail('Timed out waiting for UI: ' + expression)
  }
  await waitFor("!!document.querySelector('.registration-form')")
  const navigate = async hash => {
    await evaluate('location.hash = ' + JSON.stringify(hash))
    await delay(400)
    await waitFor("!!document.getElementById('auth-heading')")
  }
  const fill = async values => {
    for (const [field, value] of Object.entries(values)) {
      await evaluate(`(() => { const element = document.querySelector('[name="${field}"]'); const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype,'value').set.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', {bubbles:true})); })()`)
    }
  }
  const submit = async () => {
    await evaluate("document.querySelector('form button[type=submit]').click()")
    await waitFor("document.querySelector('form')?.getAttribute('aria-busy') !== 'true'")
  }
  const account = { name: 'Patient Test', email: 'patient@example.com', password: 'StrongPass9!', confirmPassword: 'StrongPass9!' }
  await submit()
  assert.equal(await evaluate("document.querySelectorAll('[aria-invalid=true]').length"),4)
  assert.equal(await evaluate('document.activeElement.name'),'name')
  await fill(account)
  await submit()
  assert.equal(await evaluate('location.hash'),'#/signup')
  assert.ok(await evaluate("document.querySelector('form [role=alert]').textContent.includes('your account')"))
  assert.ok(await evaluate("!document.querySelector('.registration-success')"))
  await evaluate("document.querySelector('[aria-controls=registration-password]').click()")
  assert.equal(await evaluate("document.getElementById('registration-password').type"),'text')
  await evaluate("document.querySelector('[aria-controls=registration-password]').click()")
  await evaluate("document.querySelector('.language-switcher__trigger').click()")
  await evaluate("document.querySelectorAll('[role=menuitemradio]')[0].click()")
  assert.equal(await evaluate('document.documentElement.dir'),'rtl')
  assert.equal(await evaluate("document.getElementById('registration-name').value"),account.name)
  assert.ok(await evaluate("/[\\u0600-\\u06ff]/.test(document.querySelector('form [role=alert]').textContent)"))
  await navigate('#/login')
  await submit()
  assert.equal(await evaluate("document.querySelectorAll('[aria-invalid=true]').length"),2)
  await fill({email:account.email,password:'existing-password'})
  await submit()
  assert.equal(await evaluate('location.hash'),'#/login')
  assert.ok(await evaluate("!!document.querySelector('form [role=alert]') && !document.querySelector('button[type=submit]').disabled"))
  // Protected routes must remain closed when the session service cannot confirm access.
  for (const route of ['#/patient/file','#/patient/file/new','#/patient/file/link','#/patient/dashboard']) {
    await navigate(route)
    await waitFor("!!document.querySelector('[role=alert]')")
    assert.equal(await evaluate("document.querySelectorAll('input,table,.workflow-choices').length"),0)
    assert.ok(await evaluate("!document.querySelector('.registration-success')"))
  }
  // A supplied link token is never considered valid without a backend response.
  await navigate('#/verify-email?token=untrusted-test-value')
  await waitFor("!!document.querySelector('[role=alert]')")
  assert.equal(await evaluate('location.hash'),'#/verify-email','Token removed from URL')
  assert.ok(await evaluate("!document.querySelector('a.auth-submit')"),'No verification confirmation')
  assert.equal(await evaluate("document.querySelectorAll('.email-verification-card input').length"),0)
  assert.ok(await evaluate("document.querySelector('.email-verification-card button[type=submit]').disabled"),'No invented recipient on a direct link')
  assert.ok(await evaluate("!document.querySelector('.email-verification-address')"),'No sample or inferred email')
  await navigate('#/forgot-password')
  await submit()
  assert.equal(await evaluate("document.querySelectorAll('[aria-invalid=true]').length"),1)
  await fill({email:account.email})
  await submit()
  assert.ok(await evaluate("!!document.querySelector('form [role=alert]')"))
  await navigate('#/reset-password?token=untrusted-test-value')
  assert.equal(await evaluate('location.hash'),'#/reset-password')
  await submit()
  assert.equal(await evaluate("document.querySelectorAll('[aria-invalid=true]').length"),2)
  await fill({password:account.password,confirmPassword:account.password})
  await submit()
  assert.ok(await evaluate("!!document.querySelector('form [role=alert]')"))
  const routes = ['#/login','#/signup','#/verify-email','#/forgot-password','#/reset-password']
  for (const language of ['en','ar']) {
    await evaluate("document.querySelector('.language-switcher__trigger').click()")
    await evaluate(`document.querySelectorAll('[role=menuitemradio]')[${language==='ar'?0:1}].click()`)
    for (const route of routes) {
      await navigate(route)
      assert.ok(await evaluate("!document.querySelector('[role=alert]')"),'No permanent operation errors')
      assert.ok(await evaluate("!document.querySelector('.auth-form-panel').innerText.match(/preview|demo|mock|backend|API not ready|معاينة|تجريبي|النظام الخلفي|فحص المسودة/i)"),'No prototype copy in real patient screens')
      for (const width of [320,390,820,1280]) {
        await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false})
        await delay(80)
        assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'),'No horizontal overflow')
        await evaluate("document.querySelector('.auth-tabs').scrollIntoView({block:'center'})")
        const geometry = await evaluate(`(() => {
          const r=s=>document.querySelector(s).getBoundingClientRect();const tabs=r('.auth-tabs'),card=r('.auth-card'),brand=r('.auth-branding'),active=r('.auth-tabs a[aria-current=page]');const rtl=document.documentElement.dir==='rtl';
          return { centered:Math.abs((tabs.top+tabs.bottom-card.top-card.bottom)/2)<3,
            ratio: (rtl?brand.left-active.left:active.right-brand.right)/active.width,
            clickable:[...document.querySelectorAll('.auth-tabs a')].every(link=>{const b=link.getBoundingClientRect();return !!document.elementFromPoint(b.left+b.width/2,b.top+b.height/2)?.closest('.auth-tabs')}),
            overlap:[...document.querySelectorAll('form input,form select')].some(input=>{const b=input.getBoundingClientRect();return active.left<b.right&&active.right>b.left&&active.top<b.bottom&&active.bottom>b.top}) }
        })()`)
        assert.ok(geometry.clickable && !geometry.overlap,'Tabs clickable and clear of fields')
        if(width>760) assert.ok(geometry.centered && Math.abs(geometry.ratio-.4)<.02,'Boundary tabs remain centered at 60/40 split')
        if(process.env.AUTH_TEST_SCREENSHOTS && [390,1280].includes(width)) {
          await evaluate('scrollTo(0,0)');await delay(100)
          const metrics=await send('Page.getLayoutMetrics')
          const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:metrics.cssContentSize.height,scale:1}})
          const path=join(profile,language+'-'+route.slice(2).replaceAll('/','-')+'-'+width+'.png')
          writeFileSync(path,Buffer.from(screenshot.data,'base64'));console.log('Screenshot: '+path)
        }
      }
    }
  }
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.auth-light-ribbons span'),'::after').animationName"),'none')
  assert.ok(!requests.some(request=>request.method==='POST'),'No guessed API requests')
  assert.ok(await evaluate("!JSON.stringify(localStorage).includes('untrusted-test-value') && !JSON.stringify(sessionStorage).includes('untrusted-test-value')"),'No stored link token')
  assert.deepEqual(exceptions,[])
  assert.ok(await evaluate("!JSON.stringify(localStorage).includes('StrongPass9!') && !JSON.stringify(sessionStorage).includes('StrongPass9!')"),'No stored password')
  console.log('Frontend browser checks passed: registration/login/recovery/resend failure paths, token scrubbing, protected routes fail closed, EN/AR, responsive tabs, no false success, guessed requests, stored secrets or runtime errors. No backend end-to-end flow was verified.')
  await send('Browser.close')
} finally { clearInterval(keepAlive);socket?.close();browser.kill() }
