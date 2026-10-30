import { createContext } from 'react'

export const emptyPatientFile = { name: '', dateOfBirth: '', gender: '', phone: '' }
export const PatientFileState = createContext(null)
