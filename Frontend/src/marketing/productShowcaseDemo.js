// Public showcase records. Never import into patient state or API payloads.
export const productShowcaseDemo = {
  samples: [
    { id: 'DEMO-S001', label: 'types.cbc', collectedOn: '2026-10-28', status: 'completed' },
    { id: 'DEMO-S002', label: 'types.lipid', collectedOn: '2026-10-29', status: 'processing' },
    { id: 'DEMO-S003', label: 'types.thyroid', collectedOn: '2026-10-29', status: 'collected' },
    { id: 'DEMO-S004', label: 'types.glucose', collectedOn: '2026-10-28', status: 'completed' },
    { id: 'DEMO-S005', label: 'types.liver', collectedOn: '2026-10-29', status: 'processing' },
    { id: 'DEMO-S006', label: 'types.renal', collectedOn: '2026-10-28', status: 'rejected' },
  ],
  reports: [
    { id: 'DEMO-R001', label: 'types.cbc', status: 'ready' },
    { id: 'DEMO-R002', label: 'types.lipid', status: 'pending' },
    { id: 'DEMO-R003', label: 'types.thyroid', status: 'underReview' },
    { id: 'DEMO-R004', label: 'types.glucose', status: 'ready' },
    { id: 'DEMO-R005', label: 'types.liver', status: 'underReview' },
    { id: 'DEMO-R006', label: 'types.renal', status: 'pending' },
  ],
  patients: [
    { id: 'DEMO-P001', name: { en: 'Omar Nasser', ar: 'عمر ناصر' }, status: 'active' },
    { id: 'DEMO-P002', name: { en: 'Lina Haddad', ar: 'لينا حداد' }, status: 'awaitingResults' },
    { id: 'DEMO-P003', name: { en: 'Yousef Mansour', ar: 'يوسف منصور' }, status: 'completed' },
    { id: 'DEMO-P004', name: { en: 'Mariam Saleh', ar: 'مريم صالح' }, status: 'active' },
    { id: 'DEMO-P005', name: { en: 'Khaled Darwish', ar: 'خالد درويش' }, status: 'awaitingResults' },
    { id: 'DEMO-P006', name: { en: 'Noor Hamdan', ar: 'نور حمدان' }, status: 'completed' },
  ],
}
