import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { emptyPatientFile, PatientFileState } from '../utils/patientFileState.js'

// A navigation draft, never browser storage or an authenticated session.
export default function PatientFileStateProvider({ children }) {
  const [values, setValues] = useState(emptyPatientFile)
  const owner = useRef(null)
  const clear = useCallback(() => { owner.current = null; setValues(emptyPatientFile) }, [])
  const bindOwner = useCallback(userId => {
    if (typeof userId !== 'string' || !userId.trim()) {
      owner.current = null
      setValues(emptyPatientFile)
    } else if (owner.current !== userId) {
      owner.current = userId
      setValues(emptyPatientFile)
    }
  }, [])
  useEffect(() => {
    function routeChanged() {
      const route = window.location.hash.split('?')[0]
      if (!['#/patient/file', '#/patient/file/new', '#/patient/file/link'].includes(route)) clear()
    }
    function restored(event) { if (event.persisted) clear() }
    window.addEventListener('hashchange', routeChanged)
    window.addEventListener('pageshow', restored)
    return () => {
      window.removeEventListener('hashchange', routeChanged)
      window.removeEventListener('pageshow', restored)
    }
  }, [clear])
  const value = useMemo(() => ({ values, setValues, bindOwner, clear }), [values, bindOwner, clear])
  return <PatientFileState.Provider value={value}>{children}</PatientFileState.Provider>
}
