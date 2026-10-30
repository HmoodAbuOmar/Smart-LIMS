import { dateAtOffset } from '../portal/portalModel.js'

// Imported exclusively by the DEV entry. In-memory fixtures, never a transport or session.
export function createPortalSampleData() {
  if (!import.meta.env.DEV) throw new Error('Development samples are unavailable')
  let visitDate = dateAtOffset(4)
  if (new Date(`${visitDate}T12:00:00`).getDay() === 5) visitDate = dateAtOffset(5)
  const tests = [
    { id: 'cbc', name: ['Complete Blood Count (CBC)', 'تعداد الدم الكامل'], category: 'blood', price: 25, description: ['Measures blood cell counts and related parameters.', 'يقيس أعداد خلايا الدم ومؤشراتها.'], sample: ['Whole blood (EDTA)', 'دم كامل (EDTA)'], prep: ['No special preparation is usually required. Follow your laboratory instructions.', 'لا يلزم عادة تحضير خاص. اتبع تعليمات مختبرك.'], fasting: false, time: ['1 working day', 'يوم عمل واحد'] },
    { id: 'vitamin-d', name: ['Vitamin D (25-Hydroxy)', 'فيتامين د (25-هيدروكسي)'], category: 'vitamins', price: 20, description: ['Measures the concentration of 25-hydroxyvitamin D in blood.', 'يقيس تركيز 25-هيدروكسي فيتامين د في الدم.'], sample: ['Blood (serum)', 'دم (مصل)'], prep: ['Tell the laboratory about supplements you take. Do not stop medication without professional advice.', 'أخبر المختبر بالمكملات التي تتناولها. لا توقف الأدوية دون استشارة مختص.'], fasting: false, time: ['1–2 working days', 'يوم إلى يومي عمل'] },
    { id: 'thyroid', name: ['Thyroid Panel (TSH, FT4)', 'فحوصات الغدة الدرقية (TSH، FT4)'], category: 'thyroid', price: 35, description: ['Measures thyroid-related hormones in blood.', 'يقيس الهرمونات المرتبطة بالغدة الدرقية في الدم.'], sample: ['Blood (serum)', 'دم (مصل)'], prep: ['Ask the laboratory about medicine and supplement timing before your visit.', 'اسأل المختبر عن توقيت الأدوية والمكملات قبل زيارتك.'], fasting: false, time: ['1–2 working days', 'يوم إلى يومي عمل'] },
    { id: 'lipid', name: ['Lipid Profile', 'فحص دهون الدم'], category: 'lipids', price: 30, description: ['Measures cholesterol fractions and triglycerides.', 'يقيس أنواع الكوليسترول والدهون الثلاثية.'], sample: ['Blood (serum)', 'دم (مصل)'], prep: ['Confirm with your laboratory whether a fasting sample is requested for your order.', 'تأكد من المختبر إن كان طلبك يتطلب عينة أثناء الصيام.'], fasting: true, time: ['1 working day', 'يوم عمل واحد'] },
    { id: 'liver', name: ['Liver Function Panel', 'وظائف الكبد'], category: 'liver', price: 28, description: ['Measures selected liver enzymes and proteins.', 'يقيس إنزيمات وبروتينات مختارة مرتبطة بالكبد.'], sample: ['Blood (serum)', 'دم (مصل)'], prep: ['Follow the preparation instructions provided with your order.', 'اتبع تعليمات التحضير المرفقة بطلبك.'], fasting: false, time: ['1 working day', 'يوم عمل واحد'] },
    { id: 'kidney', name: ['Kidney Function Panel', 'وظائف الكلى'], category: 'kidney', price: 24, description: ['Measures creatinine and urea in blood.', 'يقيس الكرياتينين واليوريا في الدم.'], sample: ['Blood (serum)', 'دم (مصل)'], prep: ['Follow your normal routine unless your laboratory advises otherwise.', 'اتبع روتينك المعتاد ما لم يقدم المختبر تعليمات أخرى.'], fasting: false, time: ['1 working day', 'يوم عمل واحد'] },
    { id: 'hba1c', name: ['Glycated Hemoglobin (HbA1c)', 'الهيموغلوبين السكري (HbA1c)'], category: 'diabetes', price: 18, description: ['Measures the proportion of glycated hemoglobin.', 'يقيس نسبة الهيموغلوبين المرتبط بالسكر.'], sample: ['Whole blood (EDTA)', 'دم كامل (EDTA)'], prep: ['No fasting is usually required for this test.', 'لا يتطلب هذا الفحص عادة الصيام.'], fasting: false, time: ['1 working day', 'يوم عمل واحد'] },
  ]
  return {
    profile: { name: 'Sample Patient', nameAr: 'مريض نموذجي', dateOfBirth: '2000-06-19', gender: 'female', phone: '+970599000000', email: 'patient@example.invalid', address: '', fileNumber: 'SAMPLE-P001' }, tests, cart: [],
    orders: [
      { id: 'SAMPLE-0012', date: dateAtOffset(-3), tests: ['cbc', 'vitamin-d', 'thyroid'], total: 80, status: 'completed', stage: 3 },
      { id: 'SAMPLE-0011', date: dateAtOffset(-1), tests: ['lipid', 'kidney'], total: 54, status: 'inProgress', stage: 2 },
      { id: 'SAMPLE-0010', date: dateAtOffset(0), tests: ['liver'], total: 28, status: 'pending', stage: 0 },
      { id: 'SAMPLE-0009', date: dateAtOffset(-20), tests: ['hba1c'], total: 18, status: 'cancelled', stage: 0 },
    ],
    results: [
      { id: 'SAMPLE-R1', orderId: 'SAMPLE-0012', testId: 'cbc', status: 'published', date: dateAtOffset(-2), sampleDate: dateAtOffset(-3), values: [{ name: ['White blood cells (WBC)', 'كريات الدم البيضاء'], value: '6.2', unit: '10³/µL', range: '4.0–10.0', flag: 'normal' }, { name: ['Red blood cells (RBC)', 'كريات الدم الحمراء'], value: '4.8', unit: '10⁶/µL', range: '4.0–5.5', flag: 'normal' }, { name: ['Hemoglobin', 'الهيموغلوبين'], value: '11.0', unit: 'g/dL', range: '12.0–16.0', flag: 'low' }] },
      { id: 'SAMPLE-R2', orderId: 'SAMPLE-0012', testId: 'vitamin-d', status: 'published', date: dateAtOffset(-2), sampleDate: dateAtOffset(-3), values: [{ name: ['25-Hydroxyvitamin D', '25-هيدروكسي فيتامين د'], value: '35', unit: 'ng/mL', range: '30–100', flag: 'normal' }] },
      { id: 'SAMPLE-R3', orderId: 'SAMPLE-0012', testId: 'thyroid', status: 'published', date: dateAtOffset(-2), sampleDate: dateAtOffset(-3), values: [{ name: ['TSH', 'TSH'], value: '4.8', unit: 'mIU/L', range: '0.4–4.0', flag: 'high' }, { name: ['Free T4', 'FT4'], value: '1.1', unit: 'ng/dL', range: '0.8–1.8', flag: 'normal' }] },
      { id: 'SAMPLE-R4', orderId: 'SAMPLE-0011', testId: 'lipid', status: 'pending', date: null, values: [] },
    ],
    appointments: [{ id: 'SAMPLE-A1', date: visitDate, time: '10:00', type: 'collection', orderId: 'SAMPLE-0010', status: 'confirmed' }, { id: 'SAMPLE-A2', date: dateAtOffset(-7), time: '09:30', type: 'consultation', orderId: '', status: 'completed' }],
    notifications: [
      { id: 'N1', category: 'results', key: 'resultNotice', date: new Date().toISOString(), target: 'results/SAMPLE-R1', read: false },
      { id: 'N2', category: 'appointments', key: 'appointmentNotice', date: new Date().toISOString(), target: 'appointments', read: false },
      { id: 'N3', category: 'orders', key: 'orderNotice', date: new Date().toISOString(), target: 'orders/SAMPLE-0011', read: false },
      { id: 'N4', category: 'system', key: 'systemNotice', date: new Date().toISOString(), target: 'dashboard', read: true },
    ],
  }
}
