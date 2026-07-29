import type {
  PrioritizationCriterion,
  SchoolProperties,
} from '../types/school'

function rawValue(
  school: SchoolProperties,
  criterion: PrioritizationCriterion,
): number {
  const value = school[criterion.property]
  if (criterion.valueType === 'booleanDirect') {
    return value ? 1 : 0
  }
  if (criterion.valueType === 'booleanInverse') {
    return value ? 0 : 1
  }
  return typeof value === 'number' ? value : 0
}

function normalizeScores(
  schools: SchoolProperties[],
  criterion: PrioritizationCriterion,
): Map<string, number> {
  const values = schools.map((s) => ({
    id: s.schoolId,
    value: rawValue(s, criterion),
  }))

  const nums = values.map((v) => v.value)
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const range = max - min

  const map = new Map<string, number>()
  for (const { id, value } of values) {
    let norm = range === 0 ? 0.5 : (value - min) / range
    if (!criterion.higherIsPriority) {
      norm = 1 - norm
    }
    map.set(id, norm)
  }
  return map
}

export interface RankedSchool {
  school: SchoolProperties
  score: number
  rank: number
}

export function rankSchools(
  schools: SchoolProperties[],
  criteria: PrioritizationCriterion[],
  weights: Record<string, number>,
): RankedSchool[] {
  if (schools.length === 0) return []

  const active = criteria.filter((c) => (weights[c.key] ?? 0) > 0)
  const totalWeight = active.reduce((sum, c) => sum + (weights[c.key] ?? 0), 0)

  const normalized = new Map<string, Map<string, number>>()
  for (const criterion of active) {
    normalized.set(criterion.key, normalizeScores(schools, criterion))
  }

  const scored = schools.map((school) => {
    let score = 0
    if (totalWeight > 0) {
      for (const criterion of active) {
        const w = weights[criterion.key] ?? 0
        const n = normalized.get(criterion.key)?.get(school.schoolId) ?? 0
        score += (w / totalWeight) * n
      }
    }

    return { school, score }
  })

  scored.sort((a, b) => b.score - a.score)

  return scored.map((item, index) => ({
    ...item,
    rank: index + 1,
  }))
}
