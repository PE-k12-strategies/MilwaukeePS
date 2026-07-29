import type { SchoolProperties } from '../types/school'

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2
  }
  return sorted[mid]!
}

export type MissingBoardDistrictSchool = {
  schoolId: string
  schoolName: string
}

/**
 * Sets belowRegionalSpecialtyMedian: true when specialtyProgramCount is
 * strictly below the median specialtyProgramCount among evaluable schools
 * in the same Board District. Ties at the median are false.
 */
export function applyBelowRegionalSpecialtyMedian(
  schools: SchoolProperties[],
): {
  schools: SchoolProperties[]
  missingBoardDistrict: MissingBoardDistrictSchool[]
} {
  const missingBoardDistrict = schools
    .filter((s) => !(s.boardDistrict ?? '').trim())
    .map((s) => ({ schoolId: s.schoolId, schoolName: s.schoolName }))
    .sort((a, b) => a.schoolName.localeCompare(b.schoolName))

  const byDistrict = new Map<string, number[]>()
  for (const school of schools) {
    const district = (school.boardDistrict ?? '').trim()
    if (!district) continue
    const list = byDistrict.get(district) ?? []
    list.push(school.specialtyProgramCount ?? 0)
    byDistrict.set(district, list)
  }

  const medianByDistrict = new Map<string, number>()
  for (const [district, counts] of byDistrict) {
    const m = median(counts)
    if (m !== null) medianByDistrict.set(district, m)
  }

  const enriched = schools.map((school) => {
    const district = (school.boardDistrict ?? '').trim()
    if (!district) {
      return { ...school, belowRegionalSpecialtyMedian: false }
    }
    const districtMedian = medianByDistrict.get(district)
    if (districtMedian === undefined) {
      return { ...school, belowRegionalSpecialtyMedian: false }
    }
    const count = school.specialtyProgramCount ?? 0
    return {
      ...school,
      belowRegionalSpecialtyMedian: count < districtMedian,
    }
  })

  return { schools: enriched, missingBoardDistrict }
}
