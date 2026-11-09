import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

function flatten(value, prefix = '') {
  return Object.fromEntries(Object.entries(value).flatMap(([key, text]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof text === 'string' ? [[path, text]] : Object.entries(flatten(text, path))
  }))
}
let count = 0
for (const namespace of ['common', 'landing', 'auth']) {
  const read = language => flatten(JSON.parse(fs.readFileSync(`src/locales/${language}/${namespace}.json`, 'utf8')))
  const en = read('en')
  const ar = read('ar')
  assert.deepEqual(Object.keys(ar).sort(), Object.keys(en).sort(), `${namespace}: translation keys match`)
  for (const key of Object.keys(en)) {
    assert.ok(en[key].trim() && ar[key].trim(), `${namespace}:${key} is nonempty`)
    const placeholders = value => [...value.matchAll(/{{(.*?)}}/g)].map(match => match[1]).sort()
    assert.deepEqual(placeholders(en[key]), placeholders(ar[key]), `${namespace}:${key} interpolation matches`)
    assert.ok(/[\u0600-\u06ff]/u.test(ar[key]), `${namespace}:${key} includes Arabic copy`)
    count++
  }
}

const storage = new Map([['smart-lims.language', 'ar']])
const meta = { content: '', setAttribute(name, value) { this[name] = value } }
globalThis.window = {
  localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  },
}
globalThis.document = {
  documentElement: {},
  title: '',
  querySelector: () => meta,
}
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
try {
  const { default: i18n } = await server.ssrLoadModule('/src/i18n.js')
  const { default: App } = await server.ssrLoadModule('/src/App.jsx')
  assert.equal(i18n.resolvedLanguage, 'ar', 'restores Arabic from storage')
  for (const language of ['ar', 'en', 'ar']) {
    await i18n.changeLanguage(language)
    assert.equal(document.documentElement.lang, language)
    assert.equal(document.documentElement.dir, language === 'ar' ? 'rtl' : 'ltr')
    assert.equal(storage.get('smart-lims.language'), language)
    assert.equal(document.title, i18n.t('landing:meta.title'))
    assert.equal(meta.content, i18n.t('landing:meta.description'))
    const markup = renderToStaticMarkup(createElement(App))
    for (const key of ['hero.title1', 'roles.patient.title', 'months.Jan', 'cta.button', 'testimonial.quote']) {
      const translated = renderToStaticMarkup(createElement('span', null, i18n.t(`landing:${key}`))).slice(6, -7)
      assert.ok(markup.includes(translated), `render includes ${language} ${key}`)
    }
    assert.ok(markup.includes('value="6 months" selected=""'), 'chart selection retains a stable value')
    assert.ok(!markup.match(/(?:landing|common):[\w.]+/), 'no unresolved translation keys')
    assert.ok(markup.includes('dir="ltr"'), 'direction isolation remains available for chart, email and brand')
  }
  window.localStorage.setItem = () => { throw new Error('Storage blocked') }
  await i18n.changeLanguage('en')
  assert.equal(document.documentElement.dir, 'ltr', 'blocked storage does not prevent switching')
  console.log(`Localization checks passed: ${count} translation pairs, persistence, RTL/LTR, metadata, rendering and blocked storage.`)
} finally {
  await server.close()
  delete globalThis.window
  delete globalThis.document
}

