// Generates sample files for manual testing: samples/leads-example.xlsx and two product PDFs.
// Usage: node scripts/generate-samples.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as XLSX from 'xlsx'

const out = join(import.meta.dirname, '..', 'samples')
mkdirSync(out, { recursive: true })

const headers = [
  'Nume și prenume',
  'E-mail',
  'Telefon',
  'Adresă',
  'Produs de interes',
  'Oraș',
  'Sursa',
  'Observații',
]
const rows = [
  [
    'Andrei Popescu',
    'andrei.popescu@example.com',
    '0722 123 456',
    'Str. Florilor 12',
    'Pompă de căldură',
    'Cluj-Napoca',
    'Facebook',
    'Vrea ofertă până vineri',
  ],
  [
    'Maria Ionescu',
    'maria.ionescu@example.com',
    '0733 222 111',
    'Bd. Unirii 5, bl. A2',
    'panouri solare',
    'București',
    'Site',
    '',
  ],
  [
    'Ioana Dumitrescu',
    'ioana.d@example.ro',
    '0744 555 000',
    'Str. Lalelelor 3',
    'Pompa caldura; Panouri fotovoltaice',
    'Brașov',
    'Târg',
    'Casă nouă, 160 mp',
  ],
  [
    'Mihai Stan',
    'mihai.stan@example.com',
    '0755 010 203',
    'Aleea Teilor 8',
    'Boiler',
    'Iași',
    'Recomandare',
    '',
  ],
  [
    'Elena Georgescu',
    'elena.georgescu@example',
    '0766 999 888',
    'Str. Mare 1',
    'Centrală termică',
    'Timișoara',
    'Facebook',
    'Email greșit — de verificat',
  ],
  [
    'Radu Marin',
    'radu.marin@example.com',
    '0721 000 111',
    'Str. Morii 22',
    'Fotovoltaice / Pompă căldură',
    'Sibiu',
    'Site',
    '',
  ],
  ['', '', '', '', '', '', '', ''],
  [
    'Cristina Pavel',
    'cristina.pavel@example.com',
    '0730 303 303',
    'Str. Viilor 9',
    'Pompă de căldură aer-apă',
    'Oradea',
    'Google',
    'Sună după ora 17',
  ],
  [
    'Andrei Popescu',
    'Andrei.Popescu@example.com',
    '0722 123 456',
    'Str. Florilor 12',
    'Panouri',
    'Cluj-Napoca',
    'Site',
    'Duplicat în fișier',
  ],
  [
    'Vlad Ene',
    'vlad.ene@example.com',
    '',
    'Str. Gării 4',
    'Stație de încărcare',
    'Constanța',
    'Târg',
    'Produs fără PDF momentan',
  ],
  [
    'Ana Ștefănescu',
    'ana.stefanescu@example.com',
    '0745 454 545',
    'Str. Școlii 7',
    'pompa-de-caldura',
    'Craiova',
    'Facebook',
    '',
  ],
  [
    'George Țuțuianu',
    'george.t@example.ro',
    '0799 112 233',
    'Str. Pădurii 15',
    'Panouri fotovoltaice 5kW',
    'Galați',
    'Google',
    '',
  ],
]
const archive = [
  ['Nume', 'Email', 'Produs'],
  ['Dan Olteanu', 'dan.olteanu@example.com', 'Boiler'],
  ['Irina Vasile', 'irina.vasile@example.com', 'Pompă de căldură'],
]

const wb = XLSX.utils.book_new()
const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
sheet['!cols'] = headers.map((h) => ({ wch: Math.max(14, h.length + 4) }))
XLSX.utils.book_append_sheet(wb, sheet, 'Leaduri')
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(archive), 'Arhivă')
writeFileSync(join(out, 'leads-example.xlsx'), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))

/** Builds a small single-page PDF with Helvetica text (WinAnsi, so no Romanian diacritics). */
function makePdf(title, lines) {
  const esc = (s) => s.replace(/[\\()]/g, (c) => '\\' + c)
  const text = [
    'BT /F1 22 Tf 56 770 Td (' + esc(title) + ') Tj ET',
    ...lines.map((l, i) => `BT /F1 12 Tf 56 ${730 - i * 20} Td (${esc(l)}) Tj ET`),
  ].join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return pdf
}

writeFileSync(
  join(out, 'pompa-de-caldura.pdf'),
  makePdf('Pompa de caldura aer-apa 9 kW', [
    'Fisa tehnica - exemplu pentru testare',
    'Putere nominala: 9 kW',
    'COP (A7/W35): 4.9',
    'Agent frigorific: R290',
    'Nivel de zgomot: 38 dB(A) la 5 m',
    'Garantie: 7 ani',
  ]),
)
writeFileSync(
  join(out, 'panouri-fotovoltaice.pdf'),
  makePdf('Sistem fotovoltaic 5 kWp', [
    'Fisa tehnica - exemplu pentru testare',
    'Panouri: 12 x 420 Wp monocristalin',
    'Invertor: hibrid 5 kW',
    'Productie estimata: 6.200 kWh / an',
    'Garantie panouri: 25 ani',
  ]),
)
console.log(`Samples written to ${out}`)
