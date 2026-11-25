const fs = require('node:fs')
const path = require('node:path')
const { randomUUID, randomBytes } = require('node:crypto')
if (!process.argv[2] || process.env.SMART_LIMS_VERIFIED_TEST_DATABASE !== 'smart_lims_test_db') {
  throw new Error('Provide the Cloud export path and verify the local test database before running')
}
if (process.env.SMART_LIMS_ALLOW_TEST_WRITES !== 'true' || process.env.SMART_LIMS_ALLOW_TEST_MAIL !== 'true') {
  throw new Error('This fixture runner requires separate local write and Mailpit opt-ins after verification')
}
const newmanModule = require.resolve(process.env.NEWMAN_MODULE || 'newman')
const newman = require(newmanModule)
const exported = require(path.resolve(process.argv[2]))
const source = exported.collection || exported
if (source.info.uid !== '47476256-e945ab8d-2f97-41e2-9ee7-e578049ec179' &&
    source.info._postman_id !== 'e945ab8d-2f97-41e2-9ee7-e578049ec179') {
  throw new Error('Use the original Smart-LIMS API collection export')
}
const entries = new Map(source.item.flatMap(group => group.item.map(item => [item.name, { group, item }])))
const baseUrl = 'http://127.0.0.1:8081'
const stamp = Date.now().toString(36)
const password = 'T9!a' + randomBytes(18).toString('hex')
const adminEmail = process.env.SMART_LIMS_DISPOSABLE_ADMIN_EMAIL || 'smart-lims-test-admin@example.test'
if (!/^smart-lims-[a-z0-9-]+@example\.test$/.test(adminEmail)) {
  throw new Error('The runner requires a dedicated Smart-LIMS disposable administrator')
}
const patientEmail = 'smart-lims-patient-' + stamp + '@example.test'
const secondPatient = 'smart-lims-link-' + stamp + '@example.test'
const iso = offset => new Date(Date.now() + offset).toISOString()
const day = 86400000
const values = {
  baseUrl, verifiedTestDatabase: 'smart_lims_test_db', allowTestWrites: process.env.SMART_LIMS_ALLOW_TEST_WRITES,
  allowEmailSending: process.env.SMART_LIMS_ALLOW_TEST_MAIL, todayTab: 'arrivals',
  loginIdentifier: adminEmail, password, patientFullName: 'Disposable Test Patient', patientEmail,
  patientPassword: password, recoveryEmail: patientEmail, newPassword: password,
  newUserFullName: 'Disposable Lab User', newUserEmail: 'smart-lims-lab-' + stamp + '@example.test',
  newUserName: 'testlab' + stamp, newUserPhone: '+15550102025', newUserRole: 'LAB_TECHNICIAN',
  createdFrom: iso(-day), createdTo: iso(day), fromDate: iso(-day).slice(0, 10), toDate: iso(14 * day).slice(0, 10),
  from: iso(-day), to: iso(14 * day), slotStartsAt: iso(2 * day), slotEndsAt: iso(2 * day + 3600000),
  arrivedAt: iso(-120000), completedAt: iso(-60000), measuredAt: iso(-90000), sampleType: 'Blood',
  cancellationReason: 'Disposable API test', rejectionReason: 'Disposable API test', correctionReason: 'Disposable API test',
  paymentMethod: 'CASH', refundReason: 'Disposable refund recording fixture'
}
const rows = new Map()
const reportPath = 'Smart-LIMS Postman Cloud Synchronized Run.md'
const appointmentFollowup = process.env.SMART_LIMS_APPOINTMENT_FOLLOWUP === '1'
const baseline = appointmentFollowup ? fs.readFileSync(reportPath,'utf8') : ''
const cookies = require(require.resolve('postman-request', { paths: [path.dirname(newmanModule)] })).jar()
const roles = { ADMIN: 'admin', PATIENT: 'patient', LAB_TECHNICIAN: 'labTechnician', RECEPTIONIST: 'receptionist' }
const patientRequests = new Set(['Create My Patient Record','Get My Patient Dashboard','Get My Patient Profile','Get My Patient Record','Link My Patient Record','Update My Patient Profile','Create My Order','Get My Order','List My Orders','Get My Appointment','List My Appointments','Get My Archived Visit','Get My Visit','List My Visit Archive Tests','List My Visit Archive','List My Visits','Download My Result Report','Get My Health Trend','Get My Result','List My Result History','List My Results','List My Trend Biomarkers','Get My Unread Notification Count','List My Notifications','Mark All Notifications Read','Mark Notification Read'])
const labRequests = new Set(['Create Result Correction','Create Result Draft','Update Result Draft'])
const publicRequests = new Set(['Confirm Email','Cookie Login','Forgot Password','Get CSRF Token','Login','Logout','Register Patient','Reset Password','Set Password (Accept Invitation)'])
const prerequisites = []

async function request(path, body, token, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(baseUrl + path, {
    method, headers: { ...(body === undefined ? {} : {'Content-Type':'application/json','Idempotency-Key':randomUUID()}), ...(token ? {Authorization:'Bearer ' + token} : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(45000)
  })
  return {status: response.status, headers: response.headers, body: await response.json().catch(() => null)}
}

async function mail(address, subject, required = true) {
  for (let attempt = 0; attempt < (required ? 12 : 2); attempt++) {
    const response = await fetch('http://127.0.0.1:8025/api/v1/messages', {signal: AbortSignal.timeout(5000)})
    const {messages = []} = await response.json()
    const match = messages.find(item => item.Subject === subject && item.To.some(to => to.Address.toLowerCase() === address))
    if (match) {
      const response = await fetch('http://127.0.0.1:8025/api/v1/message/' + match.ID, {signal: AbortSignal.timeout(5000)})
      return (await response.json()).Text || ''
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  return ''
}

function links(text) {
  const match = text.match(/userId=([\w-]+)&token=([^\s<]+)/)
  return match ? {id:match[1],token:decodeURIComponent(match[2])} : {}
}

async function login(address) {
  const response = await request('/api/auth/login', {emailOrUserName:address,password})
  return response.body?.token
}

function cleanReason(error) {
  const msg = error?.message || ''
  if (/^(Set local variable \w+|Set current \w+|Verify the disposable test database|Use only disposable users|Fill required request inputs|Log in as |Send Get CSRF Token)/.test(msg)) return msg
  if (msg === "Identifier 'data' has already been declared") return 'Saved test script redeclared Newman reserved identifier data'
  if (/^[A-Za-z][A-Za-z0-9 .()/_-]{0,120}$/.test(msg)) return msg
  if (/expected .* to be one of \[/.test(msg)) return 'HTTP status differed from the saved expectation'
  return error?.name || 'Saved check failed'
}

async function run(name, role, overrides = {}) {
  if (rows.has(name)) return rows.get(name).body
  const entry = entries.get(name)
  if (!entry) throw new Error('Unknown collection request')
  const requiredRole = role || (patientRequests.has(name) ? 'PATIENT' : labRequests.has(name) ? 'LAB_TECHNICIAN' : 'ADMIN')
  const vars = {...values, expectedRole: requiredRole, idempotencyKey: randomUUID(), ...overrides}
  const tokenName = roles[requiredRole] + 'AccessToken'
  if (!publicRequests.has(name) && !vars[tokenName]) {
    rows.set(name, {state:'BLOCKED',reason:'No valid disposable ' + requiredRole + ' authentication'})
    return
  }
  const item = structuredClone(entry.item)
  if (overrides.cookieHeader) item.request.header.push({key:'Cookie',value:overrides.cookieHeader})
  if (item.request.body?.mode === 'raw') {
    const body = JSON.parse(item.request.body.raw)
    if (['Create Lab Test','Update Lab Test','Update Lab Test Details'].includes(name)) body.code = 'CBC' + stamp.toUpperCase()
    item.request.body.raw = JSON.stringify(body)
  }
  const collection = {...source, item:[{...entry.group, item:[item]}]}
  const environment = {name:'Disposable local API run',values:Object.entries(vars).filter(([,v]) => v !== undefined && v !== null).map(([key,value]) => ({key,value:String(value),enabled:true}))}
  const summary = await new Promise((resolve,reject) => newman.run({collection,environment,cookieJar:cookies,reporters:[],timeoutRequest:45000,timeoutScript:5000,ignoreRedirects:true},(error,result) => error ? reject(error) : resolve(result)))
  const execution = summary.run.executions.find(item => item.response || item.request)
  const response = execution?.response
  const failures = summary.run.failures || []
  const labels = failures.map(item => item.error?.test || cleanReason(item.error))
  let body
  if (response) {
    try { body = response.json() } catch {}
    for (const variable of summary.environment.values.all()) {
      if (variable.key in overrides || ['expectedRole','idempotencyKey'].includes(variable.key)) continue
      if (vars[variable.key] !== variable.value) values[variable.key] = variable.value
    }
    if (response.code >= 200 && response.code < 300) {
      if (name === 'Login' && body?.token) values[tokenName] = body.token
      if (name === 'Issue Patient Link Token' && body?.token) values.patientLinkToken = body.token
    }
  }
  if (typeof body?.code === 'string' && /^[A-Z_]{3,80}$/.test(body.code) && response.code >= 400) labels.push('API code ' + body.code)
  const reason = [...new Set(labels)].join(', ') || (response ? '' : 'Saved pre-request script skipped the request')
  const assertionCount = summary.run.stats.assertions.total
  rows.set(name, {state:response ? failures.length || !assertionCount ? 'FAIL' : 'PASS' : 'BLOCKED',status:response?.code,assertionCount,reason:reason || (!assertionCount ? 'No saved assertion completed' : ''),body})
  console.log(name + ' ' + rows.get(name).state + (response ? ' HTTP ' + response.code : '') + (reason ? ' ' + reason : ''))
  return body
}

async function auth() {
  const recovery = await request('/api/auth/forgot-password',{email:adminEmail})
  const adminCode = (await mail(adminEmail,'Smart-LIMS password reset')).match(/reset code is (\d+)/i)?.[1]
  if (adminCode) {
    const reset = await request('/api/auth/reset-password',{email:adminEmail,code:adminCode,newPassword:password})
    prerequisites.push('Existing disposable administrator password recovery returned HTTP ' + reset.status)
  } else prerequisites.push('Disposable administrator password recovery could not capture a code after HTTP ' + recovery.status)
  await run('Login')
  values.adminAccessToken ||= await login(adminEmail)
  await run('Get Current Account')
  await run('Get CSRF Token')
  const csrf = await request('/api/auth/csrf-token')
  const csrfCookie = csrf.headers.getSetCookie().find(value => value.startsWith('XSRF-TOKEN='))?.split(';')[0]
  if (csrfCookie) {
    await run('Cookie Login','ADMIN',{xsrfToken:decodeURIComponent(csrfCookie.slice('XSRF-TOKEN='.length)),cookieHeader:csrfCookie})
    const jarHeader = cookies.getCookieStringSync(baseUrl + '/api/auth/logout')
    const cookie = jarHeader.split('; ').find(value => value.startsWith('XSRF-TOKEN='))
    if (cookie) await run('Logout','ADMIN',{xsrfToken:decodeURIComponent(cookie.slice('XSRF-TOKEN='.length)),cookieHeader:jarHeader})
  }
  await run('Register Patient')
  const verify = links(await mail(patientEmail, 'Verify your Smart-LIMS email', false))
  if (verify.token) await run('Confirm Email', 'PATIENT', {verificationToken:verify.token,verificationUserId:verify.id})
  values.patientAccessToken = await login(patientEmail)
  await run('Forgot Password')
  const reset = (await mail(patientEmail, 'Smart-LIMS password reset', false)).match(/reset code is (\d+)/i)?.[1]
  if (reset) {
    const newPassword = 'R9!a' + randomBytes(18).toString('hex')
    await run('Reset Password', 'PATIENT', {resetCode:reset,newPassword})
    values.patientAccessToken = (await request('/api/auth/login',{emailOrUserName:patientEmail,password:newPassword})).body?.token || values.patientAccessToken
  }
}

async function users() {
  await run('Create User')
  await run('Get User')
  await run('List Users')
  await run('List Users Page')
  await run('Get User Block Status')
  await run('Block User')
  await run('Unblock User')
  await run('Bulk Block Users')
  await run('Bulk Unblock Users')
  await run('Update User')
  await run('Send Set Password Email')
  if (values.adminAccessToken) {
    const email = 'smart-lims-technician-' + stamp + '@example.test'
    const created = await request('/api/users', {fullName:'Disposable Technician',email,userName:'scopetech'+stamp,phoneNumber:'+15550102026',role:'LAB_TECHNICIAN'},values.adminAccessToken)
    const invite = created.status >= 200 && created.status < 300 ? links(await mail(email,'Set your Smart-LIMS password')) : {}
    if (invite.token) {
      await run('Set Password (Accept Invitation)','LAB_TECHNICIAN',{invitationUserId:invite.id,invitationToken:invite.token})
      values.labTechnicianAccessToken = await login(email)
    }
    const receptionistEmail = 'smart-lims-reception-' + stamp + '@example.test'
    const receptionist = await request('/api/users',{fullName:'Disposable Receptionist',email:receptionistEmail,userName:'reception'+stamp,phoneNumber:'+15550102027',role:'RECEPTIONIST'},values.adminAccessToken)
    if (receptionist.status === 200) {
      const invite = links(await mail(receptionistEmail,'Set your Smart-LIMS password'))
      if (invite.token) {
        const accepted = await request('/api/auth/set-password',{userId:invite.id,token:invite.token,newPassword:password})
        if (accepted.status === 200) values.receptionistAccessToken = await login(receptionistEmail)
      }
    }
  }
  await run('Change User Role','ADMIN',{newUserRole:'RECEPTIONIST'})
  await run('Delete User')
}

async function workflow() {
  await auth()
  await users()
  for (const name of ['Create Lab Test','Create Test Parameter','Get Lab Test By ID','List Lab Tests','List Test Parameters','Update Lab Test','Update Test Parameter','Create Reference Range','List Reference Ranges','List Sample Types','Update Lab Test Details','Create Patient','Update Patient','Get Patient','List Patients','Issue Patient Link Token','Create My Patient Record','Get My Patient Record','Get My Patient Profile','Update My Patient Profile','Get My Patient Dashboard']) await run(name)
  if (values.patientLinkToken) {
    await request('/api/auth/register',{fullName:'Disposable Link Patient',email:secondPatient,password,confirmPassword:password})
    const verify = links(await mail(secondPatient,'Verify your Smart-LIMS email',false))
    if (verify.token) {
      await request('/api/auth/confirm-email?'+new URLSearchParams({userId:verify.id,token:verify.token}))
      const token = await login(secondPatient)
      if (token) await run('Link My Patient Record','PATIENT',{patientAccessToken:token})
    }
  }
  await run('Create Staff Order', values.receptionistAccessToken ? 'RECEPTIONIST' : 'ADMIN')
  await run('List Admin Orders')
  await run('Get Admin Order')
  await run('Cancel Order','ADMIN')
  const schedule = await request('/api/appointment-slots/schedule?'+new URLSearchParams({from:iso(day),to:iso(13*day),page:'0',size:'100'}),undefined,values.adminAccessToken)
  const occupied = schedule.body?.content || []
  const duration = 15*60000
  const firstCandidate = Date.now()+5*day
  const gap = Array.from({length:192},(_,index)=>firstCandidate+index*duration).find(start =>
    occupied.every(slot => Date.parse(slot.endsAt) <= start || Date.parse(slot.startsAt) >= start+duration))
  if (gap) {
    values.slotStartsAt = new Date(gap).toISOString()
    values.slotEndsAt = new Date(gap+duration).toISOString()
  }
  for (const name of ['Create My Order','Get My Order','List My Orders','Create Appointment Slot','List Available Appointment Slots','List Appointment Slot Schedule','Book Appointment','Get My Appointment']) await run(name)
  if (values.patientAccessToken) {
    const me = await request('/api/auth/me',undefined,values.patientAccessToken)
    const list = await request('/api/appointments/me?tab=UPCOMING&page=0&size=20',undefined,values.patientAccessToken)
    prerequisites.push('Independent appointment-list reproduction with the same fresh patient bearer token returned account HTTP ' + me.status + ' and appointment list HTTP ' + list.status + '.')
  }
  for (const name of ['List My Appointments','List Appointment Alternatives','Update Appointment Slot']) await run(name)
  if (values.appointmentId && values.adminAccessToken) {
    const extra = await request('/api/appointment-slots',{startsAt:iso(11*day),endsAt:iso(11*day+900000),capacity:1,active:true},values.adminAccessToken)
    if (extra.body?.id) await run('Reschedule Appointment','ADMIN',{slotId:extra.body.id})
  }
  if (values.adminAccessToken && values.patientId && values.labTestId) {
    const r = values.receptionistAccessToken || values.adminAccessToken
    const fixtureOrder = () => request('/api/orders',{patientId:values.patientId,testIds:[values.labTestId]},r)
    const fixtureSlot = (start,end) => request('/api/appointment-slots',{startsAt:start,endsAt:end,capacity:1,active:true},r)
    const fixtureBook = (orderId,slotId) => request('/api/appointments',{orderId,slotId},r)
    const cancelled = await fixtureOrder()
    const cancelSlot = await fixtureSlot(iso(12*day),iso(12*day+900000))
    if (cancelled.body?.id && cancelSlot.body?.id) {
      const booked = await fixtureBook(cancelled.body.id,cancelSlot.body.id)
      if (booked.body?.id) await run('Cancel Appointment','ADMIN',{appointmentId:booked.body.id})
    }
    const noShowOrder = await request('/api/orders/me',{testIds:[values.labTestId]},values.patientAccessToken)
    const noShowEnd = Date.now()+46000
    const noShowSlot = await request('/api/appointment-slots',{startsAt:new Date(noShowEnd-1000).toISOString(),endsAt:new Date(noShowEnd).toISOString(),capacity:1,active:true},values.adminAccessToken)
    if (noShowOrder.body?.id && noShowSlot.body?.id) {
      const booked = await request('/api/appointments',{orderId:noShowOrder.body.id,slotId:noShowSlot.body.id},values.patientAccessToken)
      if (booked.body?.id) values.noShow = {id:booked.body.id,version:booked.body.version,end:noShowEnd}
    }
  }
  const arrivalRole = values.receptionistAccessToken ? 'RECEPTIONIST' : 'ADMIN'
  const scheduled = await scheduledArrivalFixture(arrivalRole)
  await run('Record Visit Arrival',arrivalRole,scheduled || {})
  for (const name of ['Get Visit','Get My Visit','List Visits','List My Visits']) await run(name)
  for (const name of ['Create Sample','Get Sample','List Samples','Receive Sample','Attest Sample']) await run(name,values.labTechnicianAccessToken ? 'LAB_TECHNICIAN' : 'ADMIN')
  if (values.visitId && values.labTechnicianAccessToken) {
    const rejected = await request('/api/samples',{visitId:values.visitId,sampleType:values.sampleType,containerType:null,collectedAt:null,replacesSampleId:null},values.labTechnicianAccessToken)
    if (rejected.body?.id) await run('Reject Sample','LAB_TECHNICIAN',{sampleId:rejected.body.id,sampleVersion:rejected.body.version})
  }
  for (const name of ['Create Result Draft','Get Result Draft','Update Result Draft','Approve Result','Publish Result','List Result Work Items','List Result Versions','List My Results','Get My Result','List My Result History','Download My Result Report','List My Trend Biomarkers','Get My Health Trend','List My Notifications','Get My Unread Notification Count']) {
    const result = await run(name)
    if (name === 'List My Notifications' && result?.content?.[0]?.id) values.notificationId = result.content[0].id
  }
  for (const name of ['Mark Notification Read','Mark All Notifications Read','Complete Visit','List My Visit Archive','Get My Archived Visit','List My Visit Archive Tests','Create Result Correction','Update Lab Test Status','Get Admin Dashboard','List Audit Logs','Get Operations Report']) await run(name)
  if (values.noShow) {
    const {end,id,version} = values.noShow
    if (end > Date.now()) await new Promise(resolve => setTimeout(resolve,end-Date.now()+100))
    await run('Mark Appointment No Show',values.receptionistAccessToken ? 'RECEPTIONIST' : 'ADMIN',{appointmentId:id,appointmentVersion:version})
  }
  await receptionistWorkflow()
  for (const name of entries.keys()) await run(name)
}

async function receptionistWorkflow() {
  const receptionist = 'RECEPTIONIST'
  const token = values.receptionistAccessToken
  for (const name of ['List Today Appointments','List Receptionist Appointments','List Receptionist Orders',
    'List Payment Eligible Orders','List Receptionist Payments']) await run(name,receptionist)
  if (!token || !values.patientId || !values.labTestId) return
  const created = await request('/api/orders',{patientId:values.patientId,testIds:[values.labTestId]},token)
  const orderId = created.body?.id
  if (!orderId || !(created.body.totalAmount > 0)) return
  const amount = Math.min(1, created.body.totalAmount)
  const payment = await run('Record Payment',receptionist,{orderId,paymentAmount:amount})
  const transaction = payment?.transaction
  if (!transaction?.id) return
  const blocked = await request('/api/orders/'+orderId+'/cancel',{reason:values.cancellationReason},token)
  if (blocked.status !== 409 || blocked.body?.code !== 'ORDER_REFUND_REQUIRED') {
    throw new Error('Paid fixture cancellation was not blocked')
  }
  prerequisites.push('Paid fixture cancellation returned ORDER_REFUND_REQUIRED.')
  await run('Get Payment Receipt',receptionist,{paymentTransactionId:transaction.id})
  await run('List Order Payment Transactions','ADMIN',{orderId})
  const refund = await run('Record Order Refund','ADMIN',{orderId,originalPaymentId:transaction.id,refundAmount:amount,
    refundConfirmationReference:'synthetic-'+randomUUID(),refundOccurredAt:iso(0)})
  if (refund?.transaction?.id) {
    // The existing Cancel Order row covers unpaid cancellation. Verify the refunded fixture separately.
    const cancellation = await request('/api/orders/'+orderId+'/cancel',{reason:values.cancellationReason},token)
    if (cancellation.status !== 200 || cancellation.body?.status !== 'CANCELLED') {
      throw new Error('Refunded fixture cancellation failed')
    }
    prerequisites.push('Refunded fixture cancellation returned HTTP 200.')
  }
  await run('Get Receptionist Order',receptionist,{orderId})
}

async function scheduledArrivalFixture(role) {
  const staff = values[roles[role]+'AccessToken']
  if (!staff || !values.patientAccessToken || !values.labTestId) return
  const localDay = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem'})
  const start = new Date(Date.now()+10*60000)
  if (localDay.format(start) !== localDay.format(new Date())) return
  const slot = await request('/api/appointment-slots',{startsAt:start.toISOString(),
    endsAt:new Date(start.getTime()+60000).toISOString(),capacity:1,active:true},staff)
  if (!slot.body?.id) return
  const order = await request('/api/orders/me',{testIds:[values.labTestId]},values.patientAccessToken)
  const item = order.body?.items?.[0]?.id
  if (!order.body?.id || !item) return
  const booked = await request('/api/appointments',{orderId:order.body.id,slotId:slot.body.id},staff)
  if (!booked.body?.id) return
  return {orderId:order.body.id,orderItemId:item,visitAppointmentId:booked.body.id,
    appointmentVersion:booked.body.version,arrivedAt:iso(0)}
}

async function appointmentWorkflow() {
  await request('/api/auth/forgot-password',{email:adminEmail})
  const code = (await mail(adminEmail,'Smart-LIMS password reset')).match(/reset code is (\d+)/i)?.[1]
  if (!code) throw new Error('Admin recovery message unavailable')
  const reset = await request('/api/auth/reset-password',{email:adminEmail,code,newPassword:password})
  if (reset.status !== 200) throw new Error('Admin recovery failed')
  values.adminAccessToken = await login(adminEmail)
  if (!values.adminAccessToken) throw new Error('Admin login failed')
  const register = await request('/api/auth/register',{fullName:values.patientFullName,email:patientEmail,password,confirmPassword:password})
  const verify = links(await mail(patientEmail,'Verify your Smart-LIMS email'))
  if (register.status !== 200 || !verify.token) throw new Error('Patient registration fixture failed')
  await request('/api/auth/confirm-email?'+new URLSearchParams({userId:verify.id,token:verify.token}))
  values.patientAccessToken = await login(patientEmail)
  if (!values.patientAccessToken) throw new Error('Patient login failed')
  const p = await request('/api/patients/me',{fullName:'Disposable Appointment Patient',dateOfBirth:'2000-01-01',gender:'UNKNOWN',phoneNumber:'+970590000000',address:null},values.patientAccessToken)
  const t = await request('/api/lab-tests',{code:'FIX'+stamp.toUpperCase(),name:'Disposable Appointment Test',description:'Appointment fixture',price:25,currency:'ILS',sampleType:'Blood',categories:[]},values.adminAccessToken)
  if (!p.body?.id || !t.body?.id) throw new Error('Appointment fixture create failed')
  const createOrder = () => request('/api/orders/me',{testIds:[t.body.id]},values.patientAccessToken)
  if (/^\| Mark Appointment No Show \| (?:BLOCKED|FAIL) \|/m.test(baseline)) {
    const missedOrder = await createOrder()
    const start = Date.now()+45000
    const end = start+1000
    const short = await request('/api/appointment-slots',{startsAt:new Date(start).toISOString(),endsAt:new Date(end).toISOString(),capacity:1,active:true},values.adminAccessToken)
    if (!missedOrder.body?.id || !short.body?.id) throw new Error('No-show order or slot fixture failed')
    const booked = await request('/api/appointments',{orderId:missedOrder.body.id,slotId:short.body.id},values.patientAccessToken)
    prerequisites.push('Independent no-show fixture booking returned HTTP ' + booked.status + '.')
    if (!booked.body?.id) throw new Error('No-show booking fixture failed')
    if (end > Date.now()) await new Promise(resolve => setTimeout(resolve,end-Date.now()+250))
    await run('Mark Appointment No Show','ADMIN',{appointmentId:booked.body.id,appointmentVersion:booked.body.version})
  }
  if (!/^\| (?:Create Appointment Slot|Book Appointment|Get My Appointment|List Appointment Alternatives|Update Appointment Slot|Reschedule Appointment) \| (?:BLOCKED|FAIL) \|/m.test(baseline)) return
  const order = await createOrder()
  if (!order.body?.id) throw new Error('Appointment order fixture failed')
  values.orderId = order.body.id
  values.slotStartsAt = iso(8*day)
  values.slotEndsAt = iso(8*day+900000)
  await run('Create Appointment Slot')
  await run('Book Appointment','PATIENT')
  await run('Get My Appointment','PATIENT')
  await run('List Appointment Alternatives','PATIENT')
  await run('Update Appointment Slot')
  const target = await request('/api/appointment-slots',{startsAt:iso(9*day),endsAt:iso(9*day+900000),capacity:1,active:true},values.adminAccessToken)
  if (target.body?.id) await run('Reschedule Appointment','ADMIN',{slotId:target.body.id})
}

function report(error) {
  if (appointmentFollowup) {
    const initial = {PASS:0,FAIL:0,BLOCKED:0}
    for (const line of baseline.split(/\r?\n/)) {
      const match = line.match(/^\| (.*?) \| (PASS|FAIL|BLOCKED) \| (.*?) \| (.*?) \| (.*?) \|$/)
      if (!match || !entries.has(match[1])) continue
      initial[match[2]]++
      if (rows.get(match[1])?.status) continue
      rows.set(match[1],{state:match[2],status:match[3],assertionCount:match[4],reason:match[5]})
    }
    prerequisites.unshift(...baseline.split(/\r?\n/).filter(line => line.startsWith('- ')).map(line => line.slice(2)))
    prerequisites.push(`The main rerun recorded ${initial.PASS} PASS, ${initial.FAIL} FAIL and ${initial.BLOCKED} BLOCKED. The follow-up used dedicated appointment fixtures. The table records the latest observed HTTP result per saved request.`)
  }
  for (const name of entries.keys()) if (!rows.has(name)) rows.set(name,{state:'BLOCKED',reason:'Run ended before dispatch'})
  const counts = Object.fromEntries(['PASS','FAIL','BLOCKED'].map(status => [status,[...rows.values()].filter(row => row.state === status).length]))
  const lines = [
    '# Smart-LIMS Postman Cloud API test run','',
    'Collection UID `47476256-e945ab8d-2f97-41e2-9ee7-e578049ec179`. The runner loaded '+entries.size+' saved requests.',
    '', 'Expected isolated target `http://127.0.0.1:8081` with `smart_lims_test_db` and Mailpit. Verify the database and Flyway history separately.',
    '', '| Total | Executed | PASS | FAIL | BLOCKED |','| ---: | ---: | ---: | ---: | ---: |',
    `| ${entries.size} | ${counts.PASS + counts.FAIL} | ${counts.PASS} | ${counts.FAIL} | ${counts.BLOCKED} |`,
    '', 'HTTP calls made to prepare disposable fixtures are excluded from the collection counts. A request counts as executed only when Newman records an HTTP response.',
    ...prerequisites.map(message => '- ' + message),
    ...(error ? ['','Runner stopped with ' + error.name + '.'] : []),
    '', '## Request results', '', '| Request | Result | HTTP | Checks | Reason |','| --- | --- | ---: | ---: | --- |',
    ...[...entries.keys()].map(name => {const r = rows.get(name);return `| ${name} | ${r.state} | ${r.status ?? ''} | ${r.assertionCount ?? ''} | ${r.reason || ''} |`}),
    '', '## Backend defect evidence', '',
    'Failures are reported above. A failed assertion or rejected fixture does not by itself establish a Backend defect.',
    'Read-only inspection found one administrator from first-admin provisioning. Its historical invitation was recorded as consumed before the account was recorded as accepted. The earlier run used a direct fixture update, so this state does not reproduce a first-admin defect. The application rejects fresh first-admin provisioning when any administrator exists. This retest used normal password recovery for the existing disposable account.',
    'The current API has no payment or refund transaction endpoint. The operations report exposes the financial capability as unsupported. This run did not fabricate a payment.'
  ]
  fs.writeFileSync(reportPath,lines.join('\n')+'\n')
  console.log(JSON.stringify(counts))
}

(appointmentFollowup ? appointmentWorkflow : workflow)().then(() => report(), error => { console.log('Runner stopped: '+error.name); report(error); process.exitCode = 1 })
