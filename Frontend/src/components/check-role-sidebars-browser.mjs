import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const temporary = mkdtempSync(join(tmpdir(), 'smart-lims-sidebars-'))
const profile = join(temporary, 'chrome')
const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../../', import.meta.url)), plugins: [react()], cacheDir: join(temporary, 'vite'), server: { host: '127.0.0.1', port: 0 } })
let browser, socket
const errors = []
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
try {
  await server.listen()
  browser = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  browser.on('error', error => errors.push(error.message))
  let port
  for (let i = 0; i < 80; i++) { try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; break } catch { await pause(100) } }
  assert.ok(port, `Chrome failed to start: ${errors.join('; ')}`)
  const targets = await fetch(`http://127.0.0.1:${port}/json`).then(response => response.json())
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  let sequence = 0
  const pending = new Map()
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id) { const request = pending.get(message.id); pending.delete(message.id); if (message.error) request.reject(new Error(JSON.stringify(message.error))); else request.resolve(message.result) }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text)
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push('Browser console error')
    if (message.method === 'Network.requestWillBeSent' && /\/api\//.test(message.params.request.url)) errors.push('Unexpected API request')
  })
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)) }, 10000)
      pending.set(id, { resolve: result => { clearTimeout(timeout); resolve(result) }, reject: error => { clearTimeout(timeout); reject(error) } })
      socket.send(JSON.stringify({ id, method, params }))
    })
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  async function waitFor(expression) { for (let i = 0; i < 100; i++) { if (await evaluate(`Boolean(${expression})`)) return; await pause(60) } assert.fail(`Condition not met: ${expression}`) }
  async function click(selector) { await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); element.focus(); element.click(); })()`); await pause(40) }
  async function screenshot(name) { const result = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(temporary, `${name}.png`), Buffer.from(result.data, 'base64')) }
  await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })

  const base = `http://127.0.0.1:${server.httpServer.address().port}`
  await send('Page.navigate', { url: `${base}/#/__admin/patients` })
  await waitFor("document.querySelector('.admin-sidebar .admin-logo')")
  await evaluate('document.fonts.ready.then(()=>true)')
  const reference = await evaluate(`(()=>{const selectors={sidebar:'.admin-sidebar',logo:'.admin-logo',first:'.admin-navigation>button',footer:'.admin-sidebar-footer',logout:'.admin-logout',language:'.admin-language-control .language-switcher'},out={};for(const [key,selector]of Object.entries(selectors)){const e=document.querySelector(selector),r=e.getBoundingClientRect(),s=getComputedStyle(e);out[key]={x:r.x,y:r.y,width:r.width,height:r.height,padding:s.padding,fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,borderRadius:s.borderRadius,gap:s.gap}}return out})()`)
  writeFileSync(join(temporary,'admin-reference.json'),JSON.stringify(reference,null,2))
  await screenshot('admin-patients-reference')
  console.log(JSON.stringify(reference))
  console.log(`Admin Patients reference: ${temporary}`)
  const all = {}
  const roles = [
    { id:'admin', route:'__admin/patients', menu:'.admin-menu-toggle', ready:'.admin-patients', language:'.admin-layout', nav:'patients' },
    { id:'patient', route:'__portal/orders', menu:'.portal-menu', ready:'.patient-portal', language:'.patient-portal', nav:'orders' },
    { id:'receptionist', route:'__receptionist/today', menu:'.r01-menu-button', ready:'.reception-today-layout', language:'.reception-today-layout', nav:'today' },
  ]
  async function geometry() {
    return evaluate(`(()=>{const aside=document.querySelector('.workspace-sidebar'),a=aside.getBoundingClientRect(),out={};for(const [key,selector]of Object.entries({sidebar:'.workspace-sidebar',logo:'.ws-logo',first:'.ws-nav>button',footer:'.ws-footer',logout:'.ws-logout',language:'.ws-language .language-switcher'})){const e=document.querySelector(selector),r=e.getBoundingClientRect(),s=getComputedStyle(e);out[key]={x:r.x-a.x,y:r.y-a.y,width:r.width,height:r.height,padding:s.padding,fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,borderRadius:s.borderRadius,gap:s.gap}}return out})()`)
  }
  async function sidebarCapture(name) {
    const clip=await evaluate("(()=>{const r=document.querySelector('.workspace-sidebar').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()")
    const result=await send('Page.captureScreenshot',{format:'png',clip})
    writeFileSync(join(temporary,`${name}.png`),Buffer.from(result.data,'base64'))
  }
  for (const language of ['en','ar']) for (const width of [1440,390]) {
    for (const role of roles) {
      await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
      await send('Page.navigate',{url:`${base}/#/${role.route}`});await pause(200)
      await waitFor(`document.querySelector('${role.language} .workspace-sidebar .ws-logo') && getComputedStyle(document.querySelector('${role.language}')).display!=='none'`)
      await click(`.ws-language button[lang=${language}]`)
      await waitFor(`document.querySelector('.workspace-sidebar').lang==='${language}'`)
      await evaluate('document.fonts.ready.then(()=>true)')
      await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===390})
      await send('Emulation.setPageScaleFactor',{pageScaleFactor:1})
      if(width===390) {
        assert.equal(await evaluate("getComputedStyle(document.querySelector('.workspace-sidebar')).display"),'none')
        await click(role.menu)
        await waitFor("getComputedStyle(document.querySelector('.workspace-sidebar')).display==='flex'")
      }
      await evaluate("document.querySelector('.workspace-sidebar').scrollTop=0")
      const g=await geometry()
      assert.equal(g.sidebar.width,width===1440?256:390,`${role.id}/${language}/${width} sidebar width`)
      assert.equal(g.logo.width,158);assert.equal(g.logo.height,64)
      assert.equal(g.logo.y,width===1440?28:20)
      assert.equal(g.first.x,width===1440?14:16)
      assert.equal(g.first.y,width===1440?138:116)
      assert.equal(g.first.fontSize,'14px');assert.equal(g.first.fontWeight,'600');assert.equal(g.first.padding,'12px')
      assert.ok(Math.abs(g.first.height-46.4)<.1)
      const baseline=all[`${language}-${width}-admin`]
      if(baseline) for(const target of ['sidebar','logo','first']) for(const key of Object.keys(baseline[target])) assert.deepEqual(g[target][key],baseline[target][key],`${role.id}/${language}/${width} ${target}.${key}`)
      if(width===1440) {
        assert.equal(g.first.y,138)
        assert.ok(Math.abs(g.footer.y-856.609375)<.1)
        assert.equal(g.language.y,944)
        await sidebarCapture(`${role.id}-${language}-${width}`)
      }
      await evaluate("document.querySelector('.workspace-sidebar').scrollTop=10000")
      const footer=await geometry()
      if(baseline) for(const target of ['logout','language']) for(const key of Object.keys(baseline[target])) { const a=footer[target][key],b=baseline[target][key]; if(typeof a==='number')assert.ok(Math.abs(a-b)<1,`${role.id}/${language}/${width} ${target}.${key}`);else assert.deepEqual(a,b,`${role.id}/${language}/${width} ${target}.${key}`) }
      // Store footer geometry at scroll end, where all menu lengths expose the controls.
      Object.assign(g,{logout:footer.logout,language:footer.language})
      all[`${language}-${width}-${role.id}`]=g
      assert.ok(await evaluate("(()=>{const s=document.querySelector('.workspace-sidebar').getBoundingClientRect(),b=document.querySelector('.ws-language').getBoundingClientRect();return b.bottom<=s.bottom+1&&b.top>=s.top})()"))
      if(width===390) {
        await sidebarCapture(`${role.id}-${language}-${width}`)
        await click(role.menu)
      }
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'))
    }
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
  await send('Page.navigate',{url:`${base}/#/__admin/patients`});await waitFor("document.querySelector('.admin-navigation')")
  await click('.ws-language button[lang=en]')
  await click('#admin-group-testCatalog');await click('#admin-submenu-testCatalog button')
  await waitFor("document.querySelector('.admin-catalog') || document.querySelector('.admin-test-catalog')")
  await click(".admin-navigation button.is-active")
  await click('.ws-logout');await waitFor("document.querySelector('.ws-logout-error')")
  assert.equal(await evaluate('location.hash'),'#/__admin/patients')
  await send('Page.navigate',{url:`${base}/#/__portal/orders`});await waitFor("document.querySelector('.portal-sidebar')")
  await click('.ws-language button[lang=en]');await click('.ws-nav [data-page=appointments]')
  await waitFor("location.hash.includes('/appointments')")
  await click('.ws-logout');await waitFor("location.hash==='#/login'")
  await send('Page.navigate',{url:`${base}/#/__receptionist/today`});await waitFor("document.querySelector('.r01-sidebar')")
  assert.equal(await evaluate("document.querySelectorAll('.r01-sidebar .ws-nav button:disabled').length"),4)
  await click('.ws-logout');await waitFor("document.querySelector('.r01-logout-error')")
  assert.equal(await evaluate('location.hash'),'#/__receptionist/today')
  writeFileSync(join(temporary,'role-measurements.json'),JSON.stringify(all,null,2))
  writeFileSync(join(temporary,'comparison.html'),`<html><meta charset="utf-8"><title>Shared Admin sidebar comparison</title><style>body{font-family:Arial;background:#edf6f3}section{display:flex;gap:20px}figure{margin:0}img{display:block}</style>${['en','ar'].flatMap(language=>[1440,390].map(width=>`<h2>${language.toUpperCase()} / ${width}px / 100% zoom</h2><section>${roles.map(role=>`<figure><figcaption>${role.id}</figcaption><img src="${role.id}-${language}-${width}.png"></figure>`).join('')}</section>`)).join('')}</html>`)
  assert.deepEqual(errors,[])
  console.log(`PASS: all 3 existing role sidebars share Admin geometry, footer and typography at 1440px/390px and 100% zoom in EN/AR; role navigation, Catalog expansion, language, logout failure/local exit, mobile toggles/scrolling. Lab Technician layout absent. Comparisons: ${temporary}`)
} finally { socket?.close(); browser?.kill(); await server.close() }
