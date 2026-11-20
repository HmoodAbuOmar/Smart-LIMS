import React from 'react'
import { createRoot } from 'react-dom/client'

// This standalone entry is also a demo, not a production authentication bypass.
if (import.meta.env.DEV) {
  void import('./AdminPreview.jsx').then(({ default: AdminPreview }) => {
    createRoot(document.getElementById('root')).render(
      <React.StrictMode><AdminPreview /></React.StrictMode>,
    )
  })
}
