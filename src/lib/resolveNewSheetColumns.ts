import {
  allNewSheetFields,
  headersRoughlyMatch,
  normalizeSheetHeader,
  newSheetTabName,
  type NewSheetFieldSpec,
  type NewSheetTabKey,
} from '../config/newSheetFieldMap'
import { cellString, type GvizTable } from './googleSheets'
import type { FallbackFieldInfo } from './sheetSources'

function looksLikeHeaderNoise(raw: string): boolean {
  if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(raw)) return true
  if (/^date(\s+last\s+(accessed|edited))?$/i.test(raw)) return true
  if (/^\d+(\.\d+)?%?$/.test(raw)) return true
  if (/^#(ref|n\/?a|value|div\/0|name|null|error)!?$/i.test(raw)) return true
  return false
}

/**
 * Header text for each column index (gviz cols[].label, else early-row scan).
 * Empty string when no usable header is found.
 */
export function listColumnHeaders(table: GvizTable): string[] {
  const width = Math.max(
    table.cols?.length ?? 0,
    ...table.rows.slice(0, 5).map((r) => r.c?.length ?? 0),
    0,
  )
  const headers: string[] = []
  for (let idx = 0; idx < width; idx++) {
    const fromCols = String(table.cols?.[idx]?.label ?? '').trim()
    if (fromCols) {
      headers.push(fromCols)
      continue
    }
    let found = ''
    for (const row of table.rows.slice(0, 5)) {
      const raw = cellString(row, idx)
      if (!raw || looksLikeHeaderNoise(raw)) continue
      found = raw
      break
    }
    headers.push(found)
  }
  return headers
}

export type ColumnResolveResult = {
  /** 0-based column index, or -1 if not found */
  index: number
  /** Number of columns that matched the expected label */
  matchCount: number
}

/**
 * Find column index for an expected header label (and optional rename aliases).
 * Prefers an exact normalized match (so “Capacity” ≠ “Growth Capacity”,
 * “FCI” ≠ “FCI Rank”, “Building Score” ≠ “Interim Building Score Helper”).
 * Falls back to rough token match, choosing the shortest header among ties.
 */
export function findColumnIndex(
  headers: string[],
  expectedLabel: string,
  aliases: string[] = [],
): ColumnResolveResult {
  const candidates = [expectedLabel, ...aliases].filter((s) =>
    Boolean(normalizeSheetHeader(s)),
  )
  if (candidates.length === 0) return { index: -1, matchCount: 0 }

  let best: ColumnResolveResult = { index: -1, matchCount: 0 }
  for (const candidate of candidates) {
    const result = findColumnIndexForLabel(headers, candidate)
    if (result.index < 0) continue
    // Prefer exact matches (matchCount from exact path is fine); take first hit
    // in label-then-alias order so the current name wins over legacy names.
    if (best.index < 0) {
      best = result
      // Exact normalized equality on the preferred label — stop early.
      const expectedNorm = normalizeSheetHeader(candidate)
      const actualNorm = normalizeSheetHeader(headers[result.index] ?? '')
      if (expectedNorm && expectedNorm === actualNorm) return result
    }
  }
  return best
}

function findColumnIndexForLabel(
  headers: string[],
  expectedLabel: string,
): ColumnResolveResult {
  const expectedNorm = normalizeSheetHeader(expectedLabel)
  if (!expectedNorm) return { index: -1, matchCount: 0 }

  const exact: number[] = []
  const rough: number[] = []
  for (let i = 0; i < headers.length; i++) {
    const actual = headers[i] ?? ''
    const actualNorm = normalizeSheetHeader(actual)
    if (!actualNorm) continue
    if (actualNorm === expectedNorm) {
      exact.push(i)
      continue
    }
    if (headersRoughlyMatch(expectedLabel, actual)) rough.push(i)
  }

  if (exact.length > 0) {
    return { index: exact[0], matchCount: exact.length }
  }
  if (rough.length === 0) return { index: -1, matchCount: 0 }

  let best = rough[0]
  let bestLen = normalizeSheetHeader(headers[best] ?? '').split(' ').filter(Boolean)
    .length
  for (const i of rough.slice(1)) {
    const len = normalizeSheetHeader(headers[i] ?? '')
      .split(' ')
      .filter(Boolean).length
    if (len < bestLen) {
      best = i
      bestLen = len
    }
  }
  return { index: best, matchCount: rough.length }
}

export type ResolvedColumnMap = Map<
  string,
  { tab: NewSheetTabKey; index: number; label: string }
>

/**
 * Convert an Excel column letter (A, B, …, Z, AA, …) to a 0-based index.
 */
export function excelColToIndex(col: string): number {
  const s = String(col ?? '')
    .trim()
    .toUpperCase()
  if (!/^[A-Z]+$/.test(s)) return -1
  let n = 0
  for (const ch of s) {
    n = n * 26 + (ch.charCodeAt(0) - 64)
  }
  return n - 1
}

/**
 * Resolve all mapped fields to live column indexes by header name.
 * Does not use fixed Excel letters — missing headers stay unresolved (index -1),
 * except enrollment-sums pivot fields which use col C and C+5.
 */
export function resolveNewSheetColumns(
  tables: Record<NewSheetTabKey, GvizTable>,
  fields: NewSheetFieldSpec[] = allNewSheetFields(),
): {
  byKey: ResolvedColumnMap
  issues: FallbackFieldInfo[]
  headersByTab: Record<NewSheetTabKey, string[]>
} {
  const headersByTab = {
    siteInfo: listColumnHeaders(tables.siteInfo),
    enrollment: listColumnHeaders(tables.enrollment),
    enrollmentSums: listColumnHeaders(tables.enrollmentSums),
    program: listColumnHeaders(tables.program),
    building: listColumnHeaders(tables.building),
  } as Record<NewSheetTabKey, string[]>

  const byKey: ResolvedColumnMap = new Map()
  const issues: FallbackFieldInfo[] = []
  const relativeSpecs: NewSheetFieldSpec[] = []

  for (const spec of fields) {
    const headers = headersByTab[spec.tab]
    const tabTitle = newSheetTabName(spec.tab)

    if (spec.pivotRelativeTo) {
      relativeSpecs.push(spec)
      continue
    }

    if (spec.pivotPosition === 'excel-col') {
      const idx = excelColToIndex(spec.col ?? '')
      if (idx < 0) {
        issues.push({
          key: `header:${spec.key}`,
          label: spec.label,
          reason: 'header-mismatch',
          detail: `Invalid Excel column “${spec.col ?? ''}” for “${tabTitle}”`,
        })
        byKey.set(spec.key, { tab: spec.tab, index: -1, label: spec.label })
      } else {
        byKey.set(spec.key, {
          tab: spec.tab,
          index: idx,
          label: spec.label,
        })
      }
      continue
    }

    const { index, matchCount } = findColumnIndex(
      headers,
      spec.label,
      spec.aliases ?? [],
    )

    if (index < 0) {
      issues.push({
        key: `header:${spec.key}`,
        label: spec.label,
        reason: 'header-mismatch',
        detail: `Header not found on “${tabTitle}”`,
      })
      byKey.set(spec.key, { tab: spec.tab, index: -1, label: spec.label })
      continue
    }

    if (matchCount > 1) {
      issues.push({
        key: `header:${spec.key}`,
        label: spec.label,
        reason: 'header-mismatch',
        detail: `Ambiguous header on “${tabTitle}” (${matchCount} matches; using first)`,
      })
    }

    byKey.set(spec.key, { tab: spec.tab, index, label: spec.label })
  }

  for (const spec of relativeSpecs) {
    const tabTitle = newSheetTabName(spec.tab)
    const base = byKey.get(spec.pivotRelativeTo ?? '')
    const offset = spec.pivotOffset ?? 0
    const idx =
      base && base.index >= 0 ? base.index + offset : -1
    if (idx < 0) {
      issues.push({
        key: `header:${spec.key}`,
        label: spec.label,
        reason: 'header-mismatch',
        detail: `Could not resolve relative column on “${tabTitle}” (base “${spec.pivotRelativeTo}” + ${offset})`,
      })
      byKey.set(spec.key, { tab: spec.tab, index: -1, label: spec.label })
    } else {
      byKey.set(spec.key, { tab: spec.tab, index: idx, label: spec.label })
    }
  }

  return { byKey, issues, headersByTab }
}
