import { useMemo, useState, useEffect, type Dispatch, type SetStateAction } from 'react'
import {
  ArrowDown,
  ArrowUp,
  CircleHelp,
  Download,
  Maximize2,
  Minimize2,
  RotateCcw,
} from 'lucide-react'
import { GROUP_WEIGHT_CONFIGS } from '../config/prioritizationWeights'
import { type DecisionThresholds } from '../config/strategyGroups'
import {
  PRIORITIZATION_GROUPS,
  PRIORITIZATION_GROUP_MAP,
  isLeafPrioritizationGroup,
  type PrioritizationGroupId,
} from '../config/prioritizationGroups'
import {
  downloadAllRankedGroupsCsv,
  downloadRankedGroupCsv,
} from '../lib/exportRankedCsv'
import { formatBuildingScore } from '../lib/formatters'
import { rankSchools, type RankedSchool } from '../lib/prioritization'
import type { SharedScenario } from '../lib/scenarioShare'
import type {
  ClassificationResult,
  PrioritizationCriterion,
  SchoolProperties,
  StrategyGroupId,
} from '../types/school'
import { DecisionFlowchart } from './DecisionFlowchart'
import { WeightSlider } from './WeightSlider'

const PERCENT_PROPERTIES = new Set<keyof SchoolProperties>([
  'utilizationRate',
  'projectedUtilization10yr',
  'enrollmentGrowth5yrPct',
  'studentsInAttendanceArea',
  'economicDisadvantageRate',
  'acCoverage',
])

type SortKey = 'rank' | 'school' | 'score' | string
type SortDir = 'asc' | 'desc'

function formatCriterionRaw(
  school: SchoolProperties,
  criterion: PrioritizationCriterion,
): string {
  const raw = school[criterion.property]
  if (raw === undefined || raw === null || raw === '') return '—'
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No'
  if (typeof raw === 'number') {
    if (criterion.property === 'buildingScore') return formatBuildingScore(raw)
    if (
      criterion.property === 'specialtyProgramCount' ||
      criterion.property === 'specialEdProgramCount'
    ) {
      return String(Math.round(raw))
    }
    if (PERCENT_PROPERTIES.has(criterion.property)) {
      return `${raw.toFixed(1)}%`
    }
    return Number.isInteger(raw) ? String(raw) : raw.toFixed(1)
  }
  return String(raw)
}

function criterionSortValue(
  school: SchoolProperties,
  criterion: PrioritizationCriterion,
): number | string {
  const raw = school[criterion.property]
  if (typeof raw === 'boolean') return raw ? 1 : 0
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (raw === undefined || raw === null || raw === '') return Number.NEGATIVE_INFINITY
  return String(raw)
}

function compareRanked(
  a: RankedSchool,
  b: RankedSchool,
  sortKey: SortKey,
  sortDir: SortDir,
  criteriaByKey: Map<string, PrioritizationCriterion>,
): number {
  const dir = sortDir === 'asc' ? 1 : -1
  let cmp = 0
  if (sortKey === 'rank') cmp = a.rank - b.rank
  else if (sortKey === 'school') {
    cmp = a.school.schoolName.localeCompare(b.school.schoolName)
  } else if (sortKey === 'score') cmp = a.score - b.score
  else {
    const criterion = criteriaByKey.get(sortKey)
    if (criterion) {
      const av = criterionSortValue(a.school, criterion)
      const bv = criterionSortValue(b.school, criterion)
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
      else cmp = String(av).localeCompare(String(bv))
    }
  }
  if (cmp !== 0) return cmp * dir
  return a.rank - b.rank
}

interface Step4PrioritizeProps {
  schools: SchoolProperties[]
  classifications: ClassificationResult[]
  thresholds: DecisionThresholds
  onThresholdsChange: Dispatch<SetStateAction<DecisionThresholds>>
  weightsByGroup: Record<string, Record<string, number>>
  onWeightsByGroupChange: Dispatch<
    SetStateAction<Record<string, Record<string, number>>>
  >
  initialGroupId?: PrioritizationGroupId
  initialScenario?: SharedScenario | null
  selectedSchoolId: string | null
  onSelectSchool: (schoolId: string) => void
  onActiveGroupChange?: (groupId: PrioritizationGroupId) => void
}

export function Step4Prioritize({
  schools,
  classifications,
  thresholds,
  onThresholdsChange,
  weightsByGroup,
  onWeightsByGroupChange,
  initialGroupId,
  initialScenario = null,
  selectedSchoolId,
  onSelectSchool,
  onActiveGroupChange,
}: Step4PrioritizeProps) {
  const [groupId, setGroupId] = useState<PrioritizationGroupId>(
    initialScenario?.groupId ?? initialGroupId ?? '1',
  )
  const [outcomeHoverId, setOutcomeHoverId] = useState<StrategyGroupId | null>(
    null,
  )
  const [allGroupsExportNotice, setAllGroupsExportNotice] = useState<
    string | null
  >(null)
  const [tableExpanded, setTableExpanded] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('rank')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  useEffect(() => {
    if (initialGroupId) setGroupId(initialGroupId)
  }, [initialGroupId])

  useEffect(() => {
    setAllGroupsExportNotice(null)
    setTableExpanded(false)
    setSortKey('rank')
    setSortDir('asc')
  }, [groupId])

  useEffect(() => {
    onActiveGroupChange?.(groupId)
  }, [groupId, onActiveGroupChange])

  useEffect(() => {
    if (!initialScenario) return
    setGroupId(initialScenario.groupId)
  }, [initialScenario])

  const selectGroup = (id: PrioritizationGroupId) => {
    setGroupId(id)
  }

  const groupMeta = PRIORITIZATION_GROUP_MAP[groupId]
  const config = GROUP_WEIGHT_CONFIGS[groupMeta.weightConfigId]
  const weights = weightsByGroup[groupId] ?? config.defaultWeights
  const sourceGroupSet = useMemo(
    () => new Set<StrategyGroupId>(groupMeta.sourceGroupIds),
    [groupMeta.sourceGroupIds],
  )

  const activeCriteria = useMemo(
    () => config.criteria.filter((c) => (weights[c.key] ?? 0) > 0),
    [config.criteria, weights],
  )

  const criteriaByKey = useMemo(
    () => new Map(activeCriteria.map((c) => [c.key, c])),
    [activeCriteria],
  )

  useEffect(() => {
    if (
      sortKey !== 'rank' &&
      sortKey !== 'school' &&
      sortKey !== 'score' &&
      !criteriaByKey.has(sortKey)
    ) {
      setSortKey('rank')
      setSortDir('asc')
    }
  }, [sortKey, criteriaByKey])

  const selectedLeafClassification = classifications.find(
    (c) => c.schoolId === selectedSchoolId && sourceGroupSet.has(c.groupId),
  )
  const highlightGroupId =
    outcomeHoverId ??
    (isLeafPrioritizationGroup(groupId)
      ? groupId
      : selectedLeafClassification?.groupId)
  const highlightPaths = useMemo(
    () =>
      classifications
        .filter((c) =>
          outcomeHoverId
            ? c.groupId === outcomeHoverId
            : sourceGroupSet.has(c.groupId),
        )
        .map((c) => c.path),
    [classifications, outcomeHoverId, sourceGroupSet],
  )

  const groupSchools = useMemo(() => {
    const ids = new Set(
      classifications
        .filter((c) => sourceGroupSet.has(c.groupId))
        .map((c) => c.schoolId),
    )
    return schools.filter((s) => ids.has(s.schoolId))
  }, [schools, classifications, sourceGroupSet])

  const ranked = useMemo(
    () => rankSchools(groupSchools, config.criteria, weights),
    [groupSchools, config.criteria, weights],
  )

  const displayRows = useMemo(() => {
    return [...ranked].sort((a, b) =>
      compareRanked(a, b, sortKey, sortDir, criteriaByKey),
    )
  }, [ranked, sortKey, sortDir, criteriaByKey])

  useEffect(() => {
    if (ranked.length === 0) return
    const inGroup = ranked.some((r) => r.school.schoolId === selectedSchoolId)
    if (!inGroup) {
      onSelectSchool(ranked[0].school.schoolId)
    }
  }, [groupId, ranked, selectedSchoolId, onSelectSchool])

  const selectedSchool = schools.find((s) => s.schoolId === selectedSchoolId)

  const setWeight = (key: string, value: number) => {
    onWeightsByGroupChange((prev) => ({
      ...prev,
      [groupId]: { ...prev[groupId], [key]: value },
    }))
  }

  const resetWeightsToDefaults = () => {
    onWeightsByGroupChange((prev) => ({
      ...prev,
      [groupId]: { ...config.defaultWeights },
    }))
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir(key === 'school' ? 'asc' : key === 'rank' ? 'asc' : 'desc')
  }

  const SortHeader = ({
    label,
    columnKey,
    className = '',
  }: {
    label: string
    columnKey: SortKey
    className?: string
  }) => {
    const active = sortKey === columnKey
    return (
      <th className={`px-3 py-2 align-bottom font-semibold ${className}`}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            toggleSort(columnKey)
          }}
          className="inline-flex w-max max-w-[10.5rem] items-start gap-1 text-left uppercase tracking-wide hover:text-mps-text"
        >
          <span className="min-w-0 whitespace-normal break-words leading-snug">
            {label}
          </span>
          {active ? (
            sortDir === 'asc' ? (
              <ArrowUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mps-blue" />
            ) : (
              <ArrowDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mps-blue" />
            )
          ) : (
            <span className="mt-0.5 inline-block h-3.5 w-3.5 shrink-0 opacity-0" />
          )}
        </button>
      </th>
    )
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <h2 className="shrink-0 whitespace-nowrap pt-1 text-xl font-bold text-mps-blue">
            Prioritize within Strategy Groups
          </h2>
          <div className="w-fit max-w-full rounded-lg border border-mps-blue-border bg-mps-blue-soft px-4 py-2.5 text-sm leading-snug text-mps-text">
            This section allows you to customize how schools are prioritized within each
            strategy group. Select a strategy group using the tabs below, then adjust the
            weight sliders to rank schools according to your priorities.
          </div>
        </div>
        {initialScenario && (
          <div className="mt-3 rounded-lg border border-mps-gray-border bg-mps-gray px-4 py-3 text-sm text-mps-text">
            <span className="font-semibold">Loaded shared scenario:</span>{' '}
            {initialScenario.name}
            {initialScenario.description ? (
              <span className="mt-1 block text-mps-muted">
                {initialScenario.description}
              </span>
            ) : null}
          </div>
        )}
      </header>

      <div className="flex w-full flex-wrap items-center gap-1.5">
        {PRIORITIZATION_GROUPS.map((group) => {
          const sourceIds = new Set(group.sourceGroupIds)
          const count = classifications.filter((c) =>
            sourceIds.has(c.groupId),
          ).length
          const active = groupId === group.id
          return (
            <button
              key={group.id}
              type="button"
              title={`${group.label} (${count})`}
              onClick={() => selectGroup(group.id)}
              className={`whitespace-nowrap rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition sm:text-xs ${
                active
                  ? 'border-transparent text-white'
                  : 'border-mps-gray-border bg-white text-mps-muted hover:border-mps-blue/40 hover:text-mps-text'
              }`}
              style={active ? { background: group.color } : undefined}
            >
              {group.isParent ? group.shortLabel : `${group.id} · ${group.shortLabel}`}
              <span className="ml-1 opacity-70">({count})</span>
            </button>
          )
        })}
      </div>

      <DecisionFlowchart
        path={
          outcomeHoverId
            ? []
            : selectedLeafClassification?.path ?? []
        }
        groupId={highlightGroupId}
        schoolName={
          !outcomeHoverId && selectedLeafClassification
            ? selectedSchool?.schoolName
            : undefined
        }
        groupPaths={highlightPaths}
        onOutcomeHover={setOutcomeHoverId}
        thresholds={thresholds}
        onThresholdsChange={onThresholdsChange}
      />

      <div
        className={
          tableExpanded
            ? 'flex w-full flex-col-reverse gap-4'
            : 'grid w-full gap-4 lg:grid-cols-[2fr_3fr] lg:items-stretch'
        }
      >
        <div
          className={`flex min-h-0 flex-col overflow-hidden rounded-lg border border-mps-gray-border bg-white ${
            tableExpanded
              ? 'w-full'
              : 'lg:h-full lg:max-h-[min(75vh,800px)]'
          }`}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-mps-gray-border px-5 py-4">
            <h3 className="text-lg font-bold text-mps-text">{config.title}</h3>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={resetWeightsToDefaults}
                className="inline-flex items-center gap-1.5 rounded-md border border-mps-gray-border bg-white px-2.5 py-1 text-xs font-semibold text-mps-muted transition hover:border-mps-blue/40 hover:bg-mps-gray hover:text-mps-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-mps-blue"
              >
                <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                <span className="text-left leading-tight">
                  Reset to
                  <br />
                  default weights
                </span>
              </button>
              <div className="group relative shrink-0">
                <button
                  type="button"
                  className="rounded-full p-0.5 text-mps-muted transition hover:bg-mps-gray hover:text-mps-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-mps-blue"
                  aria-label="How priority scores are calculated"
                >
                  <CircleHelp className="h-5 w-5" />
                </button>
                <div
                  role="tooltip"
                  className="pointer-events-none absolute top-full right-0 z-30 mt-2 hidden w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-mps-blue-border bg-mps-blue-soft px-4 py-3 text-left shadow-lg group-hover:block group-focus-within:block"
                >
                  <p className="text-sm font-bold text-mps-text">
                    How Priority Scores Are Calculated:
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-mps-text">
                    Each school receives a priority score (0-100) based on weighted
                    criteria. For example, if a school has:
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-mps-text">
                    <li>
                      Utilization Rate: 75% (normalized to 60/100) × Weight: 2.5 = 15
                      points
                    </li>
                    <li>
                      Building Condition: Poor (normalized to 80/100) × Weight: 3.0 = 24
                      points
                    </li>
                    <li>
                      Economic Status: High need (normalized to 70/100) × Weight: 2.0 = 14
                      points
                    </li>
                    <li>Other factors: weight 2.5 = 12 points</li>
                  </ul>
                  <p className="mt-2 text-xs font-bold text-mps-text">
                    Final Priority Score: (15 + 24 + 14 + 12) = 65/100
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
              {config.criteria.map((criterion) => (
                <WeightSlider
                  key={criterion.key}
                  label={
                    criterion.property === 'overutilizedMpsWithin1Mile'
                      ? `${criterion.label} (within 1 mile)`
                      : criterion.property === 'nonMpsSchoolsWithin1Mile'
                        ? `${criterion.label} (within 1 mile)`
                        : criterion.label
                  }
                  description={
                    criterion.property === 'overutilizedMpsWithin1Mile'
                      ? 'Higher weight prioritizes schools within 1 mile of an overutilized MPS school'
                      : criterion.description
                  }
                  value={weights[criterion.key] ?? 0}
                  onChange={(v) => setWeight(criterion.key, v)}
                />
              ))}
            </div>
          </div>
        </div>

        <section className="flex min-h-0 w-full flex-col overflow-hidden rounded-lg border border-mps-gray-border bg-white lg:h-full lg:max-h-[min(75vh,800px)]">
          <div
            className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-3 text-white"
            style={{ background: groupMeta.color }}
          >
            <div>
              <h3 className="text-sm font-semibold">
                Ranked Schools · {groupMeta.shortLabel}
              </h3>
              <p className="text-xs text-white/75">
                {ranked.length} school{ranked.length === 1 ? '' : 's'} · higher score =
                higher priority
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setTableExpanded((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-2.5 py-1.5 text-xs font-semibold hover:bg-white/25"
                aria-pressed={tableExpanded}
                title={
                  tableExpanded
                    ? 'Return table beside weights'
                    : 'Expand table to full width above weights'
                }
              >
                {tableExpanded ? (
                  <>
                    <Minimize2 className="h-3.5 w-3.5" />
                    Pop back in
                  </>
                ) : (
                  <>
                    <Maximize2 className="h-3.5 w-3.5" />
                    Pop out
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => downloadRankedGroupCsv(groupId, ranked)}
                disabled={ranked.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-2.5 py-1.5 text-xs font-semibold hover:bg-white/25 disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" />
                This group
              </button>
              <button
                type="button"
                onClick={() => {
                  downloadAllRankedGroupsCsv(
                    schools,
                    classifications,
                    weightsByGroup,
                  )
                  if (groupMeta.isParent) {
                    const leafPair =
                      groupId === 'all-building-focused' ? '2.2' : '2.3'
                    setAllGroupsExportNotice(
                      `This “All groups” export ranks schools in the 2.1 and ${leafPair} groups as they are weighted within those individual strategy groups, not as they are weighted in this current combined view.`,
                    )
                  } else {
                    setAllGroupsExportNotice(null)
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-2.5 py-1.5 text-xs font-semibold hover:bg-white/25"
              >
                <Download className="h-3.5 w-3.5" />
                All groups
              </button>
            </div>
            {allGroupsExportNotice && (
              <p className="basis-full text-[11px] leading-snug text-white/85">
                {allGroupsExportNotice}
              </p>
            )}
          </div>

          {ranked.length === 0 ? (
            <p className="px-4 py-8 text-sm text-mps-muted">
              No schools in this strategy group.
            </p>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-max min-w-full text-left text-sm">
                <thead className="sticky top-0 border-b border-mps-gray-border bg-mps-gray text-xs text-mps-muted">
                  <tr>
                    <SortHeader label="Rank" columnKey="rank" />
                    <SortHeader label="School" columnKey="school" />
                    <SortHeader label="Score" columnKey="score" />
                    {activeCriteria.map((criterion) => (
                      <SortHeader
                        key={criterion.key}
                        label={
                          criterion.property === 'overutilizedMpsWithin1Mile' ||
                          criterion.property === 'nonMpsSchoolsWithin1Mile'
                            ? `${criterion.label} (within 1 mile)`
                            : criterion.label
                        }
                        columnKey={criterion.key}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map(({ school, score, rank }) => {
                    const active = school.schoolId === selectedSchoolId
                    return (
                      <tr
                        key={school.schoolId}
                        onClick={() => onSelectSchool(school.schoolId)}
                        className={`cursor-pointer border-b border-mps-gray-border last:border-0 ${
                          active ? 'bg-mps-blue-soft' : 'hover:bg-mps-blue-soft/60'
                        }`}
                      >
                        <td className="px-3 py-2.5 font-semibold tabular-nums">
                          {rank}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="font-medium">{school.schoolName}</div>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">
                          {(score * 100).toFixed(1)}
                        </td>
                        {activeCriteria.map((criterion) => (
                          <td
                            key={criterion.key}
                            className="px-3 py-2.5 whitespace-nowrap tabular-nums"
                          >
                            {formatCriterionRaw(school, criterion)}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
