/*
  A real Excel file (.xlsx), with no library.

  An .xlsx is a zip of a few XML files. This writes them and zips them
  "stored" (not compressed), which every version of Excel, Google Sheets
  and LibreOffice opens. Numbers go in as numbers and dates as dates, so
  a column can be summed and sorted the moment the file opens — the
  thing a CSV could never promise, because Excel guesses at a CSV and
  guesses Indian dates wrong.

  Kept dependency-free on purpose: one file, nothing to install, nothing
  to keep up to date.
*/

export type XlsxKind = 'text' | 'number' | 'money' | 'date' | 'percent'

export type XlsxColumn = {
  header: string
  kind?: XlsxKind        // default 'text'
  width?: number         // in characters
}

export type XlsxSheet = {
  name: string
  columns: XlsxColumn[]
  rows: (string | number | null | undefined)[][]
  // A bold line under the rows, e.g. totals. Same shape as a row.
  total?: (string | number | null | undefined)[]
}

// ---------------------------------------------------------------- zip

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const f of files) {
    const name = enc.encode(f.name)
    const crc = crc32(f.data)
    const size = f.data.length

    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)          // version needed
    lv.setUint16(6, 0x0800, true)      // utf-8 names
    lv.setUint16(8, 0, true)           // stored
    lv.setUint16(10, 0, true)          // time
    lv.setUint16(12, 0x21, true)       // date: 1980-01-01
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true)
    lv.setUint32(22, size, true)
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, 0, true)
    local.set(name, 30)
    parts.push(local, f.data)

    const cen = new Uint8Array(46 + name.length)
    const cv = new DataView(cen.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, 0, true)
    cv.setUint16(14, 0x21, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    cen.set(name, 46)
    central.push(cen)

    offset += local.length + size
  }

  const cenSize = central.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, cenSize, true)
  ev.setUint32(16, offset, true)

  const all = [...parts, ...central, end]
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of all) { out.set(p, at); at += p.length }
  return out
}

// ---------------------------------------------------------------- sheet xml

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;')
   // Characters XML 1.0 does not allow at all. A stray one from a pasted
   // Facebook form would otherwise make Excel call the whole file broken.
   // eslint-disable-next-line no-control-regex
   .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

function colName(i: number) {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

// Days since 1899-12-30, which is how Excel counts. Taken from the
// YYYY-MM-DD text itself, not from a Date in the browser's zone, so a
// date never slips a day for someone whose clock is set elsewhere.
function excelDate(v: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  if (!m) return null
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000)
}

// Style ids in styles.xml below
const S = { text: 0, head: 1, number: 2, money: 3, date: 4, percent: 5, totText: 6, totMoney: 7, totNumber: 8 }

function cell(ref: string, v: string | number | null | undefined, kind: XlsxKind, total = false): string {
  if (v === null || v === undefined || v === '') return ''
  if (kind === 'date' && typeof v === 'string') {
    const d = excelDate(v)
    if (d !== null) return `<c r="${ref}" s="${S.date}"><v>${d}</v></c>`
  }
  if ((kind === 'number' || kind === 'money' || kind === 'percent') && v !== '' && !Number.isNaN(Number(v))) {
    const s = kind === 'money' ? (total ? S.totMoney : S.money)
            : kind === 'percent' ? S.percent
            : (total ? S.totNumber : S.number)
    return `<c r="${ref}" s="${s}"><v>${Number(v)}</v></c>`
  }
  return `<c r="${ref}" t="inlineStr" s="${total ? S.totText : S.text}"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`
}

function sheetXml(sh: XlsxSheet): string {
  const kinds = sh.columns.map((c) => c.kind ?? 'text')
  const cols = sh.columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? Math.max(10, Math.min(40, c.header.length + 4))}" customWidth="1"/>`)
    .join('')

  const head = `<row r="1">${sh.columns
    .map((c, i) => `<c r="${colName(i)}1" t="inlineStr" s="${S.head}"><is><t>${esc(c.header)}</t></is></c>`)
    .join('')}</row>`

  const body = sh.rows
    .map((r, ri) => `<row r="${ri + 2}">${r.map((v, ci) => cell(`${colName(ci)}${ri + 2}`, v, kinds[ci] ?? 'text')).join('')}</row>`)
    .join('')

  const totRow = sh.total
    ? `<row r="${sh.rows.length + 2}">${sh.total
        .map((v, ci) => cell(`${colName(ci)}${sh.rows.length + 2}`, v, kinds[ci] ?? 'text', true))
        .join('')}</row>`
    : ''

  const last = `${colName(Math.max(sh.columns.length - 1, 0))}${sh.rows.length + 1}`

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols>
<sheetData>${head}${body}${totRow}</sheetData>
${sh.rows.length > 0 ? `<autoFilter ref="A1:${last}"/>` : ''}
</worksheet>`
}

// Excel refuses some characters in a sheet name and anything over 31.
const safeName = (n: string, used: Set<string>) => {
  let base = n.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet'
  let name = base
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 28)} ${i}`
  used.add(name.toLowerCase())
  return name
}

// ---------------------------------------------------------------- workbook

export function buildXlsx(sheets: XlsxSheet[]): Uint8Array {
  const enc = new TextEncoder()
  const used = new Set<string>()
  const names = sheets.map((s) => safeName(s.name, used))

  const files: { name: string; data: string }[] = [
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`,
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
${sheets.some((s) => s.rows.length > 0) ? `<definedNames>${sheets
  .map((s, i) => s.rows.length > 0
    ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(names[i]).replace(/'/g, "''")}'!$A$1:$${colName(Math.max(s.columns.length - 1, 0))}$${s.rows.length + 1}</definedName>`
    : '')
  .join('')}</definedNames>` : ''}
</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    {
      // 0 text · 1 header · 2 number · 3 money · 4 date · 5 percent
      // 6 total text · 7 total money · 8 total number
      name: 'xl/styles.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3">
<numFmt numFmtId="164" formatCode="#,##0.00"/>
<numFmt numFmtId="165" formatCode="dd-mmm-yyyy"/>
<numFmt numFmtId="166" formatCode="0.##&quot;%&quot;"/>
</numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFDE7D6"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top style="thin"><color auto="1"/></top><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`,
    },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
  ]

  return zip(files.map((f) => ({ name: f.name, data: enc.encode(f.data) })))
}

export function downloadXlsx(fileName: string, sheets: XlsxSheet[]) {
  const bytes = buildXlsx(sheets)
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
