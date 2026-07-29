import type { StrategyGroupId } from '../types/school'

export interface StrategyGroupMeta {
  id: StrategyGroupId
  label: string
  shortLabel: string
  category: 'closure' | 'building' | 'program' | 'mixed' | 'monitor'
  description: string
  color: string
}

export const STRATEGY_GROUPS: StrategyGroupMeta[] = [
  {
    id: '1',
    label: '1: CLOSURE / MERGER',
    shortLabel: 'Closure / Merger',
    category: 'closure',
    description:
      'Schools identified as potential candidates for consolidation or closure',
    color: '#b33a4b',
  },
  {
    id: '2.1',
    label: '2.1: BUILDING & PROGRAMMATIC INVESTMENTS',
    shortLabel: 'Building & Programmatic',
    category: 'mixed',
    description:
      'Schools needing both significant capital improvements and enhanced academic programs',
    color: '#1e3a8a',
  },
  {
    id: '2.2',
    label: '2.2: BUILDING INVESTMENT',
    shortLabel: 'Building Investment',
    category: 'building',
    description:
      'Schools requiring significant capital improvements to facility infrastructure',
    color: '#2563eb',
  },
  {
    id: '2.3',
    label: '2.3: PROGRAMMATIC INVESTMENT',
    shortLabel: 'Programmatic Investment',
    category: 'program',
    description:
      'Schools needing enhanced academic programs or specialized offerings',
    color: '#0e7490',
  },
  {
    id: '2.4',
    label: '2.4: SITE-SPECIFIC EVALUATION OF ALTERNATIVE OPTIONS',
    shortLabel: 'Site-Specific Evaluation',
    category: 'building',
    description:
      'Overutilized schools needing site-specific evaluation of expansion or alternative options',
    color: '#09Aff6',
  },
  {
    id: '3',
    label: '3: ONGOING MONITORING & EVALUATION',
    shortLabel: 'Ongoing Monitoring',
    category: 'monitor',
    description:
      'Schools in relatively stable condition recommended for continued monitoring',
    color: '#c98e13',
  },
  {
    id: '4',
    label: '4: BUILDING ADDITION',
    shortLabel: 'Building Addition',
    category: 'building',
    description:
      'Schools with sustained overutilization and site capacity for campus expansion',
    color: '#e75d1b',
  },
]

export const STRATEGY_GROUP_MAP = Object.fromEntries(
  STRATEGY_GROUPS.map((g) => [g.id, g]),
) as Record<StrategyGroupId, StrategyGroupMeta>

/** User-adjustable decision-tree cutoffs (inclusive ≥ comparisons). */
export type DecisionThresholds = {
  utilizationLow: number
  utilizationHigh: number
  enrollmentGrowthMin: number
  buildingScoreCutoff: number
  /** Cutoff after building score ≥ threshold (programs_hi_bldg card) */
  programmaticOfferingsCutoffHi: number
  /** Cutoff after building score < threshold (programs_lo_bldg card) */
  programmaticOfferingsCutoffLo: number
  /** Miles for “nearby schools have available student capacity” */
  nearbyCapacityMiles: number
  /** Miles for “within X of another underutilized school” */
  nearUnderutilizedMiles: number
}

export const DEFAULT_THRESHOLDS: DecisionThresholds = {
  utilizationLow: 50,
  utilizationHigh: 100,
  enrollmentGrowthMin: 0,
  buildingScoreCutoff: 6,
  programmaticOfferingsCutoffHi: 2,
  programmaticOfferingsCutoffLo: 2,
  nearbyCapacityMiles: 1,
  nearUnderutilizedMiles: 1,
}

/** @deprecated Prefer DEFAULT_THRESHOLDS / DecisionThresholds state */
export const THRESHOLDS = DEFAULT_THRESHOLDS

type ThresholdPartial = Partial<DecisionThresholds> & {
  /** Legacy single program cutoff from early share links */
  programmaticOfferingsCutoff?: number
}

export function mergeThresholds(
  partial?: ThresholdPartial | null,
): DecisionThresholds {
  if (!partial) return { ...DEFAULT_THRESHOLDS }
  const legacyPrograms =
    typeof partial.programmaticOfferingsCutoff === 'number'
      ? partial.programmaticOfferingsCutoff
      : undefined
  return {
    utilizationLow:
      typeof partial.utilizationLow === 'number'
        ? partial.utilizationLow
        : DEFAULT_THRESHOLDS.utilizationLow,
    utilizationHigh:
      typeof partial.utilizationHigh === 'number'
        ? partial.utilizationHigh
        : DEFAULT_THRESHOLDS.utilizationHigh,
    enrollmentGrowthMin:
      typeof partial.enrollmentGrowthMin === 'number'
        ? partial.enrollmentGrowthMin
        : DEFAULT_THRESHOLDS.enrollmentGrowthMin,
    buildingScoreCutoff:
      typeof partial.buildingScoreCutoff === 'number'
        ? partial.buildingScoreCutoff
        : DEFAULT_THRESHOLDS.buildingScoreCutoff,
    programmaticOfferingsCutoffHi:
      typeof partial.programmaticOfferingsCutoffHi === 'number'
        ? partial.programmaticOfferingsCutoffHi
        : (legacyPrograms ?? DEFAULT_THRESHOLDS.programmaticOfferingsCutoffHi),
    programmaticOfferingsCutoffLo:
      typeof partial.programmaticOfferingsCutoffLo === 'number'
        ? partial.programmaticOfferingsCutoffLo
        : (legacyPrograms ?? DEFAULT_THRESHOLDS.programmaticOfferingsCutoffLo),
    nearbyCapacityMiles:
      typeof partial.nearbyCapacityMiles === 'number'
        ? partial.nearbyCapacityMiles
        : DEFAULT_THRESHOLDS.nearbyCapacityMiles,
    nearUnderutilizedMiles:
      typeof partial.nearUnderutilizedMiles === 'number'
        ? partial.nearUnderutilizedMiles
        : DEFAULT_THRESHOLDS.nearUnderutilizedMiles,
  }
}

export function thresholdsEqual(
  a: DecisionThresholds,
  b: DecisionThresholds,
): boolean {
  return (
    a.utilizationLow === b.utilizationLow &&
    a.utilizationHigh === b.utilizationHigh &&
    a.enrollmentGrowthMin === b.enrollmentGrowthMin &&
    a.buildingScoreCutoff === b.buildingScoreCutoff &&
    a.programmaticOfferingsCutoffHi === b.programmaticOfferingsCutoffHi &&
    a.programmaticOfferingsCutoffLo === b.programmaticOfferingsCutoffLo &&
    a.nearbyCapacityMiles === b.nearbyCapacityMiles &&
    a.nearUnderutilizedMiles === b.nearUnderutilizedMiles
  )
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** e.g. 1 → "1 mile", 1.5 → "1.5 miles", 2 → "2 miles" */
export function formatMilesPhrase(miles: number): string {
  const n = Math.round(miles * 10) / 10
  const num = Number.isInteger(n) ? String(n) : n.toFixed(1)
  return `${num} mile${n === 1 ? '' : 's'}`
}

/** Sanitize and clamp a partial update onto the current thresholds. */
export function applyThresholdPatch(
  current: DecisionThresholds,
  key: keyof DecisionThresholds,
  raw: number,
): DecisionThresholds {
  const next = { ...current }
  switch (key) {
    case 'utilizationLow': {
      next.utilizationLow = clamp(Math.round(raw * 10) / 10, 0, 200)
      if (next.utilizationHigh < next.utilizationLow) {
        next.utilizationHigh = next.utilizationLow
      }
      break
    }
    case 'utilizationHigh': {
      next.utilizationHigh = clamp(Math.round(raw * 10) / 10, 0, 200)
      if (next.utilizationHigh < next.utilizationLow) {
        next.utilizationLow = next.utilizationHigh
      }
      break
    }
    case 'enrollmentGrowthMin': {
      next.enrollmentGrowthMin = clamp(Math.round(raw * 10) / 10, -100, 100)
      break
    }
    case 'buildingScoreCutoff': {
      next.buildingScoreCutoff = clamp(Math.round(raw * 10) / 10, 1, 10)
      break
    }
    case 'programmaticOfferingsCutoffHi':
    case 'programmaticOfferingsCutoffLo': {
      next[key] = clamp(Math.round(raw), 0, 50)
      break
    }
    case 'nearbyCapacityMiles':
    case 'nearUnderutilizedMiles': {
      next[key] = clamp(Math.round(raw * 10) / 10, 0.1, 20)
      break
    }
  }
  return next
}