import type { DecisionThresholds } from '../config/strategyGroups'
import type { SchoolProperties } from '../types/school'
import {
  cellValue,
  isBlankOrErrorCell,
  type GvizTable,
} from './googleSheets'

/** Fixed search radius for overutilized-MPS proximity (not flowchart-editable). */
export const OVERUTILIZED_MILES = 1

/**
 * Parse School-to-School Distances into UniqueID → (neighbor UniqueID → miles).
 * Supports:
 * - SchoolToSchoolDistances long form: In_UniqueID, Near_UniqueID, Distance (Miles)
 * - Square matrix (row/col headers = UniqueIDs)
 * - Simple long table (fromId, toId, miles in first three columns)
 */
export function parseDistanceMatrix(
  table: GvizTable,
): Map<string, Map<string, number>> | null {
  const rows = table.rows
  if (!rows.length) return null

  // Skip instruction-only sheets
  const first = String(cellValue(rows[0], 0) ?? '')
  if (/instructions:/i.test(first) && rows.length <= 2) return null

  const labeled = tryParseLabeledLongForm(table)
  if (labeled && labeled.size > 0) return labeled

  const longForm = tryParseLongForm(table)
  if (longForm && longForm.size > 0) return longForm

  const matrix = tryParseSquareMatrix(table)
  if (matrix && matrix.size > 0) return matrix

  return null
}

function findColIndex(table: GvizTable, ...patterns: RegExp[]): number {
  for (let i = 0; i < table.cols.length; i++) {
    const label = String(table.cols[i]?.label ?? '').trim()
    if (patterns.some((p) => p.test(label))) return i
  }
  return -1
}

/** SchoolToSchoolDistances: In_UniqueID / Near_UniqueID / Distance (Miles). */
function tryParseLabeledLongForm(
  table: GvizTable,
): Map<string, Map<string, number>> | null {
  const fromIdx = findColIndex(table, /^in[_\s-]*unique\s*id$/i)
  const toIdx = findColIndex(table, /^near[_\s-]*unique\s*id$/i)
  const distIdx = findColIndex(table, /distance.*miles/i, /^distance$/i)
  if (fromIdx < 0 || toIdx < 0 || distIdx < 0) return null

  const out = new Map<string, Map<string, number>>()
  const add = (a: string, b: string, miles: number) => {
    if (!out.has(a)) out.set(a, new Map())
    const existing = out.get(a)!.get(b)
    if (existing === undefined || miles < existing) {
      out.get(a)!.set(b, miles)
    }
  }

  for (const row of table.rows) {
    const a = normalizeUniqueId(String(cellValue(row, fromIdx) ?? '').trim())
    const b = normalizeUniqueId(String(cellValue(row, toIdx) ?? '').trim())
    const raw = cellValue(row, distIdx)
    if (isBlankOrErrorCell(raw)) continue
    const miles = Number(raw)
    if (!a || !b || a.length < 4 || b.length < 4) continue
    if (!Number.isFinite(miles) || miles < 0) continue
    add(a, b, miles)
    add(b, a, miles)
  }
  return out.size > 0 ? out : null
}

function tryParseSquareMatrix(
  table: GvizTable,
): Map<string, Map<string, number>> | null {
  const rows = table.rows
  let headerRowIdx = -1
  let headerIds: string[] = []
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const ids: string[] = []
    const width = rows[r].c?.length ?? 0
    for (let c = 1; c < width; c++) {
      const raw = String(cellValue(rows[r], c) ?? '').trim()
      if (!raw || /instructions/i.test(raw)) continue
      ids.push(normalizeUniqueId(raw))
    }
    const valid = ids.filter((id) => id.length >= 4)
    if (valid.length >= 5) {
      headerRowIdx = r
      headerIds = ids
      break
    }
  }
  if (headerRowIdx < 0) {
    const labelIds = table.cols
      .slice(1)
      .map((c) => normalizeUniqueId(String(c.label ?? '').trim()))
      .filter((id) => id.length >= 4)
    if (labelIds.length >= 5) {
      headerRowIdx = -1
      headerIds = table.cols
        .slice(1)
        .map((c) => normalizeUniqueId(String(c.label ?? '').trim()))
    } else {
      return null
    }
  }

  const out = new Map<string, Map<string, number>>()
  const dataStart = headerRowIdx + 1
  for (let r = Math.max(0, dataStart); r < rows.length; r++) {
    const rowId = normalizeUniqueId(String(cellValue(rows[r], 0) ?? '').trim())
    if (!rowId || rowId.length < 4) continue
    const neighbors = new Map<string, number>()
    for (let i = 0; i < headerIds.length; i++) {
      const colId = headerIds[i]
      if (!colId || colId === rowId) continue
      const raw = cellValue(rows[r], i + 1)
      if (isBlankOrErrorCell(raw)) continue
      const miles = Number(raw)
      if (!Number.isFinite(miles) || miles < 0) continue
      neighbors.set(colId, miles)
    }
    if (neighbors.size > 0) out.set(rowId, neighbors)
  }
  return out.size > 0 ? out : null
}

function tryParseLongForm(
  table: GvizTable,
): Map<string, Map<string, number>> | null {
  const out = new Map<string, Map<string, number>>()
  for (const row of table.rows) {
    const a = normalizeUniqueId(String(cellValue(row, 0) ?? '').trim())
    const b = normalizeUniqueId(String(cellValue(row, 1) ?? '').trim())
    const miles = Number(cellValue(row, 2))
    if (!a || !b || a.length < 4 || b.length < 4) continue
    if (!Number.isFinite(miles) || miles < 0) continue
    if (!out.has(a)) out.set(a, new Map())
    out.get(a)!.set(b, miles)
  }
  return out.size > 0 ? out : null
}

export function normalizeUniqueId(raw: string): string {
  return raw.trim().toLowerCase()
}

export type ProximityFlags = {
  nearUnderutilizedSchool: boolean
  nearbyCapacityAvailable: boolean
  overutilizedMpsWithin1Mile: boolean
}

export type DistanceRuntime = {
  matrix: Map<string, Map<string, number>>
  /** schoolId (MPS-NNN) → UniqueID */
  uniqueIdBySchoolId: Map<string, string>
}

/**
 * Recompute proximity booleans from the distance matrix.
 * Mile radii for underutilized / capacity are independent; overutilized uses
 * {@link OVERUTILIZED_MILES}.
 */
export function computeProximityFlags(
  schools: Array<{
    uniqueId: string
    utilizationRate: number
    siteExpansionCapacity: boolean
  }>,
  distances: Map<string, Map<string, number>>,
  thresholds: Pick<
    DecisionThresholds,
    | 'utilizationLow'
    | 'utilizationHigh'
    | 'nearbyCapacityMiles'
    | 'nearUnderutilizedMiles'
  >,
): Map<string, ProximityFlags> {
  const byId = new Map(
    schools.map((s) => [normalizeUniqueId(s.uniqueId), s] as const),
  )
  const result = new Map<string, ProximityFlags>()

  for (const school of schools) {
    const id = normalizeUniqueId(school.uniqueId)
    const neighbors = distances.get(id) ?? new Map()
    let nearUnder = false
    let nearCap = false
    let nearOver = false

    for (const [otherId, miles] of neighbors) {
      if (otherId === id) continue
      const other = byId.get(otherId)
      if (!other) continue
      if (
        miles >= 0 &&
        miles <= thresholds.nearUnderutilizedMiles &&
        other.utilizationRate < thresholds.utilizationLow
      ) {
        nearUnder = true
      }
      if (
        miles >= 0 &&
        miles <= thresholds.nearbyCapacityMiles &&
        other.siteExpansionCapacity
      ) {
        nearCap = true
      }
      if (
        miles >= 0 &&
        miles <= OVERUTILIZED_MILES &&
        other.utilizationRate >= thresholds.utilizationHigh
      ) {
        nearOver = true
      }
    }

    result.set(id, {
      nearUnderutilizedSchool: nearUnder,
      nearbyCapacityAvailable: nearCap,
      overutilizedMpsWithin1Mile: nearOver,
    })
  }

  return result
}

/** Apply live proximity flags onto school properties (New sheet + distance runtime). */
export function applyDistanceProximity(
  schools: SchoolProperties[],
  runtime: DistanceRuntime,
  thresholds: DecisionThresholds,
): SchoolProperties[] {
  const inputs = schools
    .map((school) => {
      const uniqueId = runtime.uniqueIdBySchoolId.get(school.schoolId)
      if (!uniqueId) return null
      return {
        uniqueId,
        utilizationRate: school.utilizationRate,
        siteExpansionCapacity: school.siteExpansionCapacity,
        schoolId: school.schoolId,
      }
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))

  const flags = computeProximityFlags(inputs, runtime.matrix, thresholds)
  return schools.map((school) => {
    const uniqueId = runtime.uniqueIdBySchoolId.get(school.schoolId)
    if (!uniqueId) return school
    const flag = flags.get(normalizeUniqueId(uniqueId))
    if (!flag) return school
    return {
      ...school,
      nearUnderutilizedSchool: flag.nearUnderutilizedSchool,
      nearbyCapacityAvailable: flag.nearbyCapacityAvailable,
      overutilizedMpsWithin1Mile: flag.overutilizedMpsWithin1Mile,
    }
  })
}
