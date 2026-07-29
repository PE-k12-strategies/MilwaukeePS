import { GROUP_WEIGHT_CONFIGS } from '../config/prioritizationWeights'
import type { PrioritizationGroupId } from '../config/prioritizationGroups'
import {
  mergeThresholds,
  type DecisionThresholds,
} from '../config/strategyGroups'

export const SCENARIO_QUERY_KEY = 'scenario'

export interface SharedScenarioV1 {
  v: 1
  name: string
  description?: string
  groupId: PrioritizationGroupId
  weights: Record<string, Record<string, number>>
  displaced?: Record<string, boolean>
  factors?: Record<string, string>
  /** Optional decision-tree thresholds; omitted on older share links → defaults */
  thresholds?: DecisionThresholds
}

export type SharedScenario = SharedScenarioV1

const GROUP_IDS = Object.keys(GROUP_WEIGHT_CONFIGS)

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(encoded: string): Uint8Array {
  const padded =
    encoded.replace(/-/g, '+').replace(/_/g, '/') +
    '==='.slice((encoded.length + 3) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function encodeScenario(scenario: SharedScenario): string {
  const json = JSON.stringify(scenario)
  return toBase64Url(new TextEncoder().encode(json))
}

export function decodeScenario(encoded: string): SharedScenario | null {
  try {
    const json = new TextDecoder().decode(fromBase64Url(encoded))
    const data = JSON.parse(json) as SharedScenario
    if (!data || data.v !== 1 || typeof data.name !== 'string' || !data.weights) {
      return null
    }
    if (!GROUP_IDS.includes(data.groupId)) return null
    if (data.thresholds) {
      data.thresholds = mergeThresholds(data.thresholds)
    }
    return data
  } catch {
    return null
  }
}

/** Read scenario token from ?scenario= or #scenario= */
export function readScenarioFromLocation(
  location: Location = window.location,
): SharedScenario | null {
  const fromQuery = new URLSearchParams(location.search).get(SCENARIO_QUERY_KEY)
  if (fromQuery) return decodeScenario(fromQuery)

  const hash = location.hash.replace(/^#/, '')
  if (!hash) return null
  const hashParams = new URLSearchParams(
    hash.includes('=') ? hash : `scenario=${hash}`,
  )
  const fromHash = hashParams.get(SCENARIO_QUERY_KEY)
  return fromHash ? decodeScenario(fromHash) : null
}

export function buildScenarioShareUrl(scenario: SharedScenario): string {
  const token = encodeScenario(scenario)
  const url = new URL(window.location.href)
  url.searchParams.set(SCENARIO_QUERY_KEY, token)
  // Prefer clean path without leftover hash conflict
  url.hash = ''
  return url.toString()
}

export function defaultWeightsByGroup(): Record<string, Record<string, number>> {
  return Object.fromEntries(
    Object.entries(GROUP_WEIGHT_CONFIGS).map(([id, cfg]) => [
      id,
      { ...cfg.defaultWeights },
    ]),
  )
}

/** Merge shared weights onto defaults so missing keys stay valid.
 *  Legacy share links stored 0–100 percentages; convert those to the 0–10 scale.
 */
export function mergeSharedWeights(
  shared?: Record<string, Record<string, number>>,
): Record<string, Record<string, number>> {
  const base = defaultWeightsByGroup()
  if (!shared) return base
  for (const [groupId, weights] of Object.entries(shared)) {
    if (!(groupId in base) || !weights) continue
    const legacyScale = Object.values(weights).some((w) => w > 10)
    const normalized = Object.fromEntries(
      Object.entries(weights).map(([key, w]) => [
        key,
        legacyScale ? w / 10 : w,
      ]),
    )
    base[groupId] = { ...base[groupId], ...normalized }
  }
  return base
}
