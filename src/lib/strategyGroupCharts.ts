import { STRATEGY_GROUPS } from '../config/strategyGroups'
import {
  DEFAULT_RACE_ETHNICITY_LABELS,
  normalizeRaceEthnicityLabel,
} from './loadSchoolsFromSheets'
import type {
  ClassificationResult,
  SchoolProperties,
  StrategyGroupId,
} from '../types/school'

export type GroupCountBar = {
  groupId: StrategyGroupId
  label: string
  shortLabel: string
  color: string
  value: number
}

export type StackSegment = {
  groupId: StrategyGroupId
  label: string
  shortLabel: string
  color: string
  value: number
}

export type StackedCategoryBar = {
  category: string
  stacks: StackSegment[]
  total: number
}

export const FRL_CATEGORY_ORDER = ['FRL', 'Non-FRL'] as const
export const ELL_CATEGORY_ORDER = ['ELL', 'Non-ELL'] as const

function groupIdBySchool(
  classifications: ClassificationResult[],
): Map<string, StrategyGroupId> {
  return new Map(classifications.map((c) => [c.schoolId, c.groupId]))
}

function emptyGroupCounts(): Record<StrategyGroupId, number> {
  return Object.fromEntries(STRATEGY_GROUPS.map((g) => [g.id, 0])) as Record<
    StrategyGroupId,
    number
  >
}

function toGroupBars(counts: Record<StrategyGroupId, number>): GroupCountBar[] {
  return STRATEGY_GROUPS.map((g) => ({
    groupId: g.id,
    label: g.label,
    shortLabel: g.shortLabel,
    color: g.color,
    value: counts[g.id] ?? 0,
  }))
}

function toStackedBars(
  byCategory: Map<string, Record<StrategyGroupId, number>>,
  categoryOrder: string[],
): StackedCategoryBar[] {
  return categoryOrder.map((category) => {
    const counts = byCategory.get(category) ?? emptyGroupCounts()
    const stacks: StackSegment[] = STRATEGY_GROUPS.map((g) => ({
      groupId: g.id,
      label: g.label,
      shortLabel: g.shortLabel,
      color: g.color,
      value: counts[g.id] ?? 0,
    }))
    return {
      category,
      stacks,
      total: stacks.reduce((sum, s) => sum + s.value, 0),
    }
  })
}

/** Sum a numeric school field by strategy group. */
export function aggregateCountByStrategyGroup(
  schools: SchoolProperties[],
  classifications: ClassificationResult[],
  getCount: (school: SchoolProperties) => number,
): GroupCountBar[] {
  const bySchool = groupIdBySchool(classifications)
  const counts = emptyGroupCounts()
  for (const school of schools) {
    const groupId = bySchool.get(school.schoolId)
    if (!groupId) continue
    const n = getCount(school)
    counts[groupId] += Number.isFinite(n) ? Math.max(0, n) : 0
  }
  return toGroupBars(counts)
}

/**
 * FRL vs Non-FRL student counts by strategy group.
 * Non-FRL = max(0, enrollment − FRL count).
 */
export function aggregateFreeReducedLunch(
  schools: SchoolProperties[],
  classifications: ClassificationResult[],
): StackedCategoryBar[] {
  const bySchool = groupIdBySchool(classifications)
  const byCategory = new Map<string, Record<StrategyGroupId, number>>()
  for (const cat of FRL_CATEGORY_ORDER) {
    byCategory.set(cat, emptyGroupCounts())
  }

  for (const school of schools) {
    const groupId = bySchool.get(school.schoolId)
    if (!groupId) continue
    const enrollment = Number.isFinite(school.currentEnrollment)
      ? Math.max(0, school.currentEnrollment)
      : 0
    const frl = Number.isFinite(school.economicallyDisadvantagedCount)
      ? Math.max(0, school.economicallyDisadvantagedCount)
      : 0
    const nonFrl = Math.max(0, enrollment - frl)
    byCategory.get('FRL')![groupId] += frl
    byCategory.get('Non-FRL')![groupId] += nonFrl
  }

  return toStackedBars(byCategory, [...FRL_CATEGORY_ORDER])
}

/**
 * ELL vs Non-ELL student counts by strategy group.
 * Non-ELL = max(0, enrollment − ELL count).
 */
export function aggregateEll(
  schools: SchoolProperties[],
  classifications: ClassificationResult[],
): StackedCategoryBar[] {
  const bySchool = groupIdBySchool(classifications)
  const byCategory = new Map<string, Record<StrategyGroupId, number>>()
  for (const cat of ELL_CATEGORY_ORDER) {
    byCategory.set(cat, emptyGroupCounts())
  }

  for (const school of schools) {
    const groupId = bySchool.get(school.schoolId)
    if (!groupId) continue
    const enrollment = Number.isFinite(school.currentEnrollment)
      ? Math.max(0, school.currentEnrollment)
      : 0
    const ell = Number.isFinite(school.ellStudentCount)
      ? Math.max(0, school.ellStudentCount)
      : 0
    const nonEll = Math.max(0, enrollment - ell)
    byCategory.get('ELL')![groupId] += ell
    byCategory.get('Non-ELL')![groupId] += nonEll
  }

  return toStackedBars(byCategory, [...ELL_CATEGORY_ORDER])
}

/** Race/ethnicity categories × strategy-group stacks (raw student counts). */
export function aggregateRaceEthnicity(
  schools: SchoolProperties[],
  classifications: ClassificationResult[],
): StackedCategoryBar[] {
  const bySchool = groupIdBySchool(classifications)
  const byRace = new Map<string, Record<StrategyGroupId, number>>()
  const seen = new Set<string>()

  for (const school of schools) {
    const groupId = bySchool.get(school.schoolId)
    if (!groupId) continue
    const counts = school.raceEthnicityCounts ?? {}
    for (const [race, raw] of Object.entries(counts)) {
      const key = normalizeRaceEthnicityLabel(race)
      if (!key) continue
      if (!byRace.has(key)) {
        byRace.set(key, emptyGroupCounts())
      }
      seen.add(key)
      const n = Number.isFinite(raw) ? Math.max(0, raw) : 0
      byRace.get(key)![groupId] += n
    }
  }

  const preferred = DEFAULT_RACE_ETHNICITY_LABELS.filter((l) => seen.has(l))
  const extras = [...seen].filter(
    (l) => !DEFAULT_RACE_ETHNICITY_LABELS.includes(l as (typeof DEFAULT_RACE_ETHNICITY_LABELS)[number]),
  )
  const order = [...preferred, ...extras.sort((a, b) => a.localeCompare(b))]

  return toStackedBars(byRace, order)
}

/** Board district × strategy-group stacks (sum of current enrollment). */
export function aggregateBoardDistrict(
  schools: SchoolProperties[],
  classifications: ClassificationResult[],
): StackedCategoryBar[] {
  const bySchool = groupIdBySchool(classifications)
  const byDistrict = new Map<string, Record<StrategyGroupId, number>>()

  for (const school of schools) {
    const groupId = bySchool.get(school.schoolId)
    if (!groupId) continue
    const district = (school.boardDistrict ?? '').trim()
    if (!district) continue
    if (!byDistrict.has(district)) {
      byDistrict.set(district, emptyGroupCounts())
    }
    const n = school.currentEnrollment ?? 0
    byDistrict.get(district)![groupId] += Number.isFinite(n) ? Math.max(0, n) : 0
  }

  const order = [...byDistrict.keys()].sort((a, b) => {
    const na = Number(a.replace(/\D/g, ''))
    const nb = Number(b.replace(/\D/g, ''))
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
    return a.localeCompare(b)
  })

  return toStackedBars(byDistrict, order)
}
