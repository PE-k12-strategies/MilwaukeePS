import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { ChevronDown, Download, Maximize2, Minimize2 } from 'lucide-react'
import {
  PARENT_PRIORITIZATION_GROUPS,
  type PrioritizationGroupId,
} from '../config/prioritizationGroups'
import { STRATEGY_GROUPS, STRATEGY_GROUP_MAP } from '../config/strategyGroups'
import type { DecisionThresholds } from '../config/strategyGroups'
import { downloadAllSchoolsCsv } from '../lib/exportRankedCsv'
import { formatBuildingScore, formatGradeBand } from '../lib/formatters'
import type { ClassificationResult, StrategyGroupId } from '../types/school'
import type { SchoolProperties } from '../types/school'
import { DecisionFlowchart } from './DecisionFlowchart'
import {
  StrategyGroupCharts,
  type ChartValueMode,
} from './StrategyGroupCharts'

interface Step3SummaryProps {
  schools: SchoolProperties[]
  classifications: ClassificationResult[]
  thresholds: DecisionThresholds
  onThresholdsChange: Dispatch<SetStateAction<DecisionThresholds>>
  onSelectSchool: (schoolId: string) => void
  onGoToPrioritize: (groupId: string) => void
}

const ALL_KEY = 'all' as const
const ALL_BAR_COLOR = '#9ca3af'
type SectionKey =
  | StrategyGroupId
  | typeof ALL_KEY
  | PrioritizationGroupId

function labelWithoutId(label: string): string {
  const idx = label.indexOf(':')
  return idx >= 0 ? label.slice(idx + 1).trim() : label
}

function formatGroupStats(
  members: SchoolProperties[],
  total: number,
): string {
  if (members.length === 0) {
    return '0% of schools, — avg. utilization, — bldg score'
  }
  const share = total > 0 ? Math.round((members.length / total) * 100) : 0
  const avgUtil =
    members.reduce((sum, s) => sum + s.utilizationRate, 0) / members.length
  const avgBldg =
    members.reduce((sum, s) => sum + s.buildingScore, 0) / members.length
  return `${share}% of schools, ${Math.round(avgUtil)}% avg. utilization, ${formatBuildingScore(avgBldg)} bldg score`
}

const GROUP_TABLE_COLS = (
  <colgroup>
    <col className="w-[40%]" />
    <col className="w-[15%]" />
    <col className="w-[15%]" />
    <col className="w-[15%]" />
    <col className="w-[15%]" />
  </colgroup>
)

const ALL_TABLE_COLS = (
  <colgroup>
    <col className="w-[32%]" />
    <col className="w-[24%]" />
    <col className="w-[11%]" />
    <col className="w-[11%]" />
    <col className="w-[11%]" />
    <col className="w-[11%]" />
  </colgroup>
)

export function Step3Summary({
  schools,
  classifications,
  thresholds,
  onThresholdsChange,
  onSelectSchool,
  onGoToPrioritize,
}: Step3SummaryProps) {
  const byId = new Map(schools.map((s) => [s.schoolId, s]))
  const groupBySchool = new Map(
    classifications.map((c) => [c.schoolId, c.groupId] as const),
  )

  const grouped = STRATEGY_GROUPS.map((group) => {
    const members = classifications
      .filter((c) => c.groupId === group.id)
      .map((c) => byId.get(c.schoolId))
      .filter((s): s is SchoolProperties => Boolean(s))
      .sort((a, b) => a.schoolName.localeCompare(b.schoolName))
    return { group, members }
  })

  const parentGrouped = PARENT_PRIORITIZATION_GROUPS.map((group) => {
    const sourceSet = new Set(group.sourceGroupIds)
    const members = classifications
      .filter((c) => sourceSet.has(c.groupId))
      .map((c) => byId.get(c.schoolId))
      .filter((s): s is SchoolProperties => Boolean(s))
      .sort((a, b) => a.schoolName.localeCompare(b.schoolName))
    return { group, members }
  })

  const allSchools = useMemo(
    () =>
      [...schools].sort((a, b) => a.schoolName.localeCompare(b.schoolName)),
    [schools],
  )

  const total = schools.length
  const allStats = formatGroupStats(allSchools, total)

  const [flowchartExpanded, setFlowchartExpanded] = useState(true)
  const [chartValueMode, setChartValueMode] = useState<ChartValueMode>('count')
  const [chartsExpanded, setChartsExpanded] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => ({
    ...Object.fromEntries(STRATEGY_GROUPS.map((g) => [g.id, false])),
    ...Object.fromEntries(
      PARENT_PRIORITIZATION_GROUPS.map((g) => [g.id, false]),
    ),
    [ALL_KEY]: false,
  }))
  const [hoverGroupId, setHoverGroupId] = useState<StrategyGroupId | null>(null)
  const [pinnedGroupId, setPinnedGroupId] = useState<StrategyGroupId | null>(null)
  const [outcomeHoverId, setOutcomeHoverId] = useState<StrategyGroupId | null>(null)

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})

  const highlightGroupId =
    outcomeHoverId ?? hoverGroupId ?? pinnedGroupId ?? undefined
  const highlightPaths = useMemo(
    () =>
      highlightGroupId
        ? classifications
            .filter((c) => c.groupId === highlightGroupId)
            .map((c) => c.path)
        : [],
    [classifications, highlightGroupId],
  )

  const toggleSection = (key: SectionKey) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleGroupTable = (groupId: StrategyGroupId) => {
    const nextOpen = !(expanded[groupId] ?? false)
    setExpanded((prev) => ({ ...prev, [groupId]: nextOpen }))
    if (nextOpen) {
      setPinnedGroupId(groupId)
      requestAnimationFrame(() => {
        sectionRefs.current[groupId]?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      })
    } else {
      setPinnedGroupId((pinned) => (pinned === groupId ? null : pinned))
      setHoverGroupId((h) => (h === groupId ? null : h))
    }
  }

  const toggleParentTable = (groupId: PrioritizationGroupId) => {
    const nextOpen = !(expanded[groupId] ?? false)
    setExpanded((prev) => ({ ...prev, [groupId]: nextOpen }))
    if (nextOpen) {
      requestAnimationFrame(() => {
        sectionRefs.current[groupId]?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      })
    }
  }

  const onGroupHover = (groupId: StrategyGroupId | null) => {
    setHoverGroupId(groupId)
  }

  const groupCounts = useMemo(() => {
    const counts: Partial<Record<StrategyGroupId, number>> = {}
    for (const { group, members } of grouped) {
      counts[group.id] = members.length
    }
    return counts
  }, [grouped])

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <h2 className="shrink-0 whitespace-nowrap pt-1 text-xl font-bold text-mps-blue">
          Sort into Strategy Groups
        </h2>
        <div className="w-fit max-w-full rounded-lg border border-mps-blue-border bg-mps-blue-soft px-4 py-2.5 text-sm leading-snug text-mps-text">
          This summary shows how schools are sorted into strategy groups. The
          flowchart and distribution bars explain the sort; demographic charts on
          the left and group tables on the right summarize the results.
        </div>
      </header>

      <DecisionFlowchart
        path={[]}
        groupId={highlightGroupId}
        groupPaths={highlightPaths}
        onOutcomeHover={setOutcomeHoverId}
        thresholds={thresholds}
        onThresholdsChange={onThresholdsChange}
        expanded={flowchartExpanded}
        onExpandedChange={setFlowchartExpanded}
        groupCounts={groupCounts}
        onGroupSelect={toggleGroupTable}
      />

      <div
        className={
          chartsExpanded
            ? 'flex w-full flex-col gap-4'
            : 'grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]'
        }
      >
        {/* Permanent static demographic charts */}
        <div
          className={`flex min-w-0 flex-col gap-3 ${chartsExpanded ? 'w-full' : ''}`}
        >
          <section className="overflow-hidden rounded-lg border border-mps-gray-border bg-white">
            <div className="flex h-12 w-full items-center justify-between gap-3 px-4">
              <h3 className="truncate text-sm font-semibold text-mps-text">
                Demographic Distribution by Strategy Group
              </h3>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setChartsExpanded((v) => !v)}
                  className="inline-flex h-6 items-center gap-1 rounded-md border border-mps-gray-border bg-white px-2 text-[11px] font-semibold text-mps-muted transition hover:border-mps-blue/40 hover:bg-mps-gray hover:text-mps-blue"
                  aria-pressed={chartsExpanded}
                  title={
                    chartsExpanded
                      ? 'Return charts beside school tables'
                      : 'Expand charts to full width above school tables'
                  }
                >
                  {chartsExpanded ? (
                    <>
                      <Minimize2 className="h-3 w-3" />
                      Pop back in
                    </>
                  ) : (
                    <>
                      <Maximize2 className="h-3 w-3" />
                      Pop out
                    </>
                  )}
                </button>
                <div
                  className="inline-flex h-6 items-stretch rounded-md border border-mps-gray-border bg-white p-px"
                  role="group"
                  aria-label="Chart value mode"
                >
                  <button
                    type="button"
                    onClick={() => setChartValueMode('count')}
                    className={`rounded px-2 text-[11px] font-semibold transition-colors ${
                      chartValueMode === 'count'
                        ? 'bg-mps-blue text-white'
                        : 'text-mps-muted hover:text-mps-text'
                    }`}
                    aria-pressed={chartValueMode === 'count'}
                  >
                    Count
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartValueMode('percent')}
                    className={`rounded px-2 text-[11px] font-semibold transition-colors ${
                      chartValueMode === 'percent'
                        ? 'bg-mps-blue text-white'
                        : 'text-mps-muted hover:text-mps-text'
                    }`}
                    aria-pressed={chartValueMode === 'percent'}
                  >
                    Percentage
                  </button>
                </div>
                <span className="text-[11px] text-mps-muted">
                  {total} school{total === 1 ? '' : 's'}
                </span>
              </div>
            </div>
          </section>
          <StrategyGroupCharts
            schools={schools}
            classifications={classifications}
            valueMode={chartValueMode}
            expanded={chartsExpanded}
          />
        </div>

        {/* Expandable group tables */}
        <div className="flex min-w-0 flex-col gap-3">
          {/* ALL SCHOOLS */}
          <section
            ref={(el) => {
              sectionRefs.current[ALL_KEY] = el
            }}
            className="scroll-mt-3 overflow-hidden rounded-lg border border-mps-gray-border bg-white"
          >
            <div
              className={`group flex min-h-[48px] flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors ${
                expanded[ALL_KEY]
                  ? 'bg-[var(--gc)] text-white'
                  : 'bg-white text-mps-text hover:bg-[var(--gc)] hover:text-white'
              }`}
              style={{ ['--gc' as string]: ALL_BAR_COLOR }}
            >
              <button
                type="button"
                onClick={() => toggleSection(ALL_KEY)}
                className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left sm:flex-row sm:items-center sm:gap-2"
                aria-expanded={expanded[ALL_KEY] ?? false}
              >
                <span className="inline-flex items-center gap-2">
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                      expanded[ALL_KEY] ? 'rotate-0' : '-rotate-90'
                    }`}
                  />
                  <h3 className="text-sm font-semibold tracking-wide">ALL SCHOOLS</h3>
                </span>
                <span
                  className={`pl-6 text-[10px] sm:pl-0 ${
                    expanded[ALL_KEY]
                      ? 'text-white/80'
                      : 'text-mps-muted group-hover:text-white/80'
                  }`}
                >
                  {allStats}
                </span>
              </button>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs text-white transition-colors ${
                    expanded[ALL_KEY]
                      ? 'bg-white/20'
                      : 'bg-[var(--gc)] group-hover:bg-white/20'
                  }`}
                >
                  All {total} School{total === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  disabled={total === 0}
                  onClick={() => downloadAllSchoolsCsv(schools, classifications)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-white transition-colors disabled:opacity-40 ${
                    expanded[ALL_KEY]
                      ? 'bg-white/15 hover:bg-white/25'
                      : 'bg-[var(--gc)] group-hover:bg-white/15 group-hover:hover:bg-white/25'
                  }`}
                >
                  <Download className="h-3.5 w-3.5" />
                  Download CSV
                </button>
              </div>
            </div>

            {expanded[ALL_KEY] &&
              (total === 0 ? (
                <p className="px-4 py-6 text-sm text-mps-muted">No schools loaded.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] table-fixed text-left text-sm">
                    {ALL_TABLE_COLS}
                    <thead className="border-b border-mps-gray-border bg-mps-gray text-xs tracking-wide text-mps-muted uppercase">
                      <tr>
                        <th className="px-4 py-2 font-semibold">School</th>
                        <th className="px-4 py-2 font-semibold">Strategy Group</th>
                        <th className="px-4 py-2 font-semibold">Utilization</th>
                        <th className="px-4 py-2 font-semibold">Building Score</th>
                        <th className="px-4 py-2 font-semibold">Programs</th>
                        <th className="px-4 py-2 font-semibold">Grade Band</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allSchools.map((school) => {
                        const groupId = groupBySchool.get(school.schoolId)
                        const meta = groupId
                          ? STRATEGY_GROUP_MAP[groupId]
                          : undefined
                        return (
                          <tr
                            key={school.schoolId}
                            className="cursor-pointer border-b border-mps-gray-border last:border-0 hover:bg-mps-blue-soft"
                            onClick={() => onSelectSchool(school.schoolId)}
                          >
                            <td className="truncate px-4 py-2.5 font-medium text-mps-blue">
                              {school.schoolName}
                            </td>
                            <td className="px-4 py-2.5">
                              {meta ? (
                                <span className="inline-flex max-w-full items-center gap-1.5">
                                  <span
                                    className="h-2 w-2 shrink-0 rounded-sm"
                                    style={{ background: meta.color }}
                                  />
                                  <span className="truncate text-xs font-medium">
                                    {meta.id}: {meta.shortLabel}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-xs text-mps-muted">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 tabular-nums">
                              {school.utilizationRate}%
                            </td>
                            <td className="px-4 py-2.5 tabular-nums">
                              {formatBuildingScore(school.buildingScore)}
                            </td>
                            <td className="px-4 py-2.5 tabular-nums">
                              {school.programmaticOfferings}
                            </td>
                            <td className="px-4 py-2.5">
                              {formatGradeBand(school.gradeBand)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
          </section>

          {/* Parent aggregates */}
          {parentGrouped.map(({ group, members }) => {
            const isOpen = expanded[group.id] ?? false
            const stats = formatGroupStats(members, total)
            return (
              <section
                key={group.id}
                ref={(el) => {
                  sectionRefs.current[group.id] = el
                }}
                className="scroll-mt-3 overflow-hidden rounded-lg border border-mps-gray-border bg-white"
              >
                <div
                  className={`group flex min-h-[48px] flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors ${
                    isOpen
                      ? 'bg-[var(--gc)] text-white'
                      : 'bg-white text-mps-text hover:bg-[var(--gc)] hover:text-white'
                  }`}
                  style={{ ['--gc' as string]: group.color }}
                >
                  <button
                    type="button"
                    onClick={() => toggleParentTable(group.id)}
                    className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left sm:flex-row sm:items-center sm:gap-2"
                    aria-expanded={isOpen}
                  >
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                          isOpen ? 'rotate-0' : '-rotate-90'
                        }`}
                      />
                      <h3 className="min-w-0 truncate text-sm font-semibold tracking-wide">
                        {group.shortLabel}
                      </h3>
                      <span
                        className={`hidden shrink-0 text-xs sm:inline ${
                          isOpen
                            ? 'text-white/75'
                            : 'text-mps-muted group-hover:text-white/75'
                        }`}
                      >
                        ({group.sourceGroupIds.join(' + ')})
                      </span>
                    </span>
                    <span
                      className={`pl-6 text-[10px] sm:pl-0 ${
                        isOpen
                          ? 'text-white/80'
                          : 'text-mps-muted group-hover:text-white/80'
                      }`}
                    >
                      {stats}
                    </span>
                  </button>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs text-white transition-colors ${
                        isOpen
                          ? 'bg-white/20'
                          : 'bg-[var(--gc)] group-hover:bg-white/20'
                      }`}
                    >
                      {members.length} school{members.length === 1 ? '' : 's'}
                    </span>
                    <button
                      type="button"
                      onClick={() => onGoToPrioritize(group.id)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium text-white transition-colors ${
                        isOpen
                          ? 'bg-white/15 hover:bg-white/25'
                          : 'bg-[var(--gc)] group-hover:bg-white/15 group-hover:hover:bg-white/25'
                      }`}
                    >
                      Prioritize →
                    </button>
                  </div>
                </div>

                {isOpen &&
                  (members.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-mps-muted">
                      No schools sorted into these groups with the current dataset.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] table-fixed text-left text-sm">
                        {ALL_TABLE_COLS}
                        <thead className="border-b border-mps-gray-border bg-mps-gray text-xs tracking-wide text-mps-muted uppercase">
                          <tr>
                            <th className="px-4 py-2 font-semibold">School</th>
                            <th className="px-4 py-2 font-semibold">Strategy Group</th>
                            <th className="px-4 py-2 font-semibold">Utilization</th>
                            <th className="px-4 py-2 font-semibold">Building Score</th>
                            <th className="px-4 py-2 font-semibold">Programs</th>
                            <th className="px-4 py-2 font-semibold">Grade Band</th>
                          </tr>
                        </thead>
                        <tbody>
                          {members.map((school) => {
                            const leafId = groupBySchool.get(school.schoolId)
                            const meta = leafId
                              ? STRATEGY_GROUP_MAP[leafId]
                              : undefined
                            return (
                              <tr
                                key={school.schoolId}
                                className="cursor-pointer border-b border-mps-gray-border last:border-0 hover:bg-mps-blue-soft"
                                onClick={() => onSelectSchool(school.schoolId)}
                              >
                                <td className="truncate px-4 py-2.5 font-medium text-mps-blue">
                                  {school.schoolName}
                                </td>
                                <td className="px-4 py-2.5">
                                  {meta ? (
                                    <span className="inline-flex max-w-full items-center gap-1.5">
                                      <span
                                        className="h-2 w-2 shrink-0 rounded-sm"
                                        style={{ background: meta.color }}
                                      />
                                      <span className="truncate text-xs font-medium">
                                        {meta.id}: {meta.shortLabel}
                                      </span>
                                    </span>
                                  ) : (
                                    <span className="text-xs text-mps-muted">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 tabular-nums">
                                  {school.utilizationRate}%
                                </td>
                                <td className="px-4 py-2.5 tabular-nums">
                                  {formatBuildingScore(school.buildingScore)}
                                </td>
                                <td className="px-4 py-2.5 tabular-nums">
                                  {school.programmaticOfferings}
                                </td>
                                <td className="px-4 py-2.5">
                                  {formatGradeBand(school.gradeBand)}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  ))}
              </section>
            )
          })}

          {/* Leaf strategy groups */}
          {grouped.map(({ group, members }) => {
            const isOpen = expanded[group.id] ?? false
            const stats = formatGroupStats(members, total)
            return (
              <section
                key={group.id}
                ref={(el) => {
                  sectionRefs.current[group.id] = el
                }}
                className="scroll-mt-3 overflow-hidden rounded-lg border border-mps-gray-border bg-white"
                onMouseEnter={() => onGroupHover(group.id)}
                onMouseLeave={() => onGroupHover(null)}
              >
                <div
                  className={`group flex min-h-[48px] flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors ${
                    isOpen
                      ? 'bg-[var(--gc)] text-white'
                      : 'bg-white text-mps-text hover:bg-[var(--gc)] hover:text-white'
                  }`}
                  style={{ ['--gc' as string]: group.color }}
                >
                  <button
                    type="button"
                    onClick={() => toggleGroupTable(group.id)}
                    className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left sm:flex-row sm:items-center sm:gap-2"
                    aria-expanded={isOpen}
                  >
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                          isOpen ? 'rotate-0' : '-rotate-90'
                        }`}
                      />
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold text-white transition-colors ${
                          isOpen
                            ? 'bg-white/20'
                            : 'bg-[var(--gc)] group-hover:bg-white/20'
                        }`}
                      >
                        {group.id}
                      </span>
                      <h3 className="min-w-0 truncate text-sm font-semibold tracking-wide">
                        {labelWithoutId(group.label)}
                      </h3>
                    </span>
                    <span
                      className={`pl-6 text-[10px] sm:pl-0 ${
                        isOpen
                          ? 'text-white/80'
                          : 'text-mps-muted group-hover:text-white/80'
                      }`}
                    >
                      {stats}
                    </span>
                  </button>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs text-white transition-colors ${
                        isOpen
                          ? 'bg-white/20'
                          : 'bg-[var(--gc)] group-hover:bg-white/20'
                      }`}
                    >
                      {members.length} school{members.length === 1 ? '' : 's'}
                    </span>
                    <button
                      type="button"
                      onClick={() => onGoToPrioritize(group.id)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium text-white transition-colors ${
                        isOpen
                          ? 'bg-white/15 hover:bg-white/25'
                          : 'bg-[var(--gc)] group-hover:bg-white/15 group-hover:hover:bg-white/25'
                      }`}
                    >
                      Prioritize →
                    </button>
                  </div>
                </div>

                {isOpen &&
                  (members.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-mps-muted">
                      No schools sorted into this group with the current dataset.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] table-fixed text-left text-sm">
                        {GROUP_TABLE_COLS}
                        <thead className="border-b border-mps-gray-border bg-mps-gray text-xs tracking-wide text-mps-muted uppercase">
                          <tr>
                            <th className="px-4 py-2 font-semibold">School</th>
                            <th className="px-4 py-2 font-semibold">Utilization</th>
                            <th className="px-4 py-2 font-semibold">Building Score</th>
                            <th className="px-4 py-2 font-semibold">Programs</th>
                            <th className="px-4 py-2 font-semibold">Grade Band</th>
                          </tr>
                        </thead>
                        <tbody>
                          {members.map((school) => (
                            <tr
                              key={school.schoolId}
                              className="cursor-pointer border-b border-mps-gray-border last:border-0 hover:bg-mps-blue-soft"
                              onClick={() => onSelectSchool(school.schoolId)}
                            >
                              <td className="truncate px-4 py-2.5 font-medium text-mps-blue">
                                {school.schoolName}
                              </td>
                              <td className="px-4 py-2.5 tabular-nums">
                                {school.utilizationRate}%
                              </td>
                              <td className="px-4 py-2.5 tabular-nums">
                                {formatBuildingScore(school.buildingScore)}
                              </td>
                              <td className="px-4 py-2.5 tabular-nums">
                                {school.programmaticOfferings}
                              </td>
                              <td className="px-4 py-2.5">
                                {formatGradeBand(school.gradeBand)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
