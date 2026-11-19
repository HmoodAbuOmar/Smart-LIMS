import AdminLayout from './components/AdminLayout.jsx'
import './admin.css'

// The established Admin shell hosts the overview and its local records.
export default function AdminDashboard({ initialPage, developmentPreview = false, live = false, profile }) {
  return <AdminLayout initialPage={initialPage} developmentPreview={developmentPreview} live={live} profile={profile} />
}
