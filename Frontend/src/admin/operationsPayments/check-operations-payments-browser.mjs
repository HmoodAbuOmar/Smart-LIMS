import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const temporary = mkdtempSync(join(tmpdir(), 'smart-lims-operations-'))
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
  async function input(selector, value) {
    await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(element.tagName === 'SELECT' ? HTMLSelectElement.prototype : element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); })()`)
    await pause(35)
  }
  async function key(key, code = key) {
    const virtual = { Enter: 13, Escape: 27, Tab: 9, Home: 36, End: 35, ArrowRight: 39, ArrowLeft: 37 }[key]
    const params = { key, code, windowsVirtualKeyCode: virtual, nativeVirtualKeyCode: virtual, ...(key==='Enter'?{text:'\r',unmodifiedText:'\r'}:{}) }
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...params })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...params })
    await pause(40)
  }
  async function screenshot(name) { const result = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(temporary, `${name}.png`), Buffer.from(result.data, 'base64')) }
  await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  const url=`http://127.0.0.1:${server.httpServer.address().port}`
  await send('Page.navigate',{url:`${url}/#/__admin/operationsPayments`})
  await waitFor("document.querySelectorAll('.op-orders-table tbody tr').length===8")
  assert.equal(await evaluate("document.querySelector('.admin-header h1').textContent"),'Operations & Payments')
  assert.equal(await evaluate("document.querySelector('.admin-navigation [aria-current=true]').textContent.trim()"),'Operations & Payments')
  const data=await evaluate("import('/src/admin/operationsPayments/operationsPaymentsService.js').then(m=>m.operationsPaymentsService.load())")
  const today=await evaluate("document.querySelector('#op-period-to').value")
  const first=await evaluate("document.querySelector('#op-period-from').value")
  const summaries=()=>evaluate("Object.fromEntries([...document.querySelectorAll('[data-summary]')].map(node=>[node.dataset.summary,node.textContent]))")
  const initialSummary=await summaries()
  assert.equal(await evaluate("document.querySelector('.op-heading').nextElementSibling === document.querySelector('.op-summary')"),true)
  assert.equal(await evaluate("document.querySelectorAll('.admin-operations-payments > .op-period').length"),0)
  await evaluate("document.querySelector('.op-info-button').focus()");await key('Enter')
  assert.equal(await evaluate("document.querySelector('.op-period-info').open"),true)
  assert.ok(await evaluate("document.querySelector('#op-period-explanation').textContent.includes('confirmation dates')"))
  await key('Escape');assert.equal(await evaluate("document.querySelector('.op-period-info').open"),false)
  assert.equal(await evaluate("document.activeElement === document.querySelector('.op-info-button')"),true)
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-summary]')].map(node=>node.dataset.summary)"),['orders','receiptsCents','refundsCents','pendingCents'])
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.op-summary-receiptsCents p')).color"),'rgb(8, 63, 61)')
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.op-summary-orders p')).color"),'rgb(8, 63, 61)')
  await evaluate("document.querySelector('#op-tab-orders').focus()");await key('End');assert.equal(await evaluate("document.querySelector('#op-tab-transactions').getAttribute('aria-selected')"),'true')
  await key('Home');assert.equal(await evaluate("document.querySelector('#op-tab-orders').getAttribute('aria-selected')"),'true')
  async function checkSummary(from,to){
    const expected={orders:data.orders.filter(order=>(!from||order.createdAt.slice(0,10)>=from)&&(!to||order.createdAt.slice(0,10)<=to)).length,receiptsCents:0,refundsCents:0,pendingCents:0}
    for(const transaction of data.transactions){const date=(transaction.status==='CONFIRMED'&&transaction.confirmedAt?transaction.confirmedAt:transaction.recordedAt).slice(0,10);if(from&&date<from||to&&date>to)continue;if(transaction.status==='CONFIRMED')expected[transaction.type==='PAYMENT'?'receiptsCents':'refundsCents']+=transaction.amountCents;else if(transaction.status==='PENDING'&&transaction.type==='PAYMENT')expected.pendingCents+=transaction.amountCents}
    const actual=await summaries();for(const[key,value]of Object.entries(expected))assert.equal(Number(actual[key].replace(/[^0-9.-]/g,'')),key==='orders'?value:value/100)
  }
  await checkSummary(first,today)
  await click('.op-footer nav button:last-child');assert.ok(await evaluate("document.querySelector('.op-footer nav').textContent.includes('2 of')"));assert.deepEqual(await summaries(),initialSummary)
  await input('.op-search input','Lina');assert.equal(await evaluate("document.querySelectorAll('.op-orders-table tbody tr').length"),4)
  assert.ok(await evaluate("document.querySelector('.op-footer nav').textContent.includes('1 of')"))
  await input('.op-search input','لينا');assert.equal(await evaluate("document.querySelectorAll('.op-orders-table tbody tr').length"),4)
  await input('.op-search input','Glucose');assert.ok(await evaluate("document.querySelectorAll('.op-orders-table tbody tr').length>0"))
  await input('.op-search input','سكر الدم');assert.ok(await evaluate("document.querySelectorAll('.op-orders-table tbody tr').length>0"))
  await input('.op-search input','ORD-3002');assert.equal(await evaluate("document.querySelectorAll('.op-orders-table tbody tr').length"),1)
  await input('.op-search input','');await input('.op-filter select','NEW');assert.equal(await evaluate("document.querySelectorAll('.op-orders-table tbody tr').length"),5)
  assert.deepEqual(await summaries(),initialSummary)
  await input('.op-filter select','all');await input('.op-footer select','16');assert.equal(await evaluate("document.querySelectorAll('.op-orders-table tbody tr').length"),16)
  await input('.op-footer select','8')
  const from=await evaluate(`import('/src/admin/operationsPayments/operationsPaymentsModel.js').then(m=>m.offsetDate(${JSON.stringify(today)},-4))`)
  const to=await evaluate(`import('/src/admin/operationsPayments/operationsPaymentsModel.js').then(m=>m.offsetDate(${JSON.stringify(today)},-1))`)
  await input('#op-period-from',from);await input('#op-period-to',to);await checkSummary(from,to)
  assert.equal(await evaluate("document.querySelectorAll('.op-orders-table tbody tr').length"),4)
  await input('.op-search input','ORD-3002');await click('#op-tab-transactions')
  assert.equal(await evaluate("document.querySelector('#op-period-from').value"),from);assert.equal(await evaluate("document.querySelector('#op-period-to').value"),to)
  assert.equal(await evaluate("document.querySelector('.op-search input').value"),'')
  const periodSummary=await summaries()
  await input('.op-search input','ORD-3006');assert.ok(await evaluate("document.querySelectorAll('.op-transactions-table tbody tr').length>0"),'Confirmed payment on an older order remains in period')
  await input('.op-search input','RF-');assert.ok(await evaluate("document.querySelectorAll('.op-transactions-table tbody tr').length>0"))
  const reference=await evaluate("document.querySelector('.op-transactions-table tbody tr th bdi').textContent")
  await input('.op-search input',reference);assert.equal(await evaluate("document.querySelectorAll('.op-transactions-table tbody tr').length"),1)
  await click('#op-tab-orders');assert.equal(await evaluate("document.querySelector('.op-search input').value"),'ORD-3002')
  await click('#op-tab-transactions');assert.equal(await evaluate("document.querySelector('.op-search input').value"),reference)
  assert.deepEqual(await summaries(),periodSummary)
  await input('.op-search input','');await input('.op-filter:nth-of-type(2) select','REFUND')
  await input('.op-filter:last-of-type select','CONFIRMED');assert.ok(await evaluate("[...document.querySelectorAll('tbody tr')].every(row=>row.textContent.includes('Refund')&&row.textContent.includes('Confirmed'))"))
  await input('.op-filter:last-of-type select','FAILED');assert.ok(await evaluate("document.querySelector('.op-empty') !== null"))
  await click('.op-empty button');await input('#op-period-from',today);await input('#op-period-to',from);assert.ok(await evaluate("document.querySelector('#op-to-error') !== null"))
  await click('.op-period button');await checkSummary(first,today)
  await input('.op-search input','not-a-reference');assert.ok(await evaluate("document.querySelector('.op-empty') !== null"));await click('.op-empty button')
  assert.ok(await evaluate("document.querySelector('.op-transactions-table') !== null"))
  await click('.op-footer nav button:last-child');assert.deepEqual(await summaries(),initialSummary)
  await input('.op-filter:last-of-type select','PENDING');assert.ok(await evaluate("document.querySelector('.op-footer nav').textContent.includes('1 of')"))
  await input('.op-filter:last-of-type select','all')
  for(const language of ['en','ar']){
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
    if(language==='ar')await click('.admin-language-control button[lang=ar]')
    for(const tab of ['orders','transactions']){
      await click(`#op-tab-${tab}`)
      await input('.op-search input','')
      for(const width of [1440,1280,1101,1024,768,390,320]){
        await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<761});await pause(90)
        assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false,`${language}/${tab}/${width}`)
        assert.equal(await evaluate("(()=>{const heading=document.querySelector('.op-heading'),summary=document.querySelector('.op-summary'),tabs=document.querySelector('.op-tabs'),toolbar=document.querySelector('.op-toolbar'),table=document.querySelector('.op-table-container');return heading.nextElementSibling===summary&&summary.getBoundingClientRect().bottom<=tabs.getBoundingClientRect().top&&tabs.getBoundingClientRect().bottom<=toolbar.getBoundingClientRect().top&&toolbar.getBoundingClientRect().bottom<=table.getBoundingClientRect().top})()"),true)
        await click('.op-info-button');assert.equal(await evaluate("document.querySelector('.op-period-info').open"),true)
        assert.equal(await evaluate("(()=>{const rect=document.querySelector('#op-period-explanation').getBoundingClientRect();return rect.left>=0&&rect.right<=innerWidth})()"),true)
        await key('Escape')
        const cards=await evaluate(`(()=>{const grid=document.querySelector('.op-summary'),cards=[...grid.children],rects=cards.map(card=>card.getBoundingClientRect());return {columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,ratio:rects[0].width/grid.getBoundingClientRect().width,heights:rects.map(r=>r.height),firstAtStart:${JSON.stringify(language)}==='ar'?rects[0].right>=rects[1].right:rects[0].left<=rects[1].left,equalWidths:Math.max(...rects.map(r=>r.width))-Math.min(...rects.map(r=>r.width))<1,labelsAligned:cards.every((card,index)=>cards.every((other,j)=>Math.abs(rects[index].top-rects[j].top)>1||Math.abs(card.querySelector('h3').getBoundingClientRect().top-other.querySelector('h3').getBoundingClientRect().top)<1)),zeroGap:getComputedStyle(grid).columnGap==='0px'&&getComputedStyle(grid).rowGap==='0px',valuesAligned:cards.every((card,index)=>cards.every((other,otherIndex)=>Math.abs(rects[index].top-rects[otherIndex].top)>1||Math.abs(card.querySelector('[data-summary]').getBoundingClientRect().top-other.querySelector('[data-summary]').getBoundingClientRect().top)<1)),amountsFit:cards.every(card=>{const value=card.querySelector('[data-summary]'),b=value.getBoundingClientRect(),r=card.getBoundingClientRect();return value.scrollWidth<=value.clientWidth+1&&b.left>=r.left&&b.right<=r.right})}})()`)
        assert.equal(cards.columns,width<=600?1:width<=1100?2:4)
        assert.ok(Math.max(...cards.heights)-Math.min(...cards.heights)<1)
        assert.equal(cards.firstAtStart,true);assert.equal(cards.amountsFit,true)
        assert.equal(cards.equalWidths,true);assert.equal(cards.zeroGap,true);assert.equal(cards.valuesAligned,true);assert.equal(cards.labelsAligned,true)
        const geometry=await evaluate("(()=>{const box=document.querySelector('.op-table-container'),r=box.getBoundingClientRect();return {fits:box.scrollWidth<=box.clientWidth+1,cells:[...box.querySelectorAll('tbody tr:first-child > td,tbody tr:first-child > th')].map(cell=>{const c=cell.getBoundingClientRect();return c.left>=r.left-1&&c.right<=r.right+1}),labels:[...box.querySelectorAll('tbody tr:first-child .op-cell-label')].every(label=>getComputedStyle(label).display!=='none')}})()")
        assert.equal(geometry.fits,true);assert.equal(geometry.cells.length,tab==='orders'?7:6);assert.ok(geometry.cells.every(Boolean));if(width<761)assert.equal(geometry.labels,true)
        await evaluate('window.scrollTo(0,0)');await screenshot(`operations-${language}-${tab}-${width}`)
      }
      await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
    }
  }
  await click('.admin-language-control button[lang=en]')
  assert.deepEqual(await evaluate("import('/src/admin/operationsPayments/operationsPaymentsService.js').then(m=>m.operationsPaymentsService.load())"),data)
  await evaluate("import('/src/admin/operationsPayments/operationsPaymentsService.js').then(({operationsPaymentsService:s})=>{window.operationsRealLoad=s.load;s.load=async()=>{throw new Error('test load failure')}})")
  async function revisit(){await evaluate("[...document.querySelectorAll('.admin-navigation button')].find(button=>button.textContent.trim()==='Dashboard').click()");await pause(60);await evaluate("[...document.querySelectorAll('.admin-navigation button')].find(button=>button.textContent.trim()==='Operations & Payments').click()")}
  await revisit();await waitFor("document.querySelector('.op-empty[role=alert]')");await evaluate("import('/src/admin/operationsPayments/operationsPaymentsService.js').then(({operationsPaymentsService:s})=>{s.load=window.operationsRealLoad})");await click('.op-empty button');await waitFor("document.querySelector('.op-orders-table')")
  await evaluate("import('/src/admin/operationsPayments/operationsPaymentsService.js').then(({operationsPaymentsService:s})=>{window.restoreOperationsLoad=s.load;s.load=async()=>({orders:[],transactions:[]})})")
  await revisit();await waitFor("document.querySelector('.op-empty').textContent.includes('No orders available')")
  await click('#op-tab-transactions');assert.ok(await evaluate("document.querySelector('.op-empty').textContent.includes('No transactions available')"))
  await evaluate("import('/src/admin/operationsPayments/operationsPaymentsService.js').then(({operationsPaymentsService:s})=>{s.load=window.restoreOperationsLoad})")
  assert.deepEqual(errors,[])
  console.log(`PASS: sidebar/direct route, orders/transactions tabs, bilingual patient/test search, order/reference search, status/type filters, shared date period, confirmation-date totals including older orders, gross/refund/pending summaries independent of search/pagination, page sizes/reset, invalid dates, read-only records, load retry, empty states and EN/AR desktop/mobile layouts. Screenshots: ${temporary}`)
}finally{socket?.close();browser?.kill();await server.close()}