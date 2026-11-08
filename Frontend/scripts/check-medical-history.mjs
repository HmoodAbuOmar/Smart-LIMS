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
  const waitFor=async expression=>{for(let i=0;i<200;i++){if(await evaluate(expression))return;await delay(75)}console.log('UI failure',await evaluate('({url:location.href,body:document.body.innerText.slice(0,1200),resources:performance.getEntriesByType("resource").slice(-8).map(r=>r.name)})'),exceptions);assert.fail('UI timeout: '+expression)}
  const click=async(selector,index=0)=>{
    const point=await evaluate(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(el=>el.getClientRects().length)[${index}];if(!el)throw Error('Visible control missing');el.scrollIntoView({block:'center',behavior:'instant'});const b=el.getBoundingClientRect();const hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);if(!el.contains(hit))throw Error('Control is blocked');return {x:b.left+b.width/2,y:b.top+b.height/2}})()`)
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point})
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point})
    await delay(50)
  }
  const fill=async values=>{for(const [field,value] of Object.entries(values)){await evaluate(`(()=>{const el=document.querySelector('[name="${field}"]');const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`)}}
  const textClick=async(text,selector='button')=>{await evaluate(`(()=>{document.querySelector('[data-click-target]')?.removeAttribute('data-click-target');const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(el=>el.getClientRects().length&&el.textContent.trim()===${JSON.stringify(text)});if(!el)throw Error('Missing: '+${JSON.stringify(text)});el.setAttribute('data-click-target','yes')})()`);await click('[data-click-target=yes]')}
  const nav=async page=>{if(await evaluate('innerWidth<=850')){await click('.portal-menu');await delay(250)}await click(`.portal-sidebar [data-page="${page}"]`);await delay(100)}
  const inspect=async(lang,page)=>{for(const width of [320,768,1440]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await delay(250);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),lang+' '+page+' fits '+width);assert.ok(await evaluate("[...document.querySelectorAll('.smartlims-approved-logo')].every(el=>el.src.endsWith('/images/smart-lims-logo.png')&&getComputedStyle(el).filter.includes('invert(1)'))"),'Approved white logo');if(process.env.AUTH_TEST_SCREENSHOTS&&[320,1440].includes(width)){await evaluate('scrollTo(0,0)');const shot=await send('Page.captureScreenshot',{format:'png'});const file=join(profile,lang+'-history-'+page+'-'+width+'.png');writeFileSync(file,Buffer.from(shot.data,'base64'));console.log('Screenshot: '+file)}}}
  const optionFor=async(id,unit,method)=>evaluate(`(()=>{const options=[...document.querySelector('[name=history-biomarker]').options];const o=options.find(o=>{const a=JSON.parse(o.value);return a[0]===${JSON.stringify(id)}&&(!${JSON.stringify(unit)}||a[1]===${JSON.stringify(unit)})&&(!${JSON.stringify(method)}||a[2]===${JSON.stringify(method)})});if(!o)throw Error('Missing compatible series');return o.value})()`)
  const downloads=mkdtempSync(join(tmpdir(),'smartlims-history-pdf-'));await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads})
  for(const lang of ['en','ar']){
    const c=portalResources[lang]
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:'about:blank'});await send('Page.navigate',{url:'http://localhost:5173/'})
    await waitFor("!!document.querySelector('.tech-hero')");await click('.language-switcher__segment',lang==='ar'?0:1)
    assert.equal(await evaluate("document.querySelectorAll('.brand .smartlims-approved-logo').length"),2)
    assert.ok(await evaluate("!document.querySelector('.brand-symbol,.brand-lightweight,.brand-dot,.showcase-mark') && !!document.querySelector('.showcase-approved-logo')"));await inspect(lang,'landing-logo')
    await click('.nav-cta');await waitFor("!!document.querySelector('.auth-branding')");await inspect(lang,'auth-logo')
    await send('Page.navigate',{url:'http://localhost:5173/#/__portal/dashboard'});await waitFor("!!document.querySelector('.history-dashboard-card')")
    await click('.history-dashboard-card');await waitFor("!!document.querySelector('.history-trends-card')");await inspect(lang,'trends')
    assert.ok(await evaluate("!!document.querySelector('.history-trends-card')"))
    assert.equal(await evaluate("document.querySelectorAll('.history-chart [role=button]').length"),4)
    await fill({'history-period':'months3'});assert.equal(await evaluate("document.querySelectorAll('.history-chart [role=button]').length"),3)
    await fill({'history-period':'year1'});assert.equal(await evaluate("document.querySelectorAll('.history-chart [role=button]').length"),5)
    await fill({'history-period':'allTime'});assert.equal(await evaluate("document.querySelectorAll('.history-chart [role=button]').length"),6)
    const magnesium=await optionFor('creatinine','mg/dL');await fill({'history-biomarker':magnesium});assert.equal(await evaluate("document.querySelectorAll('.history-chart [role=button]').length"),5)
    const otherUnit=await optionFor('creatinine','µmol/L');await fill({'history-biomarker':otherUnit});assert.equal(await evaluate("document.querySelectorAll('.history-chart [role=button]').length"),1)
    assert.ok(await evaluate("document.querySelector('.history-trends-card').innerText.includes('81')"))
    await fill({'history-period':'months3'});assert.ok(await evaluate("!!document.querySelector('.history-chart-empty') && document.querySelector('.history-latest strong').textContent.includes('—')"))
    const otherMethod=await optionFor('tsh',null,'immunoassay-platform-b');await fill({'history-biomarker':otherMethod,'history-period':'allTime'});assert.equal(await evaluate("document.querySelectorAll('.history-chart [role=button]').length"),1)
    const hba1c=await optionFor('hba1c');await fill({'history-biomarker':hba1c});assert.equal(await evaluate("document.querySelectorAll('.history-chart [role=button]').length"),5)
    await evaluate("document.querySelector('.history-chart [role=button]').focus()");assert.ok(await evaluate("document.querySelector('.history-chart-tooltip').innerText.includes('%') && !!document.querySelector('.history-chart-tooltip button')"))
    await click('.history-chart-tooltip button');await waitFor("!!document.querySelector('.history-visit .history-expand[aria-expanded=true]')");await inspect(lang,'visit-detail')
    assert.equal(await evaluate("document.querySelectorAll('.history-report-section').length"),6)
    const before=readdirSync(downloads).filter(n=>n.endsWith('.pdf')).length;await click('.history-report-section button[aria-label]',0)
    for(let i=0;i<100&&readdirSync(downloads).filter(n=>n.endsWith('.pdf')).length<=before;i++)await delay(100)
    const pdf=readdirSync(downloads).filter(n=>n.endsWith('.pdf')).at(-1);assert.ok(pdf);assert.ok(readFileSync(join(downloads,pdf)).subarray(0,8).toString().startsWith('%PDF-1.4'))
    await nav('history');await waitFor("!!document.querySelector('.history-timeline')");await inspect(lang,'archive')
    assert.equal(await evaluate("document.querySelectorAll('.history-visit').length"),6)
    assert.ok(await evaluate("(()=>{const dates=[...document.querySelectorAll('.history-visit time')].map(el=>new Date(el.dateTime).getTime());return dates.every((d,i)=>!i||dates[i-1]>=d)})()"))
    await fill({'history-search':'no-such-visit'});assert.equal(await evaluate("document.querySelectorAll('.history-visit').length"),0);await textClick(c.clear)
    await fill({'history-search':'SAMPLE-HISTORY-O2'});assert.equal(await evaluate("document.querySelectorAll('.history-visit').length"),1);await textClick(c.clear)
    await fill({'history-test':'kidney'});assert.equal(await evaluate("document.querySelectorAll('.history-visit').length"),5);await textClick(c.clear)
    await fill({'history-status':'critical'});assert.equal(await evaluate("document.querySelectorAll('.history-visit').length"),0);await textClick(c.clear)
    const today=new Date(),from=new Date();from.setDate(from.getDate()-100);const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    await fill({'history-start':iso(from),'history-end':iso(today)});assert.equal(await evaluate("document.querySelectorAll('.history-visit').length"),3)
    await fill({'history-start':'2026-12-01','history-end':'2026-01-01'});assert.ok(await evaluate("!!document.querySelector('.portal-error[role=alert]')"));await textClick(c.clear)
    // Existing pages reach the exact visit, not a loosely matched patient record.
    await nav('results');await click('tbody tr:first-child button:last-child');await waitFor("!!document.querySelector('.history-expand[aria-expanded=true]')")
    assert.ok(await evaluate("document.querySelector('.history-visit').innerText.includes('SAMPLE-V0')"))
    await nav('orders');await click('tbody tr:first-child button:last-child');await waitFor("!!document.querySelector('.history-expand[aria-expanded=true]')")
    await nav('appointments');await textClick(c.past,'.portal-filter-tabs button');assert.equal(await evaluate(`Array.from(document.querySelectorAll('tbody button')).filter(el=>el.textContent===${JSON.stringify(c.viewVisit)}).length`),6)
    await textClick(c.viewVisit,'tbody button');await waitFor("!!document.querySelector('.history-expand[aria-expanded=true]')")
    await nav('profile');await textClick(c.history,'.portal-form button');await waitFor("!!document.querySelector('.history-timeline')")
  }
  await evaluate("location.hash='#/patient/history'");await waitFor("!!document.querySelector('.portal-access [role=alert]')");assert.ok(await evaluate("!document.querySelector('.history-timeline,.history-trends-card')"))
  assert.ok(!requests.some(r=>r.method==='POST'))
  assert.ok(await evaluate("Object.keys(localStorage).every(k=>k==='smart-lims.language')&&Object.keys(sessionStorage).every(k=>k==='smart-lims.dev-portal.v1')"))
  assert.deepEqual(exceptions,[])
  console.log('History/trends passed in EN/AR at 320/768/1440px: archive ordering/filtering/expansion, exact visit links, reports/PDF, biomarker and time switching, unit/method isolation, tooltip/keyboard, single/no measurement states, approved white logos, real route guards and no sensitive persistence.')
  await send('Browser.close')
} finally {clearInterval(keepAlive);socket?.close();browser.kill()}
