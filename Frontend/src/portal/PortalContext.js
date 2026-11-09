import { createContext, useContext } from 'react'

export const Portal = createContext(null)
export const usePortal = () => useContext(Portal)
