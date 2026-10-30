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
    await waitFor("!!document.querySelector('.chart-card')");await click('.language-switcher__segment',lang==='ar'?0:1)
    const originals={Glucose:{'6 months':[108,101,104,94,98,92],'12 months':[105,107,100,98,95,92]},Cholesterol:{'6 months':[194,188,191,179,181,172],'12 months':[198,192,187,181,177,172]}}
    for(const [metric,periods]of Object.entries(originals)){
      await click('.metric-tabs button',metric==='Glucose'?0:1)
      for(const [period,values]of Object.entries(periods)){
        await evaluate(`(()=>{const el=document.querySelector('.chart-controls select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,${JSON.stringify(period)});el.dispatchEvent(new Event('change',{bubbles:true}))})()`)
        assert.equal(await evaluate("document.querySelectorAll('.chart-card svg circle').length"),6)
        const coordinates=await evaluate("document.querySelector('.chart-card polyline').getAttribute('points').split(' ').map(p=>p.split(',').map(Number))")
        assert.deepEqual(coordinates.map(([,y])=>(metric==='Glucose'?370-y:595-y)/2.5),values,'Exact backup measurements '+lang+' '+metric+' '+period)
        assert.ok((await evaluate("document.querySelector('.chart-value').innerText")).startsWith(new Intl.NumberFormat(lang).format(values[5])))
        assert.ok((await evaluate("document.querySelector('.chart-value .trend').innerText")).includes(new Intl.NumberFormat(lang).format(values[0]-values[5])))
      }
    }
    for(const width of [320,768,1440]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await delay(160);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Homepage fits '+width)}
    const homePoints=await evaluate("document.querySelector('.chart-card polyline').getAttribute('points')")
    await send('Page.navigate',{url:'http://localhost:5173/#/__portal/history?view=trends'});await waitFor("!!document.querySelector('.history-trends-card')")
    for(const [id,counts]of [['hemoglobin',[3,4,5,6]],['cholesterol',[2,3,4,5]]]){
      const option=await optionFor(id);await fill({'history-biomarker':option})
      for(const [index,period]of ['months3','months6','year1','allTime'].entries()){
        await fill({'history-period':period});assert.equal(await evaluate("document.querySelectorAll('.history-chart [role=button]').length"),counts[index])
        assert.equal(await evaluate("document.querySelectorAll('.history-measurements tbody tr').length"),counts[index],'Measurement list follows selected analyte/period')
      }
    }
    await evaluate("document.querySelector('.history-chart [role=button]').focus()");assert.ok(await evaluate("document.querySelector('.history-chart-tooltip').innerText.includes('mg/dL')&&document.querySelector('.history-chart-tooltip').innerText.includes('SAMPLE-V')"))
    await inspect(lang,'trends and measurement list')
    await click('.history-measurements tbody button');await waitFor("!!document.querySelector('.portal-report')")
    assert.ok(await evaluate("document.querySelector('.portal-report').innerText.includes('SAMPLE-HISTORY')"),'Direct measurement-to-report link')
    await nav('history');await textClick(c.healthTrends,'.portal-filter-tabs button');await fill({'history-period':'allTime','history-biomarker':JSON.stringify(['empty','liver'])})
    assert.equal(await evaluate("document.querySelectorAll('.history-chart [role=button],.history-measurements tbody tr').length"),0,'Empty state only for unmeasured liver panel')
    await fill({'history-biomarker':await optionFor('cholesterol')});assert.equal(await evaluate("document.querySelectorAll('.history-chart [role=button]').length"),5,'Other analytes stay populated')
    await evaluate("location.hash='#home'");await waitFor("!!document.querySelector('.chart-card')")
    await click('.metric-tabs button',1);await evaluate("(()=>{const el=document.querySelector('.chart-controls select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,'12 months');el.dispatchEvent(new Event('change',{bubbles:true}))})()")
    assert.equal(await evaluate("document.querySelector('.chart-card polyline').getAttribute('points')"),homePoints,'Archive selection cannot change homepage series')
  }
  assert.deepEqual(exceptions,[]);assert.ok(!requests.some(request=>request.method==='POST'))
  console.log('Independent chart checks passed EN/AR: all 4 exact recovered homepage series, values/lines/tabs/periods, responsive layouts, archive analyte/period switching, detailed measurements and report links, test-specific empty states, and no data/API writes.')
  await send('Browser.close')
} finally {clearInterval(keepAlive);socket?.close();browser.kill()}
