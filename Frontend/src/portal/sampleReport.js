// Development fixture export only. Never used to manufacture a clinical report.
import { patientDisplayName } from '../utils/patientDisplayName.js'
export async function downloadSampleReport({ profile, result, test, t, local, date }) {
  if (!import.meta.env.DEV || !result.id.startsWith('SAMPLE-') || result.status !== 'published') throw new Error('Sample report only')
  await document.fonts.ready
  const canvas = document.createElement('canvas')
  canvas.width = 1240; canvas.height = 1754
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Report export unavailable')
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, 1240, 1754)
  ctx.fillStyle = '#083F3D'
  const rtl = document.documentElement.dir === 'rtl'
  ctx.direction = rtl ? 'rtl' : 'ltr'; ctx.textAlign = rtl ? 'right' : 'left'
  const x = rtl ? 1160 : 80
  const logo = new Image(); logo.src = '/images/smart-lims-logo.png'; await logo.decode()
  ctx.fillStyle = '#083F3D'; ctx.fillRect(0, 0, 1240, 130)
  ctx.save(); ctx.filter = 'brightness(0) invert(1)'; ctx.drawImage(logo, rtl ? 1000 : 80, 20, 160, 80); ctx.restore()
  ctx.font = 'bold 23px sans-serif'; ctx.fillText('INTERNAL TEST REPORT - NOT FOR CLINICAL USE', x, 150)
  ctx.font = '24px sans-serif'; ctx.fillText(t('resultReport'), x, 205)
  const lines = [
    `${t('name')}: ${patientDisplayName(profile.name, t('samplePatient'))}`, `${t('dob')}: ${date(profile.dateOfBirth)}`,
    `${t('fileNumber')}: ${profile.fileNumber}`, `${t('orderNumber')}: ${result.orderId}`,
    `${t('sampleDate')}: ${date(result.sampleDate)}`, `${t('resultDate')}: ${date(result.date)}`,
    '', local(test.name), '',
    ...result.values.flatMap(row => [local(row.name), `${t('result')}: ${row.value} ${row.unit}     ${t('range')}: ${row.range}     ${t(row.flag)}`, '']),
    '', t('reportHint'),
  ]
  let y = 270
  ctx.font = '22px sans-serif'
  for (const line of lines) {
    // Wrap at word boundaries so translated text stays within the report.
    let current = ''
    for (const word of line.split(' ')) {
      const next = current ? `${current} ${word}` : word
      if (ctx.measureText(next).width > 1060 && current) { ctx.fillText(current, x, y); y += 35; current = word } else current = next
    }
    ctx.fillText(current, x, y); y += 38
  }
  // Embed a rasterized Unicode report in a minimal valid single-page PDF.
  const binary = atob(canvas.toDataURL('image/jpeg', .94).split(',')[1])
  const jpeg = Uint8Array.from(binary, char => char.charCodeAt(0))
  const encoder = new TextEncoder(), chunks = [], offsets = [0]
  let length = 0
  const append = data => { const bytes = typeof data === 'string' ? encoder.encode(data) : data; chunks.push(bytes); length += bytes.length }
  const object = (number, content) => { offsets[number] = length; append(`${number} 0 obj\n${content}\nendobj\n`) }
  append('%PDF-1.4\n')
  object(1, '<< /Type /Catalog /Pages 2 0 R >>')
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  object(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>')
  offsets[4] = length; append(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width 1240 /Height 1754 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`); append(jpeg); append('\nendstream\nendobj\n')
  const drawing = 'q\n595 0 0 842 0 0 cm\n/Im0 Do\nQ\n'
  object(5, `<< /Length ${encoder.encode(drawing).length} >>\nstream\n${drawing}endstream`)
  const xref = length
  append('xref\n0 6\n0000000000 65535 f \n')
  for (let n = 1; n <= 5; n++) append(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`)
  append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`)
  const url = URL.createObjectURL(new Blob(chunks, { type: 'application/pdf' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${result.id}-SAMPLE.pdf`; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
