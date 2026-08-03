import { NEW_SHEET_NAMES } from '../lib/googleSheets'

/** Logical New-workbook tabs used by the loader. */
export type NewSheetTabKey =
  | 'siteInfo'
  | 'enrollment'
  | 'enrollmentSums'
  | 'program'
  | 'building'

export interface NewSheetFieldSpec {
  /** Stable app / fallback key */
  key: string
  /**
   * Authoritative join key to the live sheet header (year tags optional).
   * Columns are resolved by matching this label — not by Excel letter.
   */
  label: string
  /**
   * Optional aliases for prior header names. Ignored when `pivotPosition` /
   * `pivotRelativeTo` is set.
   */
  aliases?: string[]
  tab: NewSheetTabKey
  /**
   * Optional Excel column letter. Used for reads when
   * `pivotPosition: 'excel-col'`; otherwise documentation only.
   */
  col?: string
  /**
   * Enrollment sums pivot: resolve by fixed Excel column (see `col`).
   */
  pivotPosition?: 'excel-col'
  /**
   * Enrollment sums pivot: resolve as another pivot field’s column + offset
   * (e.g. currentEnrollment + 5 → enrollment 5 years ago).
   */
  pivotRelativeTo?: string
  /** Column offset applied when `pivotRelativeTo` is set (can be negative). */
  pivotOffset?: number
}

/**
 * Authoritative New-sheet field map (replaces the Key tab).
 * Distance-based flags are omitted — they are computed from SchoolToSchoolDistances.
 * **`label` is the join key** to the live sheet header (trailing “24-25” / “SY 23-24”
 * tags are ignored). Optional `col` letters are documentation only.
 */
export const NEW_SHEET_FIELDS: Record<string, NewSheetFieldSpec> = {
  schoolName: {
    key: 'schoolName',
    label: 'Official School Name',
    tab: 'siteInfo',
    col: 'D',
  },
  gradeBand: {
    key: 'gradeBand',
    label: 'Grouped School Levels',
    tab: 'siteInfo',
    col: 'G',
  },
  dpiSchoolCode: {
    key: 'dpiSchoolCode',
    label: 'DPI School Code',
    tab: 'siteInfo',
    col: 'B',
  },
  address: {
    key: 'address',
    label: 'Street Address',
    tab: 'siteInfo',
    col: 'I',
  },
  boardDistrict: {
    key: 'boardDistrict',
    label: 'Board District',
    tab: 'siteInfo',
    col: 'J',
  },
  nonMpsSchoolsWithin1Mile: {
    key: 'nonMpsSchoolsWithin1Mile',
    label: 'There is a non-MPS public school within 1 mile',
    tab: 'siteInfo',
    col: 'L',
  },
  pre1978LeadRisk: {
    key: 'pre1978LeadRisk',
    label: 'Constructed Pre-1978 (Lead Risk)',
    tab: 'siteInfo',
    col: 'K',
  },
  adaAccessible: {
    key: 'adaAccessible',
    label: 'Accessible',
    tab: 'siteInfo',
    col: 'H',
  },
  buildingSquareFootage: {
    key: 'buildingSquareFootage',
    label: 'Building Square Footage',
    tab: 'siteInfo',
    col: 'M',
  },
  /** Gate: only Y rows are loaded (replaces Old sheet Evaluate = Yes). */
  includeInEvaluation: {
    key: 'includeInEvaluation',
    label: 'Include in Evaluation',
    tab: 'siteInfo',
    col: 'F',
  },
  utilizationRate: {
    key: 'utilizationRate',
    label: 'Utilization Rate',
    tab: 'enrollment',
    col: 'R',
  },
  projectedUtilization10yr: {
    key: 'projectedUtilization10yr',
    label: 'Expected Utilization in 10 yrs',
    tab: 'enrollment',
    col: 'S',
  },
  /**
   * Source for computing enrollmentGrowth5yrPct (not stored as its own school
   * property). Average yearly % change =
   * ((current − 5yrAgo) / 5yrAgo / 5) × 100 from the enrollment sums pivot.
   * Column = five to the right of current enrollment (pivot col C → H).
   */
  enrollmentFiveYearsAgo: {
    key: 'enrollmentFiveYearsAgo',
    label: 'Enrollment 5 Years Ago (pivot C+5)',
    tab: 'enrollmentSums',
    pivotRelativeTo: 'currentEnrollment',
    pivotOffset: 5,
  },
  siteExpansionCapacity: {
    key: 'siteExpansionCapacity',
    label: 'Growth Capacity',
    tab: 'enrollment',
    col: 'Q',
  },
  /**
   * Current enrollment from enrollment sums pivot — fixed at column C.
   */
  currentEnrollment: {
    key: 'currentEnrollment',
    label: 'Current Enrollment (pivot col C)',
    tab: 'enrollmentSums',
    col: 'C',
    pivotPosition: 'excel-col',
  },
  buildingCapacity: {
    key: 'buildingCapacity',
    label: 'Capacity',
    tab: 'enrollment',
    col: 'T',
  },
  studentsInAttendanceArea: {
    key: 'studentsInAttendanceArea',
    label: 'Percent Students Attending from attendance Area',
    tab: 'enrollment',
    col: 'AL',
  },
  economicDisadvantageRate: {
    key: 'economicDisadvantageRate',
    label: 'Percent Economically Disadvantaged Students',
    tab: 'enrollment',
    col: 'AM',
  },
  economicallyDisadvantagedCount: {
    key: 'economicallyDisadvantagedCount',
    label: 'Economically Disadvantaged Students (Count)',
    tab: 'enrollment',
    col: 'G',
  },
  ellStudentCount: {
    key: 'ellStudentCount',
    label: 'ELL Students (Count)',
    tab: 'enrollment',
    col: 'H',
  },
  academicPerformance: {
    key: 'academicPerformance',
    label: 'Report Card Score',
    tab: 'program',
    col: 'F',
  },
  programmaticOfferings: {
    key: 'programmaticOfferings',
    label: 'Programmatic Offerings No.',
    tab: 'program',
    col: 'AD',
  },
  specialEdProgramCount: {
    key: 'specialEdProgramCount',
    label: 'Special Education',
    tab: 'program',
    col: 'AE',
  },
  fci: {
    key: 'fci',
    label: 'FCI',
    tab: 'building',
    col: 'L',
  },
  energyUseIntensity: {
    key: 'energyUseIntensity',
    label: 'Energy Use Intensity',
    tab: 'building',
    col: 'N',
  },
  acCoverage: {
    key: 'acCoverage',
    label: 'Classroom with AC',
    tab: 'building',
    col: 'P',
  },
  /** Composite “Building Score” column (Excel S), not Interim Helper (R). */
  buildingScore: {
    key: 'buildingScore',
    label: 'Building Score',
    tab: 'building',
    col: 'S',
  },
}

export const NEW_SHEET_RACE_FIELDS: NewSheetFieldSpec[] = [
  {
    key: 'raceEthnicityCounts[White]',
    label: 'White Students (Count)',
    tab: 'enrollment',
    col: 'I',
  },
  {
    key: 'raceEthnicityCounts[African-American]',
    label: 'African-American Students (Count)',
    tab: 'enrollment',
    col: 'J',
  },
  {
    key: 'raceEthnicityCounts[Hispanic]',
    label: 'Hispanic Students (Count)',
    tab: 'enrollment',
    col: 'K',
  },
  {
    key: 'raceEthnicityCounts[Asian]',
    label: 'Asian Students (Count)',
    tab: 'enrollment',
    col: 'L',
  },
  {
    key: 'raceEthnicityCounts[Native American]',
    label: 'Native American Students (Count)',
    tab: 'enrollment',
    col: 'M',
  },
  {
    key: 'raceEthnicityCounts[Hawaiian or Pacific Isl.]',
    label: 'HI/PI Students (Count)',
    tab: 'enrollment',
    col: 'N',
  },
  {
    key: 'raceEthnicityCounts[Multi-Racial]',
    label: 'Multiracial Students (Count)',
    tab: 'enrollment',
    col: 'O',
  },
]

export function allNewSheetFields(): NewSheetFieldSpec[] {
  return [...Object.values(NEW_SHEET_FIELDS), ...NEW_SHEET_RACE_FIELDS]
}

export function newSheetTabName(tab: NewSheetTabKey): string {
  return NEW_SHEET_NAMES[tab]
}

/**
 * Normalize a sheet header for comparison: lowercase, strip trailing year tags
 * (`24-25`, `SY 23-24`), collapse punctuation/whitespace. Keeps embedded years
 * like `Enrollment 2024-2025` so adjacent year columns do not false-match.
 */
export function normalizeSheetHeader(raw: string): string {
  return String(raw)
    .toLowerCase()
    .replace(/\s+sy\s+\d{2}\s*[-/]\s*\d{2}\s*$/i, '')
    .replace(/\s+\d{2}\s*[-/]\s*\d{2}\s*$/i, '')
    // Full year ranges kept in the middle of labels, but strip trailing ones
    // (e.g. "Current Enrollment 2024-2025" → "current enrollment").
    .replace(/\s+\d{4}\s*[-/]\s*\d{2,4}\s*$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** True when expected header matches a live sheet header (name-based mapping). */
export function headersRoughlyMatch(expected: string, actual: string): boolean {
  const e = normalizeSheetHeader(expected)
  const a = normalizeSheetHeader(actual)
  if (!e || !a) return false
  if (e === a) return true

  // Ordered token containment (handles “There is a …” prefixes).
  const eTok = e.split(' ').filter(Boolean)
  const aTok = a.split(' ').filter(Boolean)
  if (eTok.length === 0) return false
  let i = 0
  for (const t of aTok) {
    if (t === eTok[i]) i += 1
    if (i === eTok.length) return true
  }
  // Also allow expected to be a longer form of actual (rare).
  i = 0
  for (const t of eTok) {
    if (t === aTok[i]) i += 1
    if (i === aTok.length && aTok.length >= 2) return true
  }
  return false
}
