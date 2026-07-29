import type { RankedSchool } from './prioritization'
import type { ClassificationResult, SchoolProperties } from '../types/school'
import { STRATEGY_GROUP_MAP } from '../config/strategyGroups'
import { PRIORITIZATION_GROUP_MAP, type PrioritizationGroupId } from '../config/prioritizationGroups'
import { GROUP_WEIGHT_CONFIGS } from '../config/prioritizationWeights'
import { rankSchools } from './prioritization'
import { formatBuildingScore, formatGradeBand } from './formatters'

function csvEscape(value: string | number): string {
  const s = String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadCsv(filename: string, rows: string[][]) {
  const body = rows.map((row) => row.map(csvEscape).join(',')).join('\r\n')
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const HEADER = [
  'Strategy Group ID',
  'Strategy Group',
  'Rank',
  'School ID',
  'School Name',
  'Priority Score',
  'Utilization %',
  'Building Score',
  'Grade Band',
  'Programmatic Offerings',
]

function rankedToRows(
  groupId: PrioritizationGroupId,
  ranked: RankedSchool[],
): string[][] {
  const meta = PRIORITIZATION_GROUP_MAP[groupId]
  return ranked.map(({ school, score, rank }) => [
    groupId,
    meta.label,
    String(rank),
    school.schoolId,
    school.schoolName,
    (score * 100).toFixed(1),
    school.utilizationRate.toFixed(1),
    formatBuildingScore(school.buildingScore),
    formatGradeBand(school.gradeBand),
    String(school.programmaticOfferings),
  ])
}

export function downloadRankedGroupCsv(
  groupId: PrioritizationGroupId,
  ranked: RankedSchool[],
) {
  const stamp = new Date().toISOString().slice(0, 10)
  downloadCsv(`ranked-schools-${groupId}-${stamp}.csv`, [
    HEADER,
    ...rankedToRows(groupId, ranked),
  ])
}

export function downloadAllRankedGroupsCsv(
  schools: SchoolProperties[],
  classifications: ClassificationResult[],
  weightsByGroup: Record<string, Record<string, number>>,
) {
  const rows: string[][] = [HEADER]
  const byId = new Map(schools.map((s) => [s.schoolId, s]))

  for (const group of Object.values(STRATEGY_GROUP_MAP)) {
    const config = GROUP_WEIGHT_CONFIGS[group.id]
    if (!config) continue
    const groupSchools = classifications
      .filter((c) => c.groupId === group.id)
      .map((c) => byId.get(c.schoolId))
      .filter((s): s is SchoolProperties => Boolean(s))

    const ranked = rankSchools(
      groupSchools,
      config.criteria,
      weightsByGroup[group.id] ?? config.defaultWeights,
    )
    rows.push(...rankedToRows(group.id, ranked))
  }

  const stamp = new Date().toISOString().slice(0, 10)
  downloadCsv(`ranked-schools-all-groups-${stamp}.csv`, rows)
}

const ALL_SCHOOLS_HEADER = [
  'School ID',
  'School Name',
  'Strategy Group ID',
  'Strategy Group',
  'Utilization %',
  'Building Score',
  'Programmatic Offerings',
  'Grade Band',
]

/** Unranked school inventory with assigned strategy group (Summary tab export). */
export function downloadAllSchoolsCsv(
  schools: SchoolProperties[],
  classifications: ClassificationResult[],
) {
  const groupBySchool = new Map(
    classifications.map((c) => [c.schoolId, c.groupId] as const),
  )

  const rows = [...schools]
    .sort((a, b) => a.schoolName.localeCompare(b.schoolName))
    .map((school) => {
      const groupId = groupBySchool.get(school.schoolId)
      const meta = groupId ? STRATEGY_GROUP_MAP[groupId] : undefined
      return [
        school.schoolId,
        school.schoolName,
        groupId ?? '',
        meta?.label ?? '',
        school.utilizationRate.toFixed(1),
        formatBuildingScore(school.buildingScore),
        String(school.programmaticOfferings),
        formatGradeBand(school.gradeBand),
      ]
    })

  const stamp = new Date().toISOString().slice(0, 10)
  downloadCsv(`all-schools-by-strategy-group-${stamp}.csv`, [
    ALL_SCHOOLS_HEADER,
    ...rows,
  ])
}
