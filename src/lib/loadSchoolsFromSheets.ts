import type { SchoolCollection, SchoolFeature, SchoolProperties } from '../types/school'
import {
  SHEET_NAMES,
  cellString,
  cellValue,
  fetchSheetTable,
  type GvizRow,
  type GvizTable,
} from './googleSheets'
import { formatGradeBand, roundBuildingScore } from './formatters'

/** Column indices for 1.1 Decision Flow (0-based; headers in sheet row 3 / gviz offset handled below). */
const D = {
  site: 0,
  uniqueId: 1,
  schoolName: 2,
  grouped: 4,
  evaluate: 5,
  utilization: 6,
  enrollmentTrend: 9,
  projectedUtilization: 11,
  underutilizedDistance: 13,
  schoolCapacityStudents: 15,
  complimentaryGrades: 17,
  sameGrades: 19,
  buildingScore: 21,
  programmaticOfferings: 23,
  growthCapacity: 26,
} as const

/** Column indices for 1.2 Building Composite Score (FCI / EUI / AC block). */
const B = {
  site: 0,
  uniqueId: 1,
  fci: 9,
  eui: 11,
  acPercent: 13,
  compositeScore: 15,
} as const

export function parsePercent(value: string | number | boolean | null, formatted?: string | null): number {
  const label = formatted ?? (typeof value === 'string' ? value : '')
  if (label.includes('%')) {
    const n = Number(String(label).replace(/,/g, '').replace(/%/g, '').trim())
    return Number.isFinite(n) ? n : 0
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Sheets serializes many % cells as fractions (0.9966 → 99.66%)
    if (Math.abs(value) <= 2) return value * 100
    return value
  }
  const s = String(value ?? '')
    .replace(/,/g, '')
    .replace(/%/g, '')
    .trim()
  if (!s) return 0
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

function cellPair(
  row: GvizRow,
  index: number,
): { v: string | number | boolean | null; f: string | null } {
  const cell = row.c?.[index]
  return {
    v: cell?.v ?? null,
    f: cell?.f ?? null,
  }
}

export function parseNumber(value: string | number | boolean | null): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const s = String(value ?? '')
    .replace(/,/g, '')
    .replace(/%/g, '')
    .trim()
  if (!s) return 0
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

export function parseYes(value: string | number | boolean | null): boolean {
  if (typeof value === 'boolean') return value
  const s = String(value ?? '')
    .trim()
    .toLowerCase()
  return s === 'yes' || s === 'y' || s === 'true'
}

/** Growth Capacity: Yes = true; N / No / N/A = false */
export function parseGrowthCapacity(value: string | number | boolean | null): boolean {
  const s = String(value ?? '')
    .trim()
    .toLowerCase()
  return s === 'yes' || s === 'y'
}

export function formatSchoolId(site: string | number | boolean | null): string {
  const raw = String(site ?? '').trim()
  const n = Number(raw)
  if (Number.isFinite(n) && raw !== '') {
    return `MPS-${String(Math.trunc(n)).padStart(3, '0')}`
  }
  return raw ? `MPS-${raw}` : ''
}

/** gviz returns all rows including header/meta — skip until we see numeric Site + school name. */
function isDataRow(row: GvizRow): boolean {
  const site = cellString(row, D.site)
  const name = cellString(row, D.schoolName)
  if (!site || !name) return false
  if (/uniqueid|school name|site/i.test(name)) return false
  return true
}

/** Fallback / preferred chart order for race categories. */
export const DEFAULT_RACE_ETHNICITY_LABELS = [
  'White',
  'African-American',
  'Hispanic',
  'Asian',
  'Native American',
  'Hawaiian or Pacific Isl.',
  'Multi-Racial',
  'Other',
] as const

/**
 * Clean sheet race headers for charts.
 * "Race Ethnicity White" / "Ethnicity White" → "White"; "HI/PI" → Hawaiian…; Unknown dropped.
 */
export function normalizeRaceEthnicityLabel(
  raw: string | null | undefined,
): string | null {
  let s = String(raw ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) return null

  // Strip leading race/ethnicity boilerplate (incl. sheet typo "Ethinicity")
  s = s
    .replace(
      /^(?:race\s*(?:\/|\-|–|,)?\s*)?eth+ni+city\s*(?:\/|\-|–|:)?\s*/i,
      '',
    )
    .replace(/^race\s+and\s+eth+ni+city\s*(?:\/|\-|–|:)?\s*/i, '')
    .replace(/^race\s*(?:\/|\-|–|:)?\s*/i, '')
    .trim()

  // Glued headers: RaceEthnicityWhite / EthnicityWhite / RaceEthinicityWhite
  s = s.replace(/^(?:race)?eth+ni+city/i, '').trim()

  if (!s) return null
  if (/^unknown$/i.test(s) || /^unk\.?$/i.test(s)) return null

  const lower = s.toLowerCase().replace(/\./g, '')

  if (
    lower === 'white' ||
    lower === 'caucasian' ||
    /^(eth+ni+city\s+)?white$/i.test(s) ||
    (/white/i.test(s) && /eth+ni+city|race/i.test(String(raw ?? '')))
  ) {
    return 'White'
  }
  if (
    lower === 'black' ||
    /african[-\s]?american/i.test(s) ||
    lower === 'black or african american'
  ) {
    return 'African-American'
  }
  if (/hispanic|latino|latina|latinx/i.test(s)) return 'Hispanic'
  if (/^asian$/i.test(s)) return 'Asian'
  if (/native\s*american|american\s*indian|alaska\s*native/i.test(s)) {
    return 'Native American'
  }
  if (
    /pacific|hawaiian|hawaii/i.test(s) ||
    /^hi\s*\/?\s*pi$/i.test(s) ||
    /^nhpi$/i.test(lower) ||
    /^hpi$/i.test(lower)
  ) {
    return 'Hawaiian or Pacific Isl.'
  }
  if (
    /multi[-\s]?racial|two\s+or\s+more|2\s+or\s+more|^multiple$/i.test(s)
  ) {
    return 'Multi-Racial'
  }
  if (/^other$/i.test(s)) return 'Other'

  return s
}

/** Two-line axis splits for long race labels (rotated under bars). */
export function raceEthnicityAxisLines(label: string): string[] {
  const normalized = normalizeRaceEthnicityLabel(label) ?? label
  switch (normalized) {
    case 'Native American':
      return ['Native', 'American']
    case 'African-American':
      return ['African-', 'American']
    case 'Hawaiian or Pacific Isl.':
      return ['Hawaiian or', 'Pacific Isl.']
    default:
      return [normalized]
  }
}

/** Normalize board district to plain text like "District 1". */
export function formatBoardDistrict(
  value: string | number | boolean | null | undefined,
): string {
  if (value === null || value === undefined || value === '') return ''
  const s = String(value).trim()
  if (!s || /^n\/?a$/i.test(s)) return ''
  const asNum = Number(s)
  if (Number.isFinite(asNum) && /^\d+(\.0+)?$/.test(s)) {
    return `District ${Math.trunc(asNum)}`
  }
  const m = s.match(/^district\s*(\d+)/i)
  if (m) return `District ${m[1]}`
  return s
}

function emptyPrioritizationDefaults(): Pick<
  SchoolProperties,
  | 'studentsInAttendanceArea'
  | 'economicDisadvantageRate'
  | 'currentEnrollment'
  | 'economicallyDisadvantagedCount'
  | 'ellStudentCount'
  | 'raceEthnicityCounts'
  | 'boardDistrict'
  | 'academicPerformance'
  | 'pre1978LeadRisk'
  | 'adaAccessible'
  | 'belowRegionalSpecialtyMedian'
  | 'nonMpsSchoolsWithin1Mile'
  | 'specialEdProgramCount'
  | 'overutilizedMpsWithin1Mile'
  | 'receivesDisplacedStudents'
> {
  return {
    studentsInAttendanceArea: 0,
    economicDisadvantageRate: 0,
    currentEnrollment: 0,
    economicallyDisadvantagedCount: 0,
    ellStudentCount: 0,
    raceEthnicityCounts: {},
    boardDistrict: '',
    academicPerformance: 0,
    pre1978LeadRisk: false,
    adaAccessible: false,
    belowRegionalSpecialtyMedian: false,
    nonMpsSchoolsWithin1Mile: false,
    specialEdProgramCount: 0,
    overutilizedMpsWithin1Mile: false,
    receivesDisplacedStudents: false,
  }
}

function mapDecisionRow(row: GvizRow): SchoolProperties | null {
  if (!isDataRow(row)) return null
  if (!parseYes(cellValue(row, D.evaluate))) return null

  const schoolId = formatSchoolId(cellValue(row, D.site))
  if (!schoolId) return null

  const underutilizedCount = parseNumber(cellValue(row, D.underutilizedDistance))
  const complimentary = parseYes(cellValue(row, D.complimentaryGrades))
  const sameGrades = parseYes(cellValue(row, D.sameGrades))
  const enrollmentCell = cellPair(row, D.enrollmentTrend)
  const enrollmentTrend = parsePercent(enrollmentCell.v, enrollmentCell.f)
  const programmatic = parseNumber(cellValue(row, D.programmaticOfferings))
  const utilCell = cellPair(row, D.utilization)
  const projCell = cellPair(row, D.projectedUtilization)

  return {
    schoolId,
    schoolName: cellString(row, D.schoolName),
    gradeBand: formatGradeBand(cellString(row, D.grouped)) || undefined,
    utilizationRate: parsePercent(utilCell.v, utilCell.f),
    projectedUtilization10yr: parsePercent(projCell.v, projCell.f),
    enrollmentGrowth5yr: enrollmentTrend >= 0,
    enrollmentGrowth5yrPct: enrollmentTrend,
    buildingScore: roundBuildingScore(parseNumber(cellValue(row, D.buildingScore))),
    programmaticOfferings: programmatic,
    specialtyProgramCount: programmatic,
    nearbyCapacityAvailable: parseYes(cellValue(row, D.schoolCapacityStudents)),
    siteExpansionCapacity: parseGrowthCapacity(cellValue(row, D.growthCapacity)),
    nearUnderutilizedSchool:
      underutilizedCount > 0 || complimentary || sameGrades,
    acCoverage: 0,
    fci: undefined,
    energyUseIntensity: undefined,
    ...emptyPrioritizationDefaults(),
  }
}

function mapBuildingExtras(row: GvizRow): {
  siteKey: string
  fci: number
  energyUseIntensity: number
  acCoverage: number
  compositeScore: number
} | null {
  const siteKey = String(cellValue(row, B.site) ?? '').trim()
  const name = cellString(row, 2)
  if (!siteKey || !name || /school name/i.test(name)) return null

  return {
    siteKey,
    fci: parseNumber(cellValue(row, B.fci)),
    energyUseIntensity: parseNumber(cellValue(row, B.eui)),
    acCoverage: parsePercent(
      cellPair(row, B.acPercent).v,
      cellPair(row, B.acPercent).f,
    ),
    compositeScore: parseNumber(cellValue(row, B.compositeScore)),
  }
}

function toFeature(props: SchoolProperties): SchoolFeature {
  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      // Placeholder until a GeoJSON upload supplies real coordinates
      coordinates: [0, 0],
    },
    properties: props,
  }
}

export function siteKeyFromSchoolId(schoolId: string): string {
  const m = /^MPS-0*(\d+)$/i.exec(schoolId)
  return m ? String(Number(m[1])) : schoolId.replace(/^MPS-/i, '')
}

/** Normalize DPI / SCHOOL_ID values (strip leading zeros). */
export function normalizeDpiCode(
  value: string | number | boolean | null | undefined,
): number | null {
  if (value === undefined || value === null || value === '') return null
  const s = String(value).trim()
  if (!s || /^n\/?a$/i.test(s)) return null
  const n = Number(s.replace(/^0+/, '') || '0')
  return Number.isFinite(n) ? n : null
}

/**
 * Lower campuses that share the upper campus DPI / GeoJSON SCHOOL_ID.
 * Disambiguate with SCHOOL_NAM (and matching UPPER sites for the same ID).
 */
const LOWER_DPI_INHERIT_FROM: Record<string, string> = {
  // Bay View Montessori Lower ← Upper
  '362': '131',
  // Golda Meir Lower ← Upper
  '176': '67',
  // Milw Spanish Immersion Lower ← Upper
  '140': '167',
}

const CAMPUS_GEO_NAME_MATCH: Record<string, (schoolNam: string) => boolean> = {
  // Bay View Montessori
  '131': (n) => /upper/i.test(n),
  '362': (n) => /lower/i.test(n),
  // Golda Meir — GeoJSON: "Golda Meir HS" (upper) vs "Golda Meir" (lower)
  '67': (n) => /HS/i.test(n) || /upper/i.test(n),
  '176': (n) => /golda\s*meir/i.test(n) && !/HS/i.test(n),
  // Spanish Immersion
  '167': (n) => /upper/i.test(n),
  '140': (n) => /lower/i.test(n),
}

/** Column indices for 3.1 Connections (0-based). */
const C = {
  site: 0,
  dpiSchoolCode: 11,
} as const

/** Column indices for 3.2 School Information (0-based). */
const I = {
  site: 0,
  streetAddress: 4,
  boardDistrict: 10, // K
  distanceOverutilized: 25, // Z
  nonMpsWithin1Mile: 29, // AD
  pre1978: 35, // AJ
  accessible: 55, // BD
  reportCardScore: 56, // BE
  specialEdCount: 87, // CJ
} as const

/** Column indices for 3.3 School Enrollment (0-based). */
const E = {
  site: 0,
  currentEnrollment: 18, // S
  attendanceAreaPct: 36, // AK
  economicallyDisadvantagedPct: 37, // AL
  economicallyDisadvantagedCount: 38, // AM
  ellStudentCount: 40, // AO
  raceStart: 43, // AR
  raceEnd: 50, // AY inclusive
} as const

type SiteInfoExtras = {
  address?: string
  boardDistrict?: string
  pre1978LeadRisk?: boolean
  adaAccessible?: boolean
  specialEdProgramCount?: number
  overutilizedMpsWithin1Mile?: boolean
  nonMpsSchoolsWithin1Mile?: boolean
  academicPerformance?: number
}

type SiteEnrollmentExtras = {
  studentsInAttendanceArea?: number
  economicDisadvantageRate?: number
  currentEnrollment?: number
  economicallyDisadvantagedCount?: number
  ellStudentCount?: number
  raceEthnicityCounts?: Record<string, number>
}

/** Distance-to-overutilized: Yes only when the numeric distance is exactly 0. */
function parseOverutilizedAtDistanceZero(
  value: string | number | boolean | null,
): boolean {
  if (value === null || value === undefined || value === '') return false
  if (typeof value === 'boolean') return false
  if (typeof value === 'number') return value === 0
  const s = String(value).trim().replace(/,/g, '')
  if (!s || /^n\/?a$/i.test(s)) return false
  const n = Number(s)
  return Number.isFinite(n) && n === 0
}

function buildDpiBySite(connectionsTable: {
  rows: GvizRow[]
}): Map<string, number> {
  const dpiBySite = new Map<string, number>()
  for (const row of connectionsTable.rows) {
    const siteRaw = cellValue(row, C.site)
    if (siteRaw === null || siteRaw === '') continue
    const site = String(Number(String(siteRaw).trim()))
    if (!site || site === 'NaN') continue
    // Skip header-ish rows
    if (/^site$/i.test(String(siteRaw))) continue
    const dpi = normalizeDpiCode(cellValue(row, C.dpiSchoolCode))
    if (dpi === null) continue
    dpiBySite.set(site, dpi)
  }

  // Inherit upper-campus DPI for the three lower campuses with blank DPI cells
  for (const [lowerSite, upperSite] of Object.entries(LOWER_DPI_INHERIT_FROM)) {
    if (dpiBySite.has(lowerSite)) continue
    const upperDpi = dpiBySite.get(upperSite)
    if (upperDpi !== undefined) dpiBySite.set(lowerSite, upperDpi)
  }

  return dpiBySite
}

function buildInfoBySite(infoTable: { rows: GvizRow[] }): Map<string, SiteInfoExtras> {
  const bySite = new Map<string, SiteInfoExtras>()
  for (const row of infoTable.rows) {
    const siteRaw = cellValue(row, I.site)
    if (siteRaw === null || siteRaw === '') continue
    const site = String(Number(String(siteRaw).trim()))
    if (!site || site === 'NaN') continue
    if (/^site$/i.test(String(siteRaw))) continue

    const existing = bySite.get(site) ?? {}
    const address = cellString(row, I.streetAddress).trim()
    if (address && !existing.address) existing.address = address

    if (existing.boardDistrict === undefined) {
      const district = formatBoardDistrict(cellValue(row, I.boardDistrict))
      if (district) existing.boardDistrict = district
    }

    const preRaw = cellValue(row, I.pre1978)
    if (preRaw !== null && preRaw !== '' && existing.pre1978LeadRisk === undefined) {
      existing.pre1978LeadRisk = parseYes(preRaw)
    }

    const adaRaw = cellValue(row, I.accessible)
    if (adaRaw !== null && adaRaw !== '' && existing.adaAccessible === undefined) {
      // Yes → true; No / NA / blank → false
      existing.adaAccessible = parseYes(adaRaw)
    }

    const spedRaw = cellValue(row, I.specialEdCount)
    if (
      spedRaw !== null &&
      spedRaw !== '' &&
      existing.specialEdProgramCount === undefined
    ) {
      const n = parseNumber(spedRaw)
      if (Number.isFinite(n)) existing.specialEdProgramCount = n
    }

    if (existing.overutilizedMpsWithin1Mile === undefined) {
      const distRaw = cellValue(row, I.distanceOverutilized)
      // Only set when the cell has a parseable distance (blank stays default false)
      if (distRaw !== null && distRaw !== '' && !/^n\/?a$/i.test(String(distRaw).trim())) {
        existing.overutilizedMpsWithin1Mile =
          parseOverutilizedAtDistanceZero(distRaw)
      }
    }

    if (existing.nonMpsSchoolsWithin1Mile === undefined) {
      const nonMpsRaw = cellValue(row, I.nonMpsWithin1Mile)
      if (
        nonMpsRaw !== null &&
        nonMpsRaw !== '' &&
        !/^n\/?a$/i.test(String(nonMpsRaw).trim())
      ) {
        existing.nonMpsSchoolsWithin1Mile = parseYes(nonMpsRaw)
      }
    }

    if (existing.academicPerformance === undefined) {
      const rcRaw = cellValue(row, I.reportCardScore)
      if (
        rcRaw !== null &&
        rcRaw !== '' &&
        !/^n\/?a$/i.test(String(rcRaw).trim())
      ) {
        const n = parseNumber(rcRaw)
        if (Number.isFinite(n)) existing.academicPerformance = n
      }
    }

    bySite.set(site, existing)
  }
  return bySite
}

function resolveRaceLabels(enrollmentTable: GvizTable): string[] {
  const labels: string[] = []
  for (let i = E.raceStart; i <= E.raceEnd; i++) {
    const fromCol = enrollmentTable.cols?.[i]?.label?.trim() ?? ''
    labels.push(fromCol)
  }
  if (labels.every((l) => l.length > 0)) return labels

  for (const row of enrollmentTable.rows.slice(0, 8)) {
    const rowLabels: string[] = []
    let looksLikeHeader = true
    for (let i = E.raceStart; i <= E.raceEnd; i++) {
      const raw = cellString(row, i)
      if (!raw) {
        looksLikeHeader = false
        break
      }
      if (/^\d+(\.\d+)?$/.test(raw)) {
        looksLikeHeader = false
        break
      }
      rowLabels.push(raw)
    }
    if (looksLikeHeader && rowLabels.length === E.raceEnd - E.raceStart + 1) {
      return rowLabels
    }
  }

  return [...DEFAULT_RACE_ETHNICITY_LABELS]
}

function buildEnrollmentBySite(enrollmentTable: GvizTable): Map<
  string,
  SiteEnrollmentExtras
> {
  const bySite = new Map<string, SiteEnrollmentExtras>()
  const raceLabels = resolveRaceLabels(enrollmentTable)

  for (const row of enrollmentTable.rows) {
    const siteRaw = cellValue(row, E.site)
    if (siteRaw === null || siteRaw === '') continue
    const site = String(Number(String(siteRaw).trim()))
    if (!site || site === 'NaN') continue
    if (/^site$/i.test(String(siteRaw))) continue

    const existing = bySite.get(site) ?? {}

    // Enrollment headcount first — race % columns convert via this
    if (existing.currentEnrollment === undefined) {
      const raw = cellValue(row, E.currentEnrollment)
      if (raw !== null && raw !== '' && !/^n\/?a$/i.test(String(raw).trim())) {
        const n = parseNumber(raw)
        if (Number.isFinite(n)) existing.currentEnrollment = n
      }
    }

    if (existing.studentsInAttendanceArea === undefined) {
      const pair = cellPair(row, E.attendanceAreaPct)
      const pct = parsePercent(pair.v, pair.f)
      // Avoid treating empty as 0 unless the cell actually parsed
      if (
        pair.v !== null &&
        pair.v !== '' &&
        !(typeof pair.v === 'string' && !String(pair.v).trim())
      ) {
        existing.studentsInAttendanceArea = pct
      }
    }
    if (existing.economicDisadvantageRate === undefined) {
      const pair = cellPair(row, E.economicallyDisadvantagedPct)
      if (
        pair.v !== null &&
        pair.v !== '' &&
        !(typeof pair.v === 'string' && !String(pair.v).trim())
      ) {
        existing.economicDisadvantageRate = parsePercent(pair.v, pair.f)
      }
    }
    if (existing.economicallyDisadvantagedCount === undefined) {
      const raw = cellValue(row, E.economicallyDisadvantagedCount)
      if (raw !== null && raw !== '' && !/^n\/?a$/i.test(String(raw).trim())) {
        const n = parseNumber(raw)
        if (Number.isFinite(n)) existing.economicallyDisadvantagedCount = n
      }
    }
    if (existing.ellStudentCount === undefined) {
      const raw = cellValue(row, E.ellStudentCount)
      if (raw !== null && raw !== '' && !/^n\/?a$/i.test(String(raw).trim())) {
        const n = parseNumber(raw)
        if (Number.isFinite(n)) existing.ellStudentCount = n
      }
    }
    if (existing.raceEthnicityCounts === undefined) {
      // 3.3 AR–AY are race *shares* (e.g. 0.92 / "91.68%"), not headcounts.
      // Convert to student counts using Current Enrollment (col S).
      const enrollment = existing.currentEnrollment ?? 0
      const counts: Record<string, number> = {}
      let any = false
      raceLabels.forEach((label, offset) => {
        const key = normalizeRaceEthnicityLabel(label)
        if (!key) return
        const pair = cellPair(row, E.raceStart + offset)
        if (
          pair.v === null ||
          pair.v === '' ||
          (typeof pair.v === 'string' && !String(pair.v).trim()) ||
          /^n\/?a$/i.test(String(pair.v).trim())
        ) {
          counts[key] = counts[key] ?? 0
          return
        }
        const pct = parsePercent(pair.v, pair.f) // 0–100
        const n = Math.round((pct / 100) * enrollment)
        counts[key] = (counts[key] ?? 0) + (Number.isFinite(n) ? Math.max(0, n) : 0)
        any = true
      })
      if (any) existing.raceEthnicityCounts = counts
    }
    bySite.set(site, existing)
  }
  return bySite
}

/** Load schools from the original LRFMP workbook (Evaluate = Yes only). */
export async function loadOldWorkbookSchools(): Promise<SchoolCollection> {
  const [
    decisionTable,
    buildingTable,
    connectionsTable,
    infoTable,
    enrollmentTable,
  ] = await Promise.all([
    fetchSheetTable(SHEET_NAMES.decisionFlow),
    fetchSheetTable(SHEET_NAMES.buildingComposite),
    fetchSheetTable(SHEET_NAMES.connections),
    fetchSheetTable(SHEET_NAMES.schoolInformation),
    fetchSheetTable(SHEET_NAMES.schoolEnrollment),
  ])

  const dpiBySite = buildDpiBySite(connectionsTable)
  const infoBySite = buildInfoBySite(infoTable)
  const enrollmentBySite = buildEnrollmentBySite(enrollmentTable)

  const buildingBySite = new Map<
    string,
    {
      fci: number
      energyUseIntensity: number
      acCoverage: number
      compositeScore: number
    }
  >()

  for (const row of buildingTable.rows) {
    const extras = mapBuildingExtras(row)
    if (!extras) continue
    buildingBySite.set(extras.siteKey, extras)
  }

  const features: SchoolFeature[] = []
  for (const row of decisionTable.rows) {
    const props = mapDecisionRow(row)
    if (!props) continue

    const siteKey = siteKeyFromSchoolId(props.schoolId)
    const dpi = dpiBySite.get(siteKey)
    if (dpi !== undefined) props.dpiSchoolCode = dpi

    const info = infoBySite.get(siteKey)
    if (info) {
      if (info.address) props.address = info.address
      if (info.boardDistrict) props.boardDistrict = info.boardDistrict
      if (info.pre1978LeadRisk !== undefined) {
        props.pre1978LeadRisk = info.pre1978LeadRisk
      }
      if (info.adaAccessible !== undefined) {
        props.adaAccessible = info.adaAccessible
      }
      if (info.specialEdProgramCount !== undefined) {
        props.specialEdProgramCount = info.specialEdProgramCount
      }
      if (info.overutilizedMpsWithin1Mile !== undefined) {
        props.overutilizedMpsWithin1Mile = info.overutilizedMpsWithin1Mile
      }
      if (info.nonMpsSchoolsWithin1Mile !== undefined) {
        props.nonMpsSchoolsWithin1Mile = info.nonMpsSchoolsWithin1Mile
      }
      if (info.academicPerformance !== undefined) {
        props.academicPerformance = info.academicPerformance
      }
    }

    const enrollment = enrollmentBySite.get(siteKey)
    if (enrollment) {
      if (enrollment.studentsInAttendanceArea !== undefined) {
        props.studentsInAttendanceArea = enrollment.studentsInAttendanceArea
      }
      if (enrollment.economicDisadvantageRate !== undefined) {
        props.economicDisadvantageRate = enrollment.economicDisadvantageRate
      }
      if (enrollment.currentEnrollment !== undefined) {
        props.currentEnrollment = enrollment.currentEnrollment
      }
      if (enrollment.economicallyDisadvantagedCount !== undefined) {
        props.economicallyDisadvantagedCount =
          enrollment.economicallyDisadvantagedCount
      }
      if (enrollment.ellStudentCount !== undefined) {
        props.ellStudentCount = enrollment.ellStudentCount
      }
      if (enrollment.raceEthnicityCounts !== undefined) {
        props.raceEthnicityCounts = enrollment.raceEthnicityCounts
      }
    }

    const extras = buildingBySite.get(siteKey)
    if (extras) {
      props.fci = extras.fci
      props.energyUseIntensity = extras.energyUseIntensity
      props.acCoverage = extras.acCoverage
      // Prefer Decision Flow building score; fall back to 1.2 composite if missing
      if (!props.buildingScore && extras.compositeScore) {
        props.buildingScore = roundBuildingScore(extras.compositeScore)
      } else {
        props.buildingScore = roundBuildingScore(props.buildingScore)
      }
    }

    features.push(toFeature(props))
  }

  if (features.length === 0) {
    throw new Error(
      'No evaluable schools were found in sheet 1.1 Decision Flow (Evaluate = Yes).',
    )
  }

  return { type: 'FeatureCollection', features }
}

export type { LoadSchoolsResult } from './loadSchoolsFromNewSheet'
export type { SheetSourceId, FallbackFieldInfo } from './sheetSources'

/** Load schools from the selected workbook (defaults to the new sheet). */
export async function loadSchoolsFromSheets(
  source: import('./sheetSources').SheetSourceId = 'new',
  thresholds?: import('../config/strategyGroups').DecisionThresholds,
): Promise<import('./loadSchoolsFromNewSheet').LoadSchoolsResult> {
  if (source === 'old') {
    const collection = await loadOldWorkbookSchools()
    return {
      collection,
      fallbackFields: [],
      source: 'old',
      distanceRuntime: null,
    }
  }
  const { loadNewWorkbookSchools } = await import('./loadSchoolsFromNewSheet')
  return loadNewWorkbookSchools(thresholds)
}

type GeoLocation = {
  coords: [number, number]
  schoolNam: string
}

/** Merge GeoJSON point locations onto sheet schools via DPI → SCHOOL_ID.
 *  Dual-campus SCHOOL_IDs (Bay View Montessori, Golda Meir, Spanish Immersion)
 *  are disambiguated with GeoJSON SCHOOL_NAM for upper vs lower.
 */
export function mergeGeoJsonLocations(
  sheetCollection: SchoolCollection,
  geojson: unknown,
): SchoolCollection {
  if (
    typeof geojson !== 'object' ||
    geojson === null ||
    (geojson as SchoolCollection).type !== 'FeatureCollection' ||
    !Array.isArray((geojson as SchoolCollection).features)
  ) {
    throw new Error('Invalid GeoJSON: expected a FeatureCollection')
  }

  /** SCHOOL_ID (normalized) → one or more campus points */
  const locationsByDpi = new Map<number, GeoLocation[]>()

  for (const feature of (geojson as SchoolCollection).features) {
    const coords = feature.geometry?.coordinates
    if (!coords || coords.length < 2) continue
    const pair: [number, number] = [Number(coords[0]), Number(coords[1])]
    if (!Number.isFinite(pair[0]) || !Number.isFinite(pair[1])) continue

    const props = feature.properties as unknown as Record<string, unknown> | undefined
    const dpi = normalizeDpiCode(
      (props?.SCHOOL_ID ??
        props?.school_id ??
        props?.School_ID) as string | number | boolean | null | undefined,
    )
    if (dpi === null) continue

    const schoolNam = String(
      props?.SCHOOL_NAM ?? props?.school_nam ?? props?.SHORT_NAM ?? '',
    )
    const list = locationsByDpi.get(dpi) ?? []
    list.push({ coords: pair, schoolNam })
    locationsByDpi.set(dpi, list)
  }

  if (locationsByDpi.size === 0) {
    throw new Error(
      'GeoJSON had no usable coordinates with SCHOOL_ID properties to match.',
    )
  }

  let matched = 0
  const features = sheetCollection.features.map((feature) => {
    const props = feature.properties
    const dpi = props.dpiSchoolCode
    if (dpi === undefined || dpi === null) return feature

    const candidates = locationsByDpi.get(dpi)
    if (!candidates || candidates.length === 0) return feature

    const siteKey = siteKeyFromSchoolId(props.schoolId)
    const namMatch = CAMPUS_GEO_NAME_MATCH[siteKey]
    let hit: GeoLocation | undefined
    if (namMatch) {
      hit = candidates.find((c) => namMatch(c.schoolNam))
    }
    if (!hit) hit = candidates[0]

    if (!hit) return feature
    matched += 1
    return {
      ...feature,
      geometry: { type: 'Point' as const, coordinates: hit.coords },
    }
  })

  if (matched === 0) {
    throw new Error(
      'No GeoJSON features matched sheet schools (expected DPI School Code ↔ SCHOOL_ID).',
    )
  }

  return { type: 'FeatureCollection', features }
}

/** Placeholder [0,0] means the school has no matched GeoJSON location yet. */
export function hasMapCoordinates(feature: SchoolFeature): boolean {
  const [lng, lat] = feature.geometry.coordinates
  return Number.isFinite(lng) && Number.isFinite(lat) && !(lng === 0 && lat === 0)
}

/** Sheet schools (Evaluate = Yes) that did not match any GeoJSON SCHOOL_ID / DPI. */
export function listSchoolsMissingLocations(
  collection: SchoolCollection,
): { schoolId: string; schoolName: string }[] {
  return collection.features
    .filter((f) => !hasMapCoordinates(f))
    .map((f) => ({
      schoolId: f.properties.schoolId,
      schoolName: f.properties.schoolName,
    }))
    .sort((a, b) => a.schoolName.localeCompare(b.schoolName))
}
