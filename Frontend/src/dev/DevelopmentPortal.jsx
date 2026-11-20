import { useState } from 'react'
import PatientPortal from '../portal/PatientPortal.jsx'
import { previewBooking } from './previewBooking.js'
import { developmentWorkspace, retainDevelopmentWorkspace, developmentPortalRoute, retainDevelopmentRoute } from './portalWorkspace.js'

export default function DevelopmentPortal({ route, onNavigate, onBack }) {
  const [data] = useState(developmentWorkspace)
  const [localRoute, setLocalRoute] = useState(developmentPortalRoute)
  if (!import.meta.env.DEV) return null
  return <PatientPortal development previewBooking={previewBooking} initialData={data} onStateChange={retainDevelopmentWorkspace} route={route || localRoute} onNavigate={page => { retainDevelopmentRoute(page); (onNavigate || setLocalRoute)(page) }} onBack={onBack} onExit={() => { window.location.hash = '/login' }} />
}
