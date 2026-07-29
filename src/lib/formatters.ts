/** Round building scores for display and stored sheet values (e.g. 5.14 → 5.1). */
export function roundBuildingScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 10) / 10
}

export function formatBuildingScore(value: number): string {
  return roundBuildingScore(value).toFixed(1)
}

/** Normalize grade band labels: "Elementary School" → "Elementary". */
export function formatGradeBand(value: string | undefined | null): string {
  if (!value) return '—'
  return value
    .replace(/\bSchools?\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}
