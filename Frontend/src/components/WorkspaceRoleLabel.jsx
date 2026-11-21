import './WorkspaceRoleLabel.css'

const labels = {
  patient: { en: 'Patient', ar: 'المريض' },
  admin: { en: 'Admin', ar: 'المسؤول' },
  receptionist: { en: 'Receptionist', ar: 'موظف الاستقبال' },
  lab_technician: { en: 'Lab Technician', ar: 'فني المختبر' },
}

export default function WorkspaceRoleLabel({ role, language }) {
  return <span className="workspace-role-label">{labels[role][language]}</span>
}
