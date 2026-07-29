/** Fixed utilization bands for the Understand School-Level Data map (not flowchart-linked). */

export type UtilizationBandId = 'under' | 'low' | 'good' | 'over'

export interface UtilizationBand {
  id: UtilizationBandId
  /** Legend label */
  label: string
  color: string
  /** utilizationRate is stored as a percent (e.g. 99.66). */
  matches: (utilizationPct: number) => boolean
}

export const UTILIZATION_BANDS: UtilizationBand[] = [
  {
    id: 'under',
    label: 'Under-utilized (<50%)',
    color: '#dc2626',
    matches: (u) => u < 50,
  },
  {
    id: 'low',
    label: 'Low utilization (50-75%)',
    color: '#eab308',
    matches: (u) => u >= 50 && u < 75,
  },
  {
    id: 'good',
    label: 'Good utilization (75-100%)',
    color: '#16a34a',
    matches: (u) => u >= 75 && u <= 100,
  },
  {
    id: 'over',
    label: 'Over-utilized (>100%)',
    color: '#2563eb',
    matches: (u) => u > 100,
  },
]

export const UTILIZATION_BAND_MAP = Object.fromEntries(
  UTILIZATION_BANDS.map((b) => [b.id, b]),
) as Record<UtilizationBandId, UtilizationBand>

export function utilizationBandFor(utilizationPct: number): UtilizationBand {
  return (
    UTILIZATION_BANDS.find((b) => b.matches(utilizationPct)) ??
    UTILIZATION_BANDS[0]
  )
}
