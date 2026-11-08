// Isolated component checks, not an authenticated-session or backend simulation.
// This local test server is never part of the application build.
import { createServer } from 'vite'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'


const testHtml = "<!doctype html><html><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head><body><div id=\"root\"></div><script type=\"module\">\nimport React, {useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';\nimport '/src/i18n.js';import '/src/index.css';import '/src/App.css';import '/src/theme.css';import '/src/styles/refinements/index.css';import '/src/components/Navbar.css';\nimport {AuthLayout} from '/src/components/AuthModal.jsx';\nimport {PatientOnboardingContent} from '/src/components/PatientOnboarding.jsx';\nimport PatientFileStateProvider from '/src/components/PatientFileStateProvider.jsx';\nfunction Components(){const [hash,setHash]=useState(location.hash);useEffect(()=>{const fn=()=>setHash(location.hash);addEventListener('hashchange',fn);return()=>removeEventListener('hashchange',fn)},[]);const step=({'#/patient/file':'selection','#/patient/file/new':'createFile','#/patient/file/link':'linkFile'})[hash]||'selection';return React.createElement(PatientFileStateProvider,null,React.createElement(AuthLayout,{mode:'login'},React.createElement(PatientOnboardingContent,{step,key:step})))}\ncreateRoot(document.getElementById('root')).render(React.createElement(Components));\n</script></body></html>"
const server = await createServer({server:{host:'127.0.0.1',port:5174,strictPort:true},plugins:[{
  name:'isolated-patient-component-check', configureServer(vite){vite.middlewares.use('/__patient_components',async(req,res,next)=>{
    try{res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/__patient_components',testHtml))}catch(error){next(error)}
  })}
}]})
await server.listen()

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
  const waitFor=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(70)}assert.fail('UI timeout: '+expression)}
  const fill=async values=>{for(const [field,value] of Object.entries(values)){await evaluate(`(()=>{const el=document.querySelector('[name="${field}"]');const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`)}}
  const submit=async()=>{await evaluate("document.querySelector('form button[type=submit]').click()");await waitFor("document.querySelector('form').getAttribute('aria-busy')!=='true'")}
  await send('Page.navigate',{url:'http://127.0.0.1:5174/__patient_components#/patient/file'})
  await waitFor("!!document.querySelector('.patient-file-options')")
  assert.equal(await evaluate("document.querySelectorAll('.patient-choice-icon svg').length"),2)
  await evaluate("document.querySelector('a[href=\"#/patient/file/new\"]').click()")
  await waitFor("!!document.getElementById('patient-draft-name')")
  assert.deepEqual(await evaluate("[...document.querySelectorAll('form input,form select')].map(e=>e.name)"),['name','dateOfBirth','gender','phone'])
  assert.equal(await evaluate("document.querySelectorAll('input[type=password]').length"),0)
  await submit();assert.equal(await evaluate("document.querySelectorAll('[aria-invalid=true]').length"),4)
  await fill({name:'Component Test',dateOfBirth:'2000-02-29',gender:'male',phone:'+970599123456'})
  await evaluate("document.querySelector('a[href=\"#/patient/file\"]').click()")
  await waitFor("!!document.querySelector('.patient-file-options')")
  await evaluate("document.querySelector('a[href=\"#/patient/file/new\"]').click()")
  await waitFor("!!document.getElementById('patient-draft-name')")
  assert.equal(await evaluate("document.getElementById('patient-draft-name').value"),'Component Test','Creation values survive backward navigation in memory')
  assert.equal(await evaluate("document.querySelector('[name=phone]').value"),'+970599123456')
  await submit();assert.ok(await evaluate("!!document.querySelector('form [role=alert]') && !document.querySelector('.registration-success')"))
  assert.equal(await evaluate('location.hash'),'#/patient/file/new')
  await evaluate("location.hash='#/patient/file/link'");await waitFor("!!document.getElementById('file-identifier')")
  await submit();assert.equal(await evaluate('document.activeElement.name'),'fileIdentifier')
  await fill({fileIdentifier:'Unverified-123'});await submit()
  assert.ok(await evaluate("!!document.querySelector('form [role=alert]') && !document.querySelector('.registration-success')"))
  assert.equal(await evaluate('location.hash'),'#/patient/file/link')
  await evaluate("location.hash='#/patient/file'");await waitFor("!!document.querySelector('.patient-file-options')")
  await evaluate("location.hash='#/patient/file/link'");await waitFor("!!document.getElementById('file-identifier')")
  assert.equal(await evaluate("document.getElementById('file-identifier').value"),'','Link identifier is discarded on leaving')
  for(const language of ['en','ar']) {
    await evaluate("document.querySelector('.language-switcher__trigger').click()")
    await evaluate(`document.querySelectorAll('[role=menuitemradio]')[${language==='ar'?0:1}].click()`)
    for(const route of ['#/patient/file','#/patient/file/new','#/patient/file/link']) {
      await evaluate('location.hash='+JSON.stringify(route));await delay(150)
      assert.ok(await evaluate("!document.body.innerText.match(/preview|demo|mock|backend/i)"))
      for(const width of [320,390,820,1280]) {
        await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await delay(100)
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'No horizontal overflow')
        await evaluate("document.querySelector('.auth-tabs').scrollIntoView({block:'center'})")
        assert.ok(await evaluate(`(()=>{const b=document.querySelector('.auth-tabs a[aria-current=page]').getBoundingClientRect();return [...document.querySelectorAll('form input,form select')].every(el=>{const f=el.getBoundingClientRect();return !(b.left<f.right&&b.right>f.left&&b.top<f.bottom&&b.bottom>f.top)})})()`),'Tabs never block form inputs')
        if(process.env.AUTH_TEST_SCREENSHOTS&&[390,1280].includes(width)){
          await evaluate('scrollTo(0,0)');await delay(100)
          const shot=await send('Page.captureScreenshot',{format:'png'})
          const path=join(profile,language+'-'+route.split('/').pop()+'-'+width+'.png');writeFileSync(path,Buffer.from(shot.data,'base64'));console.log('Screenshot: '+path)
        }
      }
    }
  }
  await evaluate("location.hash='#/login'");await delay(100)
  await evaluate("location.hash='#/patient/file/new'");await waitFor("!!document.getElementById('patient-draft-name')")
  assert.equal(await evaluate("document.getElementById('patient-draft-name').value"),'','Leaving onboarding clears creation entries')
  assert.ok(!requests.some(r=>r.method==='POST'),'No invented endpoints')
  assert.deepEqual(exceptions,[])
  assert.ok(await evaluate("!JSON.stringify(localStorage).includes('Component Test')&&!JSON.stringify(sessionStorage).includes('Unverified-123')"))
  console.log('Isolated patient-screen component checks passed: icons, selection/back links, ordered fields, required validation, in-memory creation retention, discarded linking identifiers, honest failure paths, EN/AR and 320/390/820/1280px layouts. No session or backend success was simulated.')
  await send('Browser.close')
} finally {clearInterval(keepAlive);socket?.close();browser.kill();await server.close()}
