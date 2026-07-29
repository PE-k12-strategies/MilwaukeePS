import type { SchoolProperties } from '../types/school'

/** Available seats = capacity − enrollment (negative when over capacity). */
export function availableSeats(school: SchoolProperties): number | undefined {
  if (school.buildingCapacity == null || !Number.isFinite(school.buildingCapacity)) {
    return undefined
  }
  return school.buildingCapacity - (school.currentEnrollment ?? 0)
}

/** Percentile rank 0–100 (higher raw value → higher percentile). Ties share mid-rank. */
export function percentileRank(
  value: number,
  allValues: number[],
): number {
  const vals = allValues.filter((v) => Number.isFinite(v))
  if (vals.length === 0 || !Number.isFinite(value)) return 0
  if (vals.length === 1) return 50
  let below = 0
  let equal = 0
  for (const v of vals) {
    if (v < value) below += 1
    else if (v === value) equal += 1
  }
  return ((below + 0.5 * equal) / vals.length) * 100
}

export interface MetricComparison {
  value: number
  average: number
  schoolsBelow: number
  schoolsAbove: number
  /** Rank among schools where #1 = highest value */
  rankFromTop: number
  total: number
  aboveAverage: boolean
  pctBelow: number
  pctAbove: number
}

export function compareMetric(
  value: number,
  allValues: number[],
): MetricComparison {
  const vals = allValues.filter((v) => Number.isFinite(v))
  const total = vals.length
  const average =
    total === 0 ? 0 : vals.reduce((s, v) => s + v, 0) / total
  let schoolsBelow = 0
  let schoolsAbove = 0
  for (const v of vals) {
    if (v < value) schoolsBelow += 1
    else if (v > value) schoolsAbove += 1
  }
  return {
    value,
    average,
    schoolsBelow,
    schoolsAbove,
    rankFromTop: schoolsAbove + 1,
    total,
    aboveAverage: value >= average,
    pctBelow: total === 0 ? 0 : Math.round((schoolsBelow / total) * 100),
    pctAbove: total === 0 ? 0 : Math.round((schoolsAbove / total) * 100),
  }
}

export type RadarAxisKey =
  | 'utilizationRate'
  | 'currentEnrollment'
  | 'buildingScore'
  | 'economicDisadvantageRate'
  | 'academicPerformance'

export const RADAR_AXES: {
  key: RadarAxisKey
  label: string
}[] = [
  { key: 'utilizationRate', label: 'Utilization Rate' },
  { key: 'currentEnrollment', label: 'Enrollment' },
  { key: 'buildingScore', label: 'Building Score' },
  { key: 'economicDisadvantageRate', label: 'Free/Reduced Lunch' },
  { key: 'academicPerformance', label: 'Academic Performance' },
]

export function radarPercentiles(
  school: SchoolProperties,
  schools: SchoolProperties[],
): { key: RadarAxisKey; label: string; percentile: number }[] {
  return RADAR_AXES.map(({ key, label }) => {
    const all = schools.map((s) => Number(s[key]) || 0)
    const value = Number(school[key]) || 0
    return { key, label, percentile: percentileRank(value, all) }
  })
}

export interface DemoSlice {
  label: string
  count: number
  pct: number
  color: string
}

const DEMO_COLORS = [
  '#1e3a8a',
  '#f0b429',
  '#60a5fa',
  '#3b82f6',
  '#0e7490',
  '#8b5cf6',
  '#64748b',
]

/** Display order / labels for demographic pie (matches sheet race keys). */
const DEMO_ORDER: { match: RegExp; label: string }[] = [
  { match: /african|black/i, label: 'Black' },
  { match: /hispanic|latino/i, label: 'Hispanic' },
  { match: /^white$/i, label: 'White' },
  { match: /multi/i, label: 'Multi-Racial' },
  { match: /asian/i, label: 'Asian' },
  { match: /native|american indian/i, label: 'Native American' },
  { match: /hawaiian|pacific|hi\/pi/i, label: 'HI/PI' },
]

export function demographicSlices(school: SchoolProperties): DemoSlice[] {
  const counts = school.raceEthnicityCounts ?? {}
  const entries = Object.entries(counts).filter(
    ([, n]) => typeof n === 'number' && n > 0,
  )
  if (entries.length === 0) return []

  const total = entries.reduce((s, [, n]) => s + n, 0) || 1
  const used = new Set<string>()
  const ordered: { label: string; count: number }[] = []

  for (const { match, label } of DEMO_ORDER) {
    const hit = entries.find(([k]) => match.test(k) && !used.has(k))
    if (!hit) continue
    used.add(hit[0])
    ordered.push({ label, count: hit[1] })
  }
  for (const [k, n] of entries) {
    if (used.has(k)) continue
    ordered.push({ label: k, count: n })
  }

  return ordered.map((o, i) => ({
    ...o,
    pct: (o.count / total) * 100,
    color: DEMO_COLORS[i % DEMO_COLORS.length],
  }))
}
