import { FileText, TestTubes, Users } from 'lucide-react'
// Internal marketing fixtures; never rendered as patient records.
export const marketingFixtures = [
  {
    id: 'samples', icon: TestTubes, columns: ['sampleId', 'testType', 'status'],
    rows: [
      { id: 'EX-S001', label: 'types.cbc', status: 'collected' },
      { id: 'EX-S002', label: 'types.lipid', status: 'analysis' },
      { id: 'EX-S003', label: 'types.thyroid', status: 'review' },
    ],
  },
  {
    id: 'reports', icon: FileText, columns: ['reportId', 'reportType', 'status'],
    rows: [
      { id: 'EX-R001', label: 'types.cbc', status: 'reviewed' },
      { id: 'EX-R002', label: 'types.lipid', status: 'review' },
      { id: 'EX-R003', label: 'types.thyroid', status: 'draft' },
    ],
  },
  {
    id: 'patients', icon: Users, columns: ['patientId', 'recordLabel', 'recordStatus'],
    rows: [
      { id: 'PT-1001', label: 'patients.first', status: 'active' },
      { id: 'PT-1002', label: 'patients.second', status: 'awaitingResults' },
      { id: 'PT-1003', label: 'patients.third', status: 'completed' },
    ],
  },
]

