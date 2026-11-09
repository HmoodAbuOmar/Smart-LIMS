// Run dev on localhost:5173 and the production build server on localhost:4173.
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
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') exceptions.push(message.params.args.map(arg => arg.value || arg.description).join(' '))
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
  const waitFor=async expression=>{for(let i=0;i<200;i++){if(await evaluate(expression))return;await delay(75)}assert.fail('UI timeout: '+expression)}
  const routes={signup:'#/signup','verify-email':'#/verify-email',login:'#/login','patient-file':'#/onboarding/file','create-file':'#/onboarding/file/new','link-file':'#/onboarding/file/link',dashboard:'#/onboarding/dashboard'}
  const step=async value=>{await waitFor(`document.querySelector('[data-walkthrough-step]')?.dataset.walkthroughStep===${JSON.stringify(value)}`);assert.equal(await evaluate('location.hash'),routes[value])}
  const click=async(selector,index=0)=>{
    const point=await evaluate(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(el=>el.getClientRects().length)[${index}];if(!el)throw Error('Visible control missing');el.scrollIntoView({block:'center',behavior:'instant'});const b=el.getBoundingClientRect();const hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);if(!el.contains(hit))throw Error('Control is blocked');return {x:b.left+b.width/2,y:b.top+b.height/2}})()`)
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point})
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point})
    await delay(50)
  }
  const fill=async values=>{for(const [field,value] of Object.entries(values)){await evaluate(`(()=>{const el=document.querySelector('[name="${field}"]');const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`)}}
  const submit=()=>click('.auth-form-panel form button[type=submit]')
  const back=()=>click('.walkthrough-links button:last-child')
  const inspect=async(language,screen)=>{
    assert.equal(await evaluate("document.querySelectorAll('.dev-walkthrough-indicator').length"),0)
    assert.ok(await evaluate("!document.querySelector('.auth-form-panel .dev-walkthrough-indicator') && !document.querySelector('.dev-preview-menu,.dev-preview-notice,.dev-preview-controls')"))
    for(const width of [320,390,1280]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await delay(70)
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),language+' '+screen+' fits '+width)
      if(process.env.AUTH_TEST_SCREENSHOTS&&[390,1280].includes(width)&&['verify-email','patient-file','dashboard'].includes(screen)){
        await evaluate('scrollTo(0,0)');await delay(60);const shot=await send('Page.captureScreenshot',{format:'png'});const path=join(profile,language+'-'+screen+'-'+width+'.png');writeFileSync(path,Buffer.from(shot.data,'base64'));console.log('Screenshot: '+path)
      }
    }
  }
  const account={name:'Walkthrough Test',email:'walkthrough@example.invalid',password:'Walkthrough9!',confirmPassword:'Walkthrough9!'}
  await send('Page.navigate',{url:'http://localhost:5173/'})
  await waitFor("!!document.querySelector('.tech-hero')")
  for(const language of ['en','ar']){
    await click('.language-switcher__segment',language==='ar'?0:1)
    await click('.nav-cta');await step('signup');await inspect(language,'signup')
    assert.ok(await evaluate("!document.querySelector('a[href*=__walkthrough]')"),'No testing links needed')
    await submit();assert.equal(await evaluate("document.querySelectorAll('[aria-invalid=true]').length"),4)
    await fill(account);await submit();await step('verify-email');await inspect(language,'verify-email')
    await evaluate('history.back()');await step('signup')
    assert.equal(await evaluate("document.querySelector('[name=password]').value"),'')
    await evaluate('history.forward()');await step('verify-email')
    assert.equal(await evaluate("document.querySelector('.email-verification-address').textContent"),account.email)
    assert.ok(await evaluate("!document.querySelector('.lucide-circle-check-big')"),'No fake verification confirmation')
    await click('.walkthrough-verification-navigation button.auth-switch');await step('signup')
    assert.equal(await evaluate("document.querySelector('[name=name]').value"),account.name)
    assert.equal(await evaluate("document.querySelector('[name=email]').value"),account.email)
    assert.equal(await evaluate("document.querySelector('[name=password]').value"),'','Password discarded on leaving signup')
    await fill({password:account.password,confirmPassword:account.password});await submit();await step('verify-email')
    await click('.email-verification-card form button[type=submit]')
    await click('.walkthrough-verification-navigation button.auth-submit');await step('login');await inspect(language,'login')
    assert.equal(await evaluate("document.querySelector('[name=email]').value"),account.email)
    await back();await step('verify-email');await click('.walkthrough-verification-navigation button.auth-submit');await step('login')
    await submit();assert.equal(await evaluate("document.querySelectorAll('[aria-invalid=true]').length"),1)
    await fill({password:'existing'});await submit();await step('patient-file');await inspect(language,'patient-file')
    await click('.auth-form-panel a.auth-switch');await step('login')
    assert.equal(await evaluate("document.querySelector('[name=email]').value"),account.email)
    assert.equal(await evaluate("document.querySelector('[name=password]').value"),'')
    await fill({password:'existing'});await submit();await step('patient-file')
    await click('.workflow-choice[href="#/patient/file/new"]');await step('create-file');await inspect(language,'create-file')
    await submit();assert.equal(await evaluate("document.querySelectorAll('[aria-invalid=true]').length"),4)
    const patient={name:'Walkthrough Patient',dateOfBirth:'2000-01-01',gender:'female',phone:'202-555-0100'}
    await fill(patient);await back();await step('patient-file')
    await click('.workflow-choice[href="#/patient/file/new"]');await step('create-file')
    for(const [field,value]of Object.entries(patient))assert.equal(await evaluate(`document.querySelector('[name="${field}"]').value`),value)
    await submit();await step('dashboard');await inspect(language,'dashboard')
    assert.ok(await evaluate("!!document.querySelector('.patient-portal')"))
    await click('.portal-onboarding-back');await step('create-file');await back();await step('patient-file')
    await click('.workflow-choice[href="#/patient/file/link"]');await step('link-file');await inspect(language,'link-file')
    await submit();assert.equal(await evaluate("document.querySelectorAll('[aria-invalid=true]').length"),1)
    await fill({fileIdentifier:'bad <file>'});await submit();await step('link-file')
    assert.equal(await evaluate("document.querySelectorAll('[aria-invalid=true]').length"),1)
    await fill({fileIdentifier:'LAB-123'});await submit();await step('dashboard')
    assert.equal(await evaluate('location.hash'),'#/onboarding/dashboard','Workflow never enters protected patient URLs')
    await click('.portal-onboarding-back');await step('link-file')
    assert.equal(await evaluate("document.querySelector('[name=fileIdentifier]').value"),'','Sensitive identifier is not retained')
    await back();await step('patient-file')
    // Reload restores only the route; no form data or session is persisted.
    for(const screen of ['signup','verify-email','login','patient-file','create-file','link-file','dashboard']){
      await evaluate(`location.hash=${JSON.stringify(routes[screen])}`);await step(screen)
      const origin=await evaluate('performance.timeOrigin')
      await send('Page.reload',{ignoreCache:true});await waitFor(`performance.timeOrigin!==${origin}`);await step(screen)
      assert.ok(await evaluate("[...document.querySelectorAll('.auth-form-panel input')].every(el=>el.value==='')"),'Refresh clears form data: '+screen)
      assert.ok(await evaluate("!document.querySelector('.email-verification-address,.email-verification-card .lucide-circle-check-big')"),'No fake verification on refresh')
      if(screen==='create-file'||screen==='link-file'){await back();await step('patient-file')}
      if(screen==='verify-email'){await click('.walkthrough-verification-navigation button.auth-switch');await step('signup')}
      if(screen==='dashboard'){await click('.portal-onboarding-back');await step('patient-file')}
    }
    await evaluate("location.hash='#/signup'");await step('signup')
    await click('.auth-brand-tools > a');await waitFor("!!document.querySelector('.tech-hero')")
    assert.equal(await evaluate("document.querySelectorAll('[data-walkthrough-step]').length"),0)
  }
  // Independent security regression checks, not walkthrough navigation.
  await evaluate("location.hash='#/login'");await step('login')
  await fill({email:account.email,password:account.password});await submit();await step('patient-file')
  await click('.auth-form-panel a.auth-switch');await step('login')
  await click('.auth-tabs a[href="#/signup"]');await step('signup')
  assert.equal(await evaluate('location.hash'),'#/signup','Tabs use normal application routes')
  await evaluate("location.hash='#/patient/file'");await waitFor("!!document.querySelector('[role=alert]')")
  assert.equal(await evaluate("document.querySelectorAll('input,table,.workflow-choices').length"),0)
  assert.ok(await evaluate("Object.keys(localStorage).every(k=>k==='smart-lims.language') && Object.keys(sessionStorage).every(k=>k==='smart-lims.dev-portal.v1')"))
  assert.ok(!requests.some(request=>request.method==='POST'))
  await evaluate("location.hash='#/verify-email?token=invalid-link-for-testing'")
  await waitFor("!!document.querySelector('.email-verification-card [role=alert]')")
  assert.ok(await evaluate("!document.querySelector('[data-walkthrough-step],.dev-walkthrough-indicator')"),'Token callbacks use the real verification controller even in DEV')
  await send('Page.navigate',{url:'http://localhost:4173/'})
  await waitFor("!!document.querySelector('.tech-hero')");await click('.nav-cta')
  await waitFor("!!document.querySelector('.registration-form')")
  assert.equal(await evaluate('location.hash'),'#/signup','Production Get Started uses real registration')
  assert.equal(await evaluate("document.querySelectorAll('[data-dev-preview],[data-walkthrough-step],.dev-preview-menu').length"),0)
  await fill(account);await submit();await waitFor("!!document.querySelector('form [role=alert]')")
  assert.equal(await evaluate('location.hash'),'#/signup','No false production registration')
  assert.ok(await evaluate("!document.querySelector('a[href*=__walkthrough],.dev-walkthrough-indicator')"))
  await evaluate("location.hash='#/login'");await waitFor("!!document.getElementById('auth-email')")
  await fill({email:account.email,password:account.password});await submit();await waitFor("!!document.querySelector('form [role=alert]')")
  assert.equal(await evaluate('location.hash'),'#/login','No false production login')
  await evaluate("location.hash='#/patient/dashboard'");await waitFor("!!document.querySelector('.portal-access [role=alert]')")
  assert.ok(await evaluate("!document.querySelector('.portal-sidebar')"))
  await evaluate("location.hash='#/onboarding/dashboard'");await waitFor("!!document.querySelector('.tech-hero')")
  await evaluate("location.hash='#/__walkthrough/signup'");await waitFor("!!document.querySelector('.tech-hero')")
  assert.equal(await evaluate("document.querySelectorAll('[data-walkthrough-step]').length"),0)
  assert.deepEqual(exceptions,[])
  console.log('Walkthrough checks passed using visible buttons only: homepage entry, signup/verification/login, every Back action, both file paths, validation, retained non-sensitive inputs, discarded passwords/identifiers, EN/AR layouts, no API writes or session storage, real-route protection, and production exclusion.')
  await send('Browser.close')
} finally {clearInterval(keepAlive);socket?.close();browser.kill()}
