import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const temporary = mkdtempSync(join(tmpdir(), 'smart-lims-sizing-'))
const profile = join(temporary, 'chrome')
const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../../../', import.meta.url)), plugins: [react()], cacheDir: join(temporary, 'vite'), server: { host: '127.0.0.1', port: 0 } })
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
  async function sidebarScreenshot(selector, name) {
    const bounds = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left,y:r.top,width:r.width,height:r.height,scale:1}})()`)
    const result = await send('Page.captureScreenshot', { format: 'png', clip: bounds })
    writeFileSync(join(temporary, `${name}.png`), Buffer.from(result.data, 'base64'))
  }
  await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })

  const base = `http://127.0.0.1:${server.httpServer.address().port}`
  const metrics = {}
  const properties = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'padding', 'borderRadius', 'gap', 'marginBottom', 'minHeight']
  async function measure(selectors) {
    return evaluate(`Object.fromEntries(Object.entries(${JSON.stringify(selectors)}).map(([key,selector])=>{const e=document.querySelector(selector);if(!e)return[key,null];const c=getComputedStyle(e),r=e.getBoundingClientRect();return[key,{width:r.width,height:r.height,top:r.top,bottom:r.bottom,left:r.left,right:r.right,...Object.fromEntries(${JSON.stringify(properties)}.map(p=>[p,c[p]]))}]}))`)
  }
  const portalSelectors = { sidebar: '.portal-sidebar', logo: '.portal-logo img', header: '.portal-topbar', main: '.portal-main', title: '.portal-heading h1', subtitle: '.portal-heading p', heading: '.portal-heading', navigation: '.portal-sidebar nav button', navIcon: '.portal-sidebar nav button svg', tabs: '.portal-filter-tabs button', badge: '.portal-status', tableHeader: 'thead th', cell: 'tbody td', row: 'tbody tr', tableButton: 'tbody .portal-button', tableWrap: '.portal-table-wrap', language: '.portal-sidebar .language-switcher__segment', footer: '.portal-sidebar-bottom', languageGroup: '.portal-sidebar .language-switcher' }
  const receptionSelectors = { sidebar: '.r01-sidebar', logo: '.r01-logo', header: '.r01-header', main: '.r01-main', title: '.r01-heading h1', subtitle: '.r01-heading p', heading: '.r01-heading', navigation: '.r01-sidebar nav button', navIcon: '.r01-sidebar nav button svg', tabs: '.r01-tabs button', badge: '.r01-badge', tableHeader: 'thead th', cell: 'tbody td', row: 'tbody tr', tableButton: '.r01-check-in', tableWrap: '.r01-panel', language: '.r01-sidebar .language-switcher__segment', footer: '.r01-sidebar-footer', languageGroup: '.r01-sidebar .language-switcher', primary: '.r01-heading .r01-primary', refresh: '.r01-refresh' }
  for (const language of ['en', 'ar']) {
    for (const width of [1440, 390]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width === 390 })
      await send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 })
      await send('Page.navigate', { url: `${base}/#/__portal/orders` })
      await waitFor("document.querySelector('.portal-table-wrap tbody tr')")
      await click(`.portal-sidebar .language-switcher button[lang=${language}]`)
      await waitFor(`document.documentElement.lang==='${language}'`)
      await evaluate('document.fonts.ready.then(()=>true)')
      metrics[`${language}-${width}-portal`] = await measure(portalSelectors)
      metrics[`${language}-${width}-portal`].zoom = await evaluate('visualViewport.scale')
      await screenshot(`portal-${language}-${width}`)
      if (width === 390) {
        await click('.portal-menu'); await pause(250)
        Object.assign(metrics[`${language}-${width}-portal`], await measure(Object.fromEntries(Object.entries(portalSelectors).filter(([key]) => ['sidebar','logo','navigation','navIcon','language','footer','languageGroup'].includes(key)))))
      }
      await sidebarScreenshot('.portal-sidebar', `portal-sidebar-${language}-${width}`)
      if (width === 390) await click('.portal-menu')
      await send('Page.navigate', { url: `${base}/#/__portal/appointments` })
      await waitFor("document.querySelector('.portal-heading .portal-button')")
      metrics[`${language}-${width}-portal`].primary = (await measure({ primary: '.portal-heading .portal-button' })).primary
      metrics[`${language}-${width}-portal`].primaryIcon = (await measure({ primary: '.portal-heading .portal-button svg' })).primary
      await send('Page.navigate', { url: `${base}/#/__receptionist/today` })
      await waitFor("document.querySelectorAll('.r01-check-in').length===7")
      await evaluate('document.fonts.ready.then(()=>true)')
      metrics[`${language}-${width}-reception`] = await measure(receptionSelectors)
      if (width === 390) {
        await click('.r01-menu-button')
        Object.assign(metrics[`${language}-${width}-reception`], await measure(Object.fromEntries(Object.entries(receptionSelectors).filter(([key]) => ['sidebar','logo','navigation','navIcon','language','footer','languageGroup'].includes(key)))))
        await sidebarScreenshot('.r01-sidebar', `reception-sidebar-${language}-${width}`)
        await click('.r01-menu-button')
      } else await sidebarScreenshot('.r01-sidebar', `reception-sidebar-${language}-${width}`)
      metrics[`${language}-${width}-reception`].zoom = await evaluate('visualViewport.scale')
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'))
      assert.ok(await evaluate("[...document.querySelectorAll('.r01-check-in')].every(b=>b.scrollWidth<=b.clientWidth)"))
      await screenshot(`reception-${language}-${width}`)
      if (process.env.R01_SIZING_VERIFY === '1') {
        const patient = metrics[`${language}-${width}-portal`], receptionist = metrics[`${language}-${width}-reception`]
        for (const [target, keys] of Object.entries({ title: ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight'], subtitle: ['fontSize', 'lineHeight'], navigation: ['fontSize', 'fontWeight', 'lineHeight', 'padding', 'borderRadius'], main: ['padding'], heading: ['gap','marginBottom'], tabs: ['fontSize', 'padding', 'borderRadius', 'height'], badge: ['fontSize','lineHeight','padding','borderRadius'], language: ['fontSize', 'padding', 'borderRadius', 'height'], tableButton: ['fontSize', 'padding', 'borderRadius', 'height'], primary: ['fontSize', 'padding', 'borderRadius', 'height'] })) {
          for (const key of keys) assert.equal(receptionist[target][key], patient[target][key], `${language}/${width} ${target}.${key}`)
        }
        assert.equal(receptionist.refresh.height, patient.primary.height)
        assert.equal(receptionist.refresh.borderRadius, patient.primary.borderRadius)
        assert.equal(receptionist.tableWrap.borderRadius, patient.tableWrap.borderRadius)
        assert.equal(receptionist.sidebar.width, patient.sidebar.width)
        assert.equal(receptionist.logo.width, patient.logo.width)
        for (const target of ['logo','navigation','languageGroup']) {
          for (const key of (width===1440?['top','bottom','left','right']:['left','right'])) {
            const axis = ['left','right'].includes(key) ? 'left' : 'top'
            assert.ok(Math.abs((receptionist[target][key]-receptionist.sidebar[axis])-(patient[target][key]-patient.sidebar[axis]))<1, `${language}/${width} sidebar-relative ${target}.${key}`)
          }
        }
        if (width === 1440) {
          assert.equal(receptionist.header.height, patient.header.height)
          for (const target of ['cell', 'tableHeader']) for (const key of ['fontSize', 'padding', 'lineHeight']) assert.equal(receptionist[target][key], patient[target][key], `${target}.${key}`)
        }
      }
    }
  }
  writeFileSync(join(temporary, 'computed-sizes.json'), JSON.stringify(metrics, null, 2))
  writeFileSync(join(temporary, 'comparison.html'), `<html><meta charset="utf-8"><title>Patient Portal / Receptionist sizing</title><style>body{font-family:Arial;background:#edf6f3}section{display:grid;grid-template-columns:1fr 1fr;gap:16px}img{width:100%;border:1px solid #c8e3dc}figure{margin:0}h2{margin-top:30px}</style>${['en','ar'].flatMap(language=>[1440,390].map(width=>`<h2>${language.toUpperCase()} — ${width}px — 100% zoom</h2><section><figure><figcaption>Patient Portal</figcaption><img src="portal-${language}-${width}.png"></figure><figure><figcaption>Receptionist Today</figcaption><img src="reception-${language}-${width}.png"></figure></section>`)).join('')}</html>`)
  writeFileSync(join(temporary, 'sidebar-comparison.html'), `<html><meta charset="utf-8"><title>Sidebar alignment</title><style>body{font-family:Arial;background:#edf6f3}section{display:flex;gap:24px}figure{margin:0}img{display:block;border:1px solid #c8e3dc}</style>${['en','ar'].flatMap(language=>[1440,390].map(width=>`<h2>${language.toUpperCase()} — ${width}px viewport — 100% zoom</h2><section><figure><figcaption>Patient Portal</figcaption><img src="portal-sidebar-${language}-${width}.png"></figure><figure><figcaption>Receptionist</figcaption><img src="reception-sidebar-${language}-${width}.png"></figure></section>`)).join('')}</html>`)
  assert.deepEqual(errors, [])
  console.log('Shared Admin reference: 256px sidebar, 158px logo, ~72px top bar, 22px/32px/44px main padding, 32px desktop title, 38px primary controls, 30px table controls, 8px button radius, 13px/12px table cell padding.')
  console.log(`PASS: compared EN/AR at identical 1440px/390px viewports and 100% zoom; no narrow-screen overflow. Computed measurements and side-by-side screenshots: ${temporary}`)
} finally { socket?.close(); browser?.kill(); await server.close() }

