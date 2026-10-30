import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import Harness from './PatientCopyHarness.jsx'

// Explicit browser-test entry, never imported or routed by App.
export function mountPatientCopyHarness() {
  if (!import.meta.env.DEV) throw new Error('UI_COPY_HARNESS_DISABLED')
  const root = document.createElement('div'); document.body.replaceChildren(root)
  createRoot(root).render(createElement(Harness))
}
