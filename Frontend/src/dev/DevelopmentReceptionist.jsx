import ReceptionistToday from '../receptionist/today/ReceptionistToday.jsx'

export default function DevelopmentReceptionist() {
  if (!import.meta.env.DEV) return null
  return <ReceptionistToday />
}
