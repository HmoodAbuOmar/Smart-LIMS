// Run dev on localhost:5173 and the production build server on localhost:4173.
// Override CHROME_PATH and AUTH_TEST_URL for other local environments.
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
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
  const waitFor=async expression=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await delay(100)}assert.fail('UI timeout: '+expression)}
  await send('Page.navigate',{url:'http://localhost:5173/'})
  await waitFor("!!document.querySelector('.tech-hero')")
  if(process.env.REGENERATE_FAVICON==='1') {
    const image=await evaluate(`(async()=>{const img=new Image();img.src='/favicon.svg?v=derive-current-logo';await img.decode();const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;canvas.getContext('2d').drawImage(img,0,0,64,64);return canvas.toDataURL('image/png').split(',')[1]})()`)
    writeFileSync('public/favicon-smart-lims.png',Buffer.from(image,'base64'))
    // Self-contained SVG: browser SVG favicons cannot rely on external images.
    writeFileSync('public/favicon.svg',`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><image width="64" height="64" href="data:image/png;base64,${image}"/></svg>\n`)
    console.log('Derived compact favicon from the unchanged official logo.')
  }
  exceptions.length=0
  for(const language of ['ar','en']) {
    await send('Page.navigate',{url:'http://localhost:5173/'})
    await waitFor("!!document.querySelector('.language-switcher__segment')")
    await evaluate(`document.querySelector('.language-switcher__segment[lang="${language}"]').click()`)
    await delay(100)
    for(const route of ['', '/login','/signup','/verify-email','/forgot-password','/reset-password','/patient/file','/patient/file/new','/patient/file/link', ...['dashboard','profile','tests','tests/cbc','review','orders','orders/SAMPLE-0012','book','appointments','results','results/SAMPLE-R1','notifications'].map(p=>'/__portal/'+p)]) {
      await evaluate(`location.hash=${JSON.stringify(route?'#'+route:'#home')}`)
      await waitFor("!!document.querySelector('h1')")
      await delay(120)
      assert.equal(await evaluate('document.title'),'Smart-LIMS',language+' '+route)
      assert.ok(await evaluate("[...document.querySelectorAll('link[rel=icon]')].length===2 && [...document.querySelectorAll('link[rel=icon]')].every(el=>el.href.includes('v=flask-dna-20261026'))"))
    }
  }
  for(const url of ['/favicon.svg?v=flask-dna-20261026','/favicon-smart-lims.png?v=flask-dna-20261026']) {
    const response=await fetch('http://localhost:5173'+url);assert.equal(response.status,200)
    assert.ok(await evaluate(`(async()=>{const img=new Image();img.src=${JSON.stringify(url)};await img.decode();return img.naturalWidth===64&&img.naturalHeight===64})()`),'Favicon decodes')
  }
  assert.ok(readFileSync('public/favicon-smart-lims.png').length<20000,'Compact favicon asset')
  assert.ok(!readFileSync('public/favicon.svg','utf8').includes('M7 21h7'),'Old ECG favicon removed')
  assert.ok(requests.some(r=>r.url.includes('favicon.svg?v=flask-dna-20261026')))
  assert.deepEqual(exceptions,[])
  console.log('Favicon and exact Smart-LIMS title passed on home, authentication/onboarding, and all 12 portal pages in AR/EN. Both cache-versioned assets decode at 64px.')
  await send('Browser.close')
} finally {clearInterval(keepAlive);socket?.close();browser.kill()}
