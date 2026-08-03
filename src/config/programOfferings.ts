/**
 * Specialty / special-ed program columns on the New workbook “Program Data” tab.
 * A school “offers” a program when the cell is Yes/true or a number > 0.
 */

export interface ProgramColumnSpec {
  /** Sheet header label (year tags optional; matched via normalizeSheetHeader). */
  label: string
  /** Display name in Understand / Compare UI. */
  displayName: string
}

/** Non–special-ed specialty pathways / programmatic offerings. */
export const SPECIALTY_PROGRAM_COLUMNS: ProgramColumnSpec[] = [
  { label: 'CTE Pathways', displayName: 'CTE Pathways' },
  { label: 'PLTW', displayName: 'PLTW' },
  { label: 'GT', displayName: 'GT' },
  { label: 'AP', displayName: 'AP' },
  { label: 'IB', displayName: 'IB' },
  { label: 'ESL', displayName: 'ESL' },
  { label: 'Bilingual', displayName: 'Bilingual' },
  { label: 'Language Immersion', displayName: 'Language Immersion' },
  { label: 'QTY (MATC and UWM)', displayName: 'MATC and UWM' },
  { label: 'College Support Programs', displayName: 'College Support Programs' },
  { label: 'Community Schools', displayName: 'Community Schools' },
  { label: 'Montessori', displayName: 'Montessori' },
  { label: 'Arts Focus', displayName: 'Arts Focus' },
]

/**
 * Special education program acronyms → full names (from MPS program key).
 * Columns currently on the sheet are a subset; extras are kept for future headers.
 */
export const SPECIAL_ED_PROGRAM_COLUMNS: ProgramColumnSpec[] = [
  { label: 'AU', displayName: 'Autistic Self-Contained' },
  { label: 'AG', displayName: 'Autistic General' },
  { label: 'EB', displayName: 'Comprehensive Behavior Unit' },
  { label: 'ID', displayName: 'Comprehensive Academic Unit' },
  { label: 'IG', displayName: 'Comprehensive Academic General' },
  { label: 'S0', displayName: 'Speech/Language Pathologist' },
  { label: 'SC', displayName: 'Extended Therapy (Speech)' },
  { label: 'M0', displayName: 'Resource' },
  { label: 'K0', displayName: 'Early Childhood' },
  { label: 'EC', displayName: 'Early Childhood Comprehensive Unit' },
  { label: 'BO', displayName: 'EC Itinerant' },
  { label: 'OI', displayName: 'Orthopedically Impaired' },
  { label: 'VI', displayName: 'Visually Impaired' },
  { label: 'V0', displayName: 'Visually Impaired Itinerant' },
  { label: 'HI', displayName: 'Hearing Impaired' },
  { label: 'H0', displayName: 'Hearing Impaired Itinerant' },
]

export function isProgramOffered(
  value: string | number | boolean | null | undefined,
  formatted?: string | null,
): boolean {
  if (value === true) return true
  if (typeof value === 'number') return Number.isFinite(value) && value > 0
  const raw = String(formatted ?? value ?? '').trim()
  if (!raw || /^n\/?a$/i.test(raw) || /^#(?:ref|n\/?a|value|div\/0)!?$/i.test(raw)) {
    return false
  }
  if (/^(y|yes|true|x)$/i.test(raw)) return true
  if (/^(n|no|false)$/i.test(raw)) return false
  const n = Number(raw.replace(/,/g, ''))
  return Number.isFinite(n) && n > 0
}

export function formatProgramList(names: string[] | undefined): string {
  if (!names || names.length === 0) return '—'
  return names.join(', ')
}
