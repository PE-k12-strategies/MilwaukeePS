import { STRATEGY_GROUPS, STRATEGY_GROUP_MAP } from './strategyGroups'
import type { StrategyGroupId } from '../types/school'

export const BUILDING_FOCUSED_GROUP_ID = 'all-building-focused'
export const PROGRAM_FOCUSED_GROUP_ID = 'all-program-focused'

export type PrioritizationGroupId =
  | StrategyGroupId
  | typeof BUILDING_FOCUSED_GROUP_ID
  | typeof PROGRAM_FOCUSED_GROUP_ID

export interface PrioritizationGroupMeta {
  id: PrioritizationGroupId
  label: string
  shortLabel: string
  color: string
  sourceGroupIds: StrategyGroupId[]
  weightConfigId: string
  isParent?: boolean
}

const leafGroups: PrioritizationGroupMeta[] = STRATEGY_GROUPS.map((group) => ({
  id: group.id,
  label: group.label,
  shortLabel: group.shortLabel,
  color: group.color,
  sourceGroupIds: [group.id],
  weightConfigId: group.id,
}))

export const PARENT_PRIORITIZATION_GROUPS: PrioritizationGroupMeta[] = [
  {
    id: BUILDING_FOCUSED_GROUP_ID,
    label: 'All Building-Focused (excl. 1 & 2.3)',
    shortLabel: 'All Building-Focused',
    color: '#d9468f',
    // Every leaf except Closure/Merger (1) and Programmatic Investment (2.3).
    sourceGroupIds: STRATEGY_GROUPS.map((g) => g.id).filter(
      (id) => id !== '1' && id !== '2.3',
    ),
    weightConfigId: BUILDING_FOCUSED_GROUP_ID,
    isParent: true,
  },
  {
    id: PROGRAM_FOCUSED_GROUP_ID,
    label: 'All Program-Focused (2.1 + 2.3)',
    shortLabel: 'All Program-Focused',
    color: '#6b4e71',
    sourceGroupIds: ['2.1', '2.3'],
    weightConfigId: PROGRAM_FOCUSED_GROUP_ID,
    isParent: true,
  },
]

export const PRIORITIZATION_GROUPS: PrioritizationGroupMeta[] = [
  ...leafGroups,
  ...PARENT_PRIORITIZATION_GROUPS,
]

export const PRIORITIZATION_GROUP_MAP = Object.fromEntries(
  PRIORITIZATION_GROUPS.map((group) => [group.id, group]),
) as Record<PrioritizationGroupId, PrioritizationGroupMeta>

export function isLeafPrioritizationGroup(
  id: PrioritizationGroupId,
): id is StrategyGroupId {
  return id in STRATEGY_GROUP_MAP
}
