/** Read-only Google Sheets access for MPS LRFMP Decision Flow workbook.
 *  CRITICAL: never write to or modify the source spreadsheet.
 */

export const LRFMP_SHEET_ID = '1s4CJXNvHBRV6s_IcqGV_P7YjsVJ4aZTl'
export const NEW_LRFMP_SHEET_ID = '1vw8384GiOYj2kvn0TGW-vXdpyVDDBlRmTg5uFDHLoOQ'

export const SHEET_NAMES = {
  decisionFlow: '1.1 Decision Flow',
  buildingComposite: '1.2 Building Composite Score',
  connections: '3.1 Connections',
  schoolInformation: '3.2 School Information',
  schoolEnrollment: '3.3 School Enrollment',
} as const

export const NEW_SHEET_NAMES = {
  siteInfo: 'School and Site Info',
  enrollment: 'Student Enrollment Data',
  enrollmentSums: 'Pivot table - Sum of enrollments',
  program: 'Program Data',
  building: 'Composite Building Score',
  distances: 'SchoolToSchoolDistances',
} as const

export interface GvizCell {
  v?: string | number | boolean | null
  f?: string | null
}

export interface GvizRow {
  c: Array<GvizCell | null>
}

export interface GvizTable {
  cols: Array<{ id?: string; label?: string; type?: string }>
  rows: GvizRow[]
}

declare global {
  interface Window {
    [key: string]: unknown
  }
}

/** Load a sheet tab via Google Visualization JSONP (avoids browser CORS limits). */
export function fetchSheetTable(
  sheetName: string,
  sheetId: string = LRFMP_SHEET_ID,
): Promise<GvizTable> {
  return new Promise((resolve, reject) => {
    const callbackName = `__gviz_cb_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
    const script = document.createElement('script')

    const cleanup = () => {
      delete window[callbackName]
      script.remove()
      window.clearTimeout(timer)
    }

    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out loading sheet “${sheetName}”.`))
    }, sheetName === 'SchoolToSchoolDistances' ? 90000 : 25000)

    window[callbackName] = (response: { table?: GvizTable; status?: string }) => {
      cleanup()
      if (!response?.table) {
        reject(new Error(`Unexpected response for sheet “${sheetName}”.`))
        return
      }
      resolve(response.table)
    }

    const tqx = encodeURIComponent(`out:json;responseHandler:${callbackName}`)
    script.src = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?sheet=${encodeURIComponent(sheetName)}&tqx=${tqx}`
    script.onerror = () => {
      cleanup()
      reject(
        new Error(
          `Failed to load sheet “${sheetName}”. Confirm the workbook is shared for viewing.`,
        ),
      )
    }
    document.head.appendChild(script)
  })
}

export function cellValue(
  row: GvizRow,
  index: number,
): string | number | boolean | null {
  const cell = row.c?.[index]
  if (!cell) return null
  if (cell.v !== undefined && cell.v !== null) return cell.v
  if (cell.f !== undefined && cell.f !== null) return cell.f
  return null
}

export function cellString(row: GvizRow, index: number): string {
  const v = cellValue(row, index)
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

/** Excel-style column letters → 0-based index (A→0, Z→25, AA→26). */
export function colLetterToIndex(letter: string): number {
  const cleaned = letter.replace(/[^A-Za-z]/g, '').toUpperCase()
  if (!cleaned) return -1
  let n = 0
  for (const ch of cleaned) {
    n = n * 26 + (ch.charCodeAt(0) - 64)
  }
  return n - 1
}

export function isBlankOrErrorCell(
  value: string | number | boolean | null | undefined,
): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'boolean') return false
  if (typeof value === 'number') return !Number.isFinite(value)
  const s = String(value).trim()
  if (!s) return true
  return /^#(ref|n\/?a|value|div\/0|name|null|error)!?$/i.test(s)
}
