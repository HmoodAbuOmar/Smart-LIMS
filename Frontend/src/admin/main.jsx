import React from 'react'
import { createRoot } from 'react-dom/client'

// This standalone entry is also a demo, not a production authentication bypass.
if (import.meta.env.DEV) {
  void import('../dev/DevelopmentAdmin.jsx').then(({ default: DevelopmentAdmin }) => {
    createRoot(document.getElementById('root')).render(
      <React.StrictMode><DevelopmentAdmin /></React.StrictMode>,
    )
  })
}
