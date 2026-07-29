import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  applyThresholdPatch,
  DEFAULT_THRESHOLDS,
  formatMilesPhrase,
  thresholdsEqual,
  type DecisionThresholds,
} from '../config/strategyGroups'
import type { DecisionStep, StrategyGroupId } from '../types/school'
import { STRATEGY_GROUP_MAP } from '../config/strategyGroups'

interface DecisionFlowchartProps {
  /** Selected school decision path (strong highlight) */
  path: DecisionStep[]
  groupId?: StrategyGroupId
  schoolName?: string
  /** All paths for schools currently in the active strategy group */
  groupPaths?: DecisionStep[][]
  /** Controlled expand state (defaults collapsed when uncontrolled) */
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  /** Hover on a strategy-group outcome bubble (overrides groupId while set) */
  onOutcomeHover?: (groupId: StrategyGroupId | null) => void
  thresholds: DecisionThresholds
  /** Prefer SetStateAction so edits can patch from latest App state (Sort ↔ Prioritize sync). */
  onThresholdsChange: Dispatch<SetStateAction<DecisionThresholds>>
  /**
   * PDF/screenshot capture: avoid SVG foreignObject (html2canvas mangles FO fonts)
   * and draw questions/labels as plain SVG text instead.
   */
  captureMode?: boolean
  /** School counts per strategy group — drawn as bars flush right of outcome pills. */
  groupCounts?: Partial<Record<StrategyGroupId, number>>
  /** Click a distribution bar (or its outcome) to open that group’s table. */
  onGroupSelect?: (groupId: StrategyGroupId) => void
}

const NODE_W = Math.round(172 * 1.25) // was 172
const NODE_H = 60
const BTN_W = 40
const BTN_H = 16
const OUT_W = 188
const OUT_H = 30
/** Horizontal gap between decision-card columns (unchanged when cards widen). */
const COL_GAP = 52
/** Gap between col2 cards and the outcomes column (unchanged). */
const OUT_GAP = 80

type Pt = { x: number; y: number }

type DecisionNode = {
  id: string
  x: number
  y: number
}

type Outcome = {
  id: StrategyGroupId
  label: string
  x: number
  y: number
}

const OUTCOME_ORDER: StrategyGroupId[] = ['1', '2.1', '2.2', '2.3', '2.4', '3', '4']
const OUT_FIRST_Y = 20
const OUT_LAST_Y = 352
const OUT_STEP =
  OUTCOME_ORDER.length > 1
    ? (OUT_LAST_Y - OUT_FIRST_Y) / (OUTCOME_ORDER.length - 1)
    : 0

/** Left two columns: 4 evenly spaced rows matching the outcomes column height. */
const COL_ROWS = 4
const COL_SPAN_TOP = OUT_FIRST_Y
const COL_SPAN_BOTTOM = OUT_LAST_Y + OUT_H
const COL_Y = (row: number) =>
  COL_SPAN_TOP +
  (row * (COL_SPAN_BOTTOM - COL_SPAN_TOP - NODE_H)) / (COL_ROWS - 1)

const COL0_X = 12
const COL1_X = COL0_X + NODE_W + COL_GAP
const COL2_X = COL1_X + NODE_W + COL_GAP
const OUT_X = COL2_X + NODE_W + OUT_GAP
/** Gap + bar track + count label to the right of strategy-group outcomes. */
const BAR_GAP = 10
const BAR_MAX_W = 220
const BAR_H = OUT_H
const COUNT_LABEL_W = 72
const VIEW_W = OUT_X + OUT_W + BAR_GAP + BAR_MAX_W + COUNT_LABEL_W + 14
const VIEW_H = 400
const BAR_X = OUT_X + OUT_W + BAR_GAP

/**
 * Col0 utilization / capacity · Col1 growth / building / site
 * Col2 near-underutilized + low-building programs · Col3 outcomes
 *
 * Paired rows (vertically aligned):
 *  util_100 ↔ building_score
 *  proj_100 ↔ programs_hi_bldg
 *  nearby_cap ↔ site_exp
 */
const NODES: DecisionNode[] = [
  { id: 'util_50', x: COL0_X, y: COL_Y(0) },
  { id: 'util_100', x: COL0_X, y: COL_Y(1) },
  { id: 'proj_100', x: COL0_X, y: COL_Y(2) },
  { id: 'nearby_cap', x: COL0_X, y: COL_Y(3) },
  { id: 'enroll_growth', x: COL1_X, y: COL_Y(0) },
  { id: 'building_score', x: COL1_X, y: COL_Y(1) },
  { id: 'programs_hi_bldg', x: COL1_X, y: COL_Y(2) },
  { id: 'site_exp', x: COL1_X, y: COL_Y(3) },
  { id: 'near_underutil', x: COL2_X, y: COL_Y(0) },
  { id: 'programs_lo_bldg', x: COL2_X, y: COL_Y(1) },
]

const OUTCOMES: Outcome[] = OUTCOME_ORDER.map((id, i) => ({
  id,
  label: STRATEGY_GROUP_MAP[id].label,
  x: OUT_X,
  y: OUT_FIRST_Y + i * OUT_STEP,
}))

function formatThresholdDisplay(
  key: keyof DecisionThresholds,
  value: number,
): string {
  if (key === 'buildingScoreCutoff') {
    return Number.isInteger(value) ? value.toFixed(1) : String(value)
  }
  if (
    key === 'programmaticOfferingsCutoffHi' ||
    key === 'programmaticOfferingsCutoffLo'
  ) {
    return String(Math.round(value))
  }
  if (key === 'nearbyCapacityMiles' || key === 'nearUnderutilizedMiles') {
    const n = Math.round(value * 10) / 10
    return Number.isInteger(n) ? String(n) : n.toFixed(1)
  }
  return String(value)
}

/** Plain question copy for SVG capture (no HTML inputs). */
function nodeQuestionPlain(
  nodeId: string,
  thresholds: DecisionThresholds,
): string {
  switch (nodeId) {
    case 'util_50':
      return `Utilization rate above ${formatThresholdDisplay('utilizationLow', thresholds.utilizationLow)}%?`
    case 'util_100':
      return `Utilization rate above ${formatThresholdDisplay('utilizationHigh', thresholds.utilizationHigh)}%?`
    case 'proj_100':
      return `10-year projected enrollment still above ${formatThresholdDisplay('utilizationHigh', thresholds.utilizationHigh)}% utilization rate?`
    case 'nearby_cap':
      return `Schools within ${formatMilesPhrase(thresholds.nearbyCapacityMiles)} have available student capacity?`
    case 'enroll_growth':
      return `Enrollment Growth of at least ${formatThresholdDisplay('enrollmentGrowthMin', thresholds.enrollmentGrowthMin)}% seen over last 5 years?`
    case 'building_score':
      return `Composite Building Score of ${formatThresholdDisplay('buildingScoreCutoff', thresholds.buildingScoreCutoff)} or above?`
    case 'programs_hi_bldg':
      return `${formatThresholdDisplay('programmaticOfferingsCutoffHi', thresholds.programmaticOfferingsCutoffHi)} or more programmatic offerings?`
    case 'programs_lo_bldg':
      return `${formatThresholdDisplay('programmaticOfferingsCutoffLo', thresholds.programmaticOfferingsCutoffLo)} or more programmatic offerings?`
    case 'site_exp':
      return 'Site capacity for campus expansion?'
    case 'near_underutil':
      return `Within ${formatMilesPhrase(thresholds.nearUnderutilizedMiles)} of another underutilized school?`
    default:
      return ''
  }
}

/** Greedy word wrap for SVG text (approx. char width). */
function wrapSvgLines(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']
  const lines: string[] = []
  let current = words[0]
  for (let i = 1; i < words.length; i++) {
    const next = `${current} ${words[i]}`
    if (next.length <= maxChars) {
      current = next
    } else {
      lines.push(current)
      current = words[i]
    }
  }
  lines.push(current)
  return lines
}

function EditableThreshold({
  value,
  formatKey,
  suffix = '',
  ariaLabel,
  onCommit,
}: {
  value: number
  formatKey: keyof DecisionThresholds
  suffix?: string
  ariaLabel: string
  onCommit: (n: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(formatThresholdDisplay(formatKey, value))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setDraft(formatThresholdDisplay(formatKey, value))
  }, [value, formatKey, editing])

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commit = () => {
    const parsed = Number(String(draft).replace(/%/g, '').trim())
    if (Number.isFinite(parsed)) onCommit(parsed)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={draft}
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            setDraft(formatThresholdDisplay(formatKey, value))
            setEditing(false)
          }
        }}
        className="inline-block w-12 rounded border border-mps-blue bg-white px-0.5 py-0 text-center text-[11px] font-bold text-mps-blue tabular-nums outline-none"
      />
    )
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title="Click to edit threshold"
      onClick={(e) => {
        e.stopPropagation()
        setEditing(true)
      }}
      onMouseDown={(e) => e.stopPropagation()}
      className="inline rounded bg-mps-blue-soft px-0.5 font-bold text-mps-blue underline decoration-dotted underline-offset-2 hover:bg-mps-blue-border/40"
    >
      {formatThresholdDisplay(formatKey, value)}
      {suffix}
    </button>
  )
}

function NodeQuestion({
  nodeId,
  thresholds,
  onThresholdsChange,
}: {
  nodeId: string
  thresholds: DecisionThresholds
  onThresholdsChange: Dispatch<SetStateAction<DecisionThresholds>>
}): ReactNode {
  const patch = (key: keyof DecisionThresholds, raw: number) => {
    onThresholdsChange((prev) => applyThresholdPatch(prev, key, raw))
  }

  switch (nodeId) {
    case 'util_50':
      return (
        <>
          Utilization rate above{' '}
          <EditableThreshold
            value={thresholds.utilizationLow}
            formatKey="utilizationLow"
            suffix="%"
            ariaLabel="Edit utilization low threshold"
            onCommit={(n) => patch('utilizationLow', n)}
          />
          ?
        </>
      )
    case 'util_100':
      return (
        <>
          Utilization rate above{' '}
          <EditableThreshold
            value={thresholds.utilizationHigh}
            formatKey="utilizationHigh"
            suffix="%"
            ariaLabel="Edit utilization high threshold"
            onCommit={(n) => patch('utilizationHigh', n)}
          />
          ?
        </>
      )
    case 'proj_100':
      return (
        <>
          10-year projected enrollment still above{' '}
          <span className="font-bold tabular-nums">
            {formatThresholdDisplay(
              'utilizationHigh',
              thresholds.utilizationHigh,
            )}
            %
          </span>{' '}
          utilization rate?
        </>
      )
    case 'nearby_cap':
      return (
        <>
          Schools within{' '}
          <EditableThreshold
            value={thresholds.nearbyCapacityMiles}
            formatKey="nearbyCapacityMiles"
            ariaLabel="Edit nearby capacity distance in miles"
            onCommit={(n) => patch('nearbyCapacityMiles', n)}
          />{' '}
          {thresholds.nearbyCapacityMiles === 1 ? 'mile' : 'miles'} have
          available student capacity?
        </>
      )
    case 'enroll_growth':
      return (
        <>
          Enrollment Growth of at least{' '}
          <EditableThreshold
            value={thresholds.enrollmentGrowthMin}
            formatKey="enrollmentGrowthMin"
            suffix="%"
            ariaLabel="Edit enrollment growth threshold"
            onCommit={(n) => patch('enrollmentGrowthMin', n)}
          />{' '}
          seen over last 5 years?
        </>
      )
    case 'building_score':
      return (
        <>
          Composite Building Score of{' '}
          <EditableThreshold
            value={thresholds.buildingScoreCutoff}
            formatKey="buildingScoreCutoff"
            ariaLabel="Edit building score threshold"
            onCommit={(n) => patch('buildingScoreCutoff', n)}
          />{' '}
          or above?
        </>
      )
    case 'programs_hi_bldg':
      return (
        <>
          <EditableThreshold
            value={thresholds.programmaticOfferingsCutoffHi}
            formatKey="programmaticOfferingsCutoffHi"
            ariaLabel="Edit programmatic offerings threshold (high building score branch)"
            onCommit={(n) => patch('programmaticOfferingsCutoffHi', n)}
          />{' '}
          or more programmatic offerings?
        </>
      )
    case 'programs_lo_bldg':
      return (
        <>
          <EditableThreshold
            value={thresholds.programmaticOfferingsCutoffLo}
            formatKey="programmaticOfferingsCutoffLo"
            ariaLabel="Edit programmatic offerings threshold (low building score branch)"
            onCommit={(n) => patch('programmaticOfferingsCutoffLo', n)}
          />{' '}
          or more programmatic offerings?
        </>
      )
    case 'site_exp':
      return 'Site capacity for campus expansion?'
    case 'near_underutil':
      return (
        <>
          Within{' '}
          <EditableThreshold
            value={thresholds.nearUnderutilizedMiles}
            formatKey="nearUnderutilizedMiles"
            ariaLabel="Edit near-underutilized distance in miles"
            onCommit={(n) => patch('nearUnderutilizedMiles', n)}
          />{' '}
          {thresholds.nearUnderutilizedMiles === 1 ? 'mile' : 'miles'} of another
          underutilized school?
        </>
      )
    default:
      return null
  }
}
function nodeTop(n: DecisionNode): Pt {
  return { x: n.x + NODE_W / 2, y: n.y }
}
function nodeBottom(n: DecisionNode): Pt {
  return { x: n.x + NODE_W / 2, y: n.y + NODE_H }
}
function nodeLeft(n: DecisionNode): Pt {
  return { x: n.x, y: n.y + NODE_H / 2 }
}
function nodeRight(n: DecisionNode): Pt {
  return { x: n.x + NODE_W, y: n.y + NODE_H / 2 }
}
/** Split Yes/No exits vertically so parallel routes don't stack. */
const EXIT_SPLIT = 11
function nodeRightYes(n: DecisionNode): Pt {
  return { x: n.x + NODE_W, y: n.y + NODE_H / 2 - EXIT_SPLIT }
}
function nodeRightNo(n: DecisionNode): Pt {
  return { x: n.x + NODE_W, y: n.y + NODE_H / 2 + EXIT_SPLIT }
}
function nodeLeftNo(n: DecisionNode): Pt {
  return { x: n.x, y: n.y + NODE_H / 2 + EXIT_SPLIT }
}
function outLeft(o: Outcome): Pt {
  return { x: o.x, y: o.y + OUT_H / 2 }
}

/** Horizontal exit → gutter → outcome; snap when nearly aligned to avoid micro-cricks. */
function linkRightToOutcome(start: Pt, outcome: Outcome, gutterX: number): Pt[] {
  const end = outLeft(outcome)
  if (Math.abs(start.y - end.y) < 12) {
    return [start, { x: gutterX, y: start.y }, { x: outcome.x, y: start.y }]
  }
  return [
    start,
    { x: gutterX, y: start.y },
    { x: gutterX, y: end.y },
    end,
  ]
}

/** Straight center-to-center when aligned; otherwise 1–2 orthogonal elbows. */
function link(
  start: Pt,
  end: Pt,
  via?: Pt | Pt[],
): Pt[] {
  if (!via) {
    if (start.x === end.x || start.y === end.y) return [start, end]
    // default: go horizontal first, then vertical
    return [start, { x: end.x, y: start.y }, end]
  }
  const mids = Array.isArray(via) ? via : [via]
  return [start, ...mids, end]
}

type Edge = {
  from: string
  to: string
  answer: boolean
  points: Pt[]
}

function nodeById(id: string): DecisionNode {
  const n = NODES.find((x) => x.id === id)
  if (!n) throw new Error(`Missing node ${id}`)
  return n
}
function outcomeById(id: StrategyGroupId): Outcome {
  const o = OUTCOMES.find((x) => x.id === id)
  if (!o) throw new Error(`Missing outcome ${id}`)
  return o
}

function edgeKey(from: string, answer: boolean, to: string): string {
  return `${from}|${answer ? 'yes' : 'no'}|${to}`
}

function buildEdges(): Edge[] {
  const util50 = nodeById('util_50')
  const util100 = nodeById('util_100')
  const proj100 = nodeById('proj_100')
  const nearby = nodeById('nearby_cap')
  const enroll = nodeById('enroll_growth')
  const building = nodeById('building_score')
  const progHi = nodeById('programs_hi_bldg')
  const progLo = nodeById('programs_lo_bldg')
  const site = nodeById('site_exp')
  const nearUnder = nodeById('near_underutil')

  const out1 = outcomeById('1')
  const out21 = outcomeById('2.1')
  const out22 = outcomeById('2.2')
  const out23 = outcomeById('2.3')
  const out3 = outcomeById('3')
  const out4 = outcomeById('4')
  const out24 = outcomeById('2.4')

  // Vertical gutters between columns (avoid cutting through other cards)
  const gutter01 = (util50.x + NODE_W + enroll.x) / 2
  const gutterOut = (nearUnder.x + NODE_W + out1.x) / 2

  return [
    // util_50 Yes ↓ util_100 (same column)
    {
      from: 'util_50',
      to: 'util_100',
      answer: true,
      points: link(nodeBottom(util50), nodeTop(util100)),
    },
    // util_50 No → enroll (same row)
    {
      from: 'util_50',
      to: 'enroll_growth',
      answer: false,
      points: link(nodeRight(util50), nodeLeft(enroll)),
    },
    // util_100 Yes ↓ proj_100
    {
      from: 'util_100',
      to: 'proj_100',
      answer: true,
      points: link(nodeBottom(util100), nodeTop(proj100)),
    },
    // util_100 No → building (same row — straight across)
    {
      from: 'util_100',
      to: 'building_score',
      answer: false,
      points: link(nodeRight(util100), nodeLeft(building)),
    },
    // proj_100 Yes ↓ nearby
    {
      from: 'proj_100',
      to: 'nearby_cap',
      answer: true,
      points: link(nodeBottom(proj100), nodeTop(nearby)),
    },
    // proj_100 No → building via same gutter
    {
      from: 'proj_100',
      to: 'building_score',
      answer: false,
      points: link(nodeRight(proj100), nodeLeft(building), [
        { x: gutter01, y: nodeRight(proj100).y },
        { x: gutter01, y: nodeLeft(building).y },
      ]),
    },
    // nearby Yes → 2.4 (upper rail; clears over the site card)
    {
      from: 'nearby_cap',
      to: '2.4',
      answer: true,
      points: (() => {
        const start = nodeRightYes(nearby)
        const aboveRow = nearby.y - 10
        return [
          start,
          { x: start.x + 14, y: start.y },
          { x: start.x + 14, y: aboveRow },
          { x: gutterOut, y: aboveRow },
          { x: gutterOut, y: outLeft(out24).y },
          outLeft(out24),
        ]
      })(),
    },
    // nearby No → site expansion (straight lower rail — same y in/out)
    {
      from: 'nearby_cap',
      to: 'site_exp',
      answer: false,
      points: link(nodeRightNo(nearby), nodeLeftNo(site)),
    },
    // enroll Yes ↓ building
    {
      from: 'enroll_growth',
      to: 'building_score',
      answer: true,
      points: link(nodeBottom(enroll), nodeTop(building)),
    },
    // enroll No → near_underutil (same row)
    {
      from: 'enroll_growth',
      to: 'near_underutil',
      answer: false,
      points: link(nodeRight(enroll), nodeLeft(nearUnder)),
    },
    // near Yes → 1
    {
      from: 'near_underutil',
      to: '1',
      answer: true,
      points: linkRightToOutcome(nodeRight(nearUnder), out1, gutterOut),
    },
    // near No → building: drop into row gutter, left past programs_lo, then down
    // into building top (offset right of center so it clears the enroll Yes arrow)
    {
      from: 'near_underutil',
      to: 'building_score',
      answer: false,
      points: (() => {
        const noBtnCenterX = nearUnder.x + 10 + BTN_W + 6 + BTN_W / 2
        const start = { x: noBtnCenterX, y: nearUnder.y + NODE_H }
        const gutterY = (nearUnder.y + NODE_H + building.y) / 2
        // ~2 arrowhead widths right of card center (markerWidth = 5)
        const endX = building.x + NODE_W / 2 + 10
        const end = { x: endX, y: building.y }
        return [
          start,
          { x: start.x, y: gutterY },
          { x: end.x, y: gutterY },
          end,
        ]
      })(),
    },
    // building Yes ↓ programs_hi
    {
      from: 'building_score',
      to: 'programs_hi_bldg',
      answer: true,
      points: link(nodeBottom(building), nodeTop(progHi)),
    },
    // building No → programs_lo (same row-ish)
    {
      from: 'building_score',
      to: 'programs_lo_bldg',
      answer: false,
      points: link(nodeRight(building), nodeLeft(progLo)),
    },
    // programs_hi Yes → 3
    {
      from: 'programs_hi_bldg',
      to: '3',
      answer: true,
      points: linkRightToOutcome(nodeRight(progHi), out3, gutterOut),
    },
    // programs_hi No → 2.3
    {
      from: 'programs_hi_bldg',
      to: '2.3',
      answer: false,
      points: linkRightToOutcome(nodeRight(progHi), out23, gutterOut),
    },
    // programs_lo Yes → 2.2
    {
      from: 'programs_lo_bldg',
      to: '2.2',
      answer: true,
      points: linkRightToOutcome(nodeRight(progLo), out22, gutterOut),
    },
    // programs_lo No → 2.1
    {
      from: 'programs_lo_bldg',
      to: '2.1',
      answer: false,
      points: linkRightToOutcome(nodeRight(progLo), out21, gutterOut),
    },
    // site Yes → 4 (lower rail; enter outcome at same y to avoid a micro-crick)
    {
      from: 'site_exp',
      to: '4',
      answer: true,
      points: linkRightToOutcome(nodeRightNo(site), out4, gutterOut + 8),
    },
    // site No → 2.4 (upper rail so it can rise to group 2.4 without crossing Yes)
    {
      from: 'site_exp',
      to: '2.4',
      answer: false,
      points: linkRightToOutcome(nodeRightYes(site), out24, gutterOut - 8),
    },
  ]
}

const EDGES = buildEdges()

function pointsToPath(points: Pt[]): string {
  if (points.length === 0) return ''
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')
}

function schoolEdgeKeys(path: DecisionStep[], groupId?: StrategyGroupId): Set<string> {
  const keys = new Set<string>()
  for (let i = 0; i < path.length; i++) {
    const step = path[i]
    const nextId = i < path.length - 1 ? path[i + 1].nodeId : groupId
    if (!nextId) continue
    keys.add(edgeKey(step.nodeId, step.answer, nextId))
  }
  return keys
}

/** Which Yes/No answers are taken at a node along the active (primary) routes. */
function answersForNode(keys: Set<string>, nodeId: string): Set<boolean> {
  const answers = new Set<boolean>()
  for (const key of keys) {
    const [from, ans] = key.split('|')
    if (from === nodeId) answers.add(ans === 'yes')
  }
  return answers
}

/** Canonical route edges used when no school paths are available for a group. */
const CANONICAL_GROUP_EDGES: Record<StrategyGroupId, string[]> = {
  '1': [
    edgeKey('util_50', false, 'enroll_growth'),
    edgeKey('enroll_growth', false, 'near_underutil'),
    edgeKey('near_underutil', true, '1'),
  ],
  '2.1': [
    edgeKey('building_score', false, 'programs_lo_bldg'),
    edgeKey('programs_lo_bldg', false, '2.1'),
  ],
  '2.2': [
    edgeKey('building_score', false, 'programs_lo_bldg'),
    edgeKey('programs_lo_bldg', true, '2.2'),
  ],
  '2.3': [
    edgeKey('building_score', true, 'programs_hi_bldg'),
    edgeKey('programs_hi_bldg', false, '2.3'),
  ],
  '2.4': [
    edgeKey('util_50', true, 'util_100'),
    edgeKey('util_100', true, 'proj_100'),
    edgeKey('proj_100', true, 'nearby_cap'),
    edgeKey('nearby_cap', true, '2.4'),
    edgeKey('nearby_cap', false, 'site_exp'),
    edgeKey('site_exp', false, '2.4'),
  ],
  '3': [
    edgeKey('building_score', true, 'programs_hi_bldg'),
    edgeKey('programs_hi_bldg', true, '3'),
  ],
  '4': [
    edgeKey('util_50', true, 'util_100'),
    edgeKey('util_100', true, 'proj_100'),
    edgeKey('proj_100', true, 'nearby_cap'),
    edgeKey('nearby_cap', false, 'site_exp'),
    edgeKey('site_exp', true, '4'),
  ],
}

function arrowMarker(id: string, color: string) {
  return (
    <marker
      id={id}
      viewBox="0 0 12 12"
      refX="10"
      refY="6"
      markerWidth="5"
      markerHeight="5"
      orient="auto-start-reverse"
    >
      <path
        d="M 1.5 1.5 L 10 6 L 1.5 10.5"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </marker>
  )
}

export function DecisionFlowchart({
  path,
  groupId,
  schoolName,
  groupPaths = [],
  expanded: expandedProp,
  onExpandedChange,
  onOutcomeHover,
  thresholds,
  onThresholdsChange,
  captureMode = false,
  groupCounts,
  onGroupSelect,
}: DecisionFlowchartProps) {
  const [internalExpanded, setInternalExpanded] = useState(false)
  const expanded = expandedProp ?? internalExpanded
  const setExpanded = (next: boolean | ((prev: boolean) => boolean)) => {
    const value = typeof next === 'function' ? next(expanded) : next
    onExpandedChange?.(value)
    if (expandedProp === undefined) setInternalExpanded(value)
  }

  const pathNodeIds = new Set(path.map((p) => p.nodeId))
  const answerByNode = new Map(path.map((p) => [p.nodeId, p.answer]))
  const schoolKeys = schoolEdgeKeys(path, groupId)
  const hasSchoolPath = path.length > 0
  const isCustomThresholds = !thresholdsEqual(thresholds, DEFAULT_THRESHOLDS)

  const groupKeys = new Set<string>()
  const groupNodeIds = new Set<string>()
  for (const gp of groupPaths) {
    for (const step of gp) groupNodeIds.add(step.nodeId)
    for (const key of schoolEdgeKeys(gp, groupId)) groupKeys.add(key)
  }
  if (groupId && groupKeys.size === 0) {
    for (const key of CANONICAL_GROUP_EDGES[groupId] ?? []) {
      groupKeys.add(key)
      const [from, , to] = key.split('|')
      groupNodeIds.add(from)
      if (NODES.some((n) => n.id === to)) groupNodeIds.add(to)
    }
  }

  // Prefer school-path “active” styling; when school-agnostic, elevate group routes
  // to the same active treatment used in Prioritize view.
  const primaryKeys = hasSchoolPath ? schoolKeys : groupKeys
  const secondaryKeys = hasSchoolPath ? groupKeys : new Set<string>()
  const hasPrimary = primaryKeys.size > 0

  const showBars = Boolean(groupCounts)
  const maxGroupCount = showBars
    ? Math.max(1, ...OUTCOME_ORDER.map((id) => groupCounts?.[id] ?? 0))
    : 1

  return (
    <div className="w-full rounded-lg border border-mps-gray-border bg-white">
      <div className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-start gap-2 text-left hover:opacity-90"
          aria-expanded={expanded}
        >
          <ChevronDown
            className={`mt-0.5 h-4 w-4 shrink-0 text-mps-muted transition-transform duration-200 ${
              expanded ? 'rotate-0' : '-rotate-90'
            }`}
          />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-mps-text">
              Decision Flowchart
              {isCustomThresholds && (
                <span className="ml-2 text-[11px] font-medium text-mps-blue">
                  (custom thresholds)
                </span>
              )}
            </h3>
            <p className="text-xs text-mps-muted">
              {schoolName
                ? `Path for ${schoolName}`
                : groupId
                  ? `Routes that lead to ${STRATEGY_GROUP_MAP[groupId].label}`
                  : 'Configure sorting thresholds and view decision flows by strategy group'}
              {groupId && schoolName && (
                <>
                  {' '}
                  →{' '}
                  <span className="font-medium text-mps-text">
                    {STRATEGY_GROUP_MAP[groupId].label}
                  </span>
                </>
              )}
            </p>
          </div>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {expanded && isCustomThresholds && (
            <button
              type="button"
              onClick={() => onThresholdsChange({ ...DEFAULT_THRESHOLDS })}
              className="rounded-md border border-mps-gray-border px-2 py-1 text-[11px] font-semibold text-mps-text hover:bg-mps-gray/50"
            >
              Reset thresholds
            </button>
          )}
          {expanded && (
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-mps-muted">
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm bg-mps-teal" /> Yes
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm bg-mps-orange" /> No
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-1.5 rounded-sm bg-amber-400" /> Active path
              </span>
            </div>
          )}
          {!expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-xs font-medium text-mps-blue"
            >
              Show flowchart
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <>
      <div className="overflow-x-auto border-t border-mps-gray-border px-3 py-2">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="min-w-[980px] w-full max-h-[min(58vh,420px)]"
          role="img"
          aria-label="Strategy candidate group decision flowchart"
        >
          <defs>
            {arrowMarker('arrow-yes', '#14b8a6')}
            {arrowMarker('arrow-no', '#f97316')}
            {arrowMarker('arrow-yes-active', '#0f766e')}
            {arrowMarker('arrow-no-active', '#c2410c')}
            {arrowMarker('arrow-group-yes', '#5eead4')}
            {arrowMarker('arrow-group-no', '#fdba74')}
          </defs>

          <text x={12} y={14} fill="#1d4ed8" fontSize="13" fontWeight="700">
            START HERE
          </text>
          <text x={OUT_X} y={14} fill="#1d4ed8" fontSize="12" fontWeight="700">
            STRATEGY CANDIDATE GROUPS
          </text>

          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            {EDGES.map((edge) => {
              const key = edgeKey(edge.from, edge.answer, edge.to)
              const onPrimary = primaryKeys.has(key)
              const onSecondary = secondaryKeys.has(key)
              if (onPrimary) return null

              let opacity = 0.5
              let width = 1.75
              let marker = edge.answer ? 'url(#arrow-yes)' : 'url(#arrow-no)'
              let stroke = edge.answer ? '#5eead4' : '#fdba74'

              if (hasPrimary) {
                if (onSecondary) {
                  opacity = 0.4
                  width = 2.25
                  stroke = edge.answer ? '#2dd4bf' : '#fb923c'
                  marker = edge.answer ? 'url(#arrow-group-yes)' : 'url(#arrow-group-no)'
                } else {
                  opacity = 0.12
                }
              }

              return (
                <path
                  key={key}
                  d={pointsToPath(edge.points)}
                  stroke={stroke}
                  strokeWidth={width}
                  opacity={opacity}
                  markerEnd={marker}
                />
              )
            })}

            {EDGES.map((edge) => {
              const key = edgeKey(edge.from, edge.answer, edge.to)
              if (!primaryKeys.has(key)) return null
              return (
                <path
                  key={`active-${key}`}
                  d={pointsToPath(edge.points)}
                  stroke={edge.answer ? '#0f766e' : '#c2410c'}
                  strokeWidth={3.5}
                  opacity={1}
                  markerEnd={
                    edge.answer ? 'url(#arrow-yes-active)' : 'url(#arrow-no-active)'
                  }
                />
              )
            })}
          </g>

          {NODES.map((node) => {
            const onPath = pathNodeIds.has(node.id)
            const answer = answerByNode.get(node.id)
            const inGroup = groupNodeIds.has(node.id)
            const dimmed = hasPrimary
              ? hasSchoolPath
                ? !onPath
                : !inGroup
              : false

            const border =
              onPath && answer === true
                ? '#0d9488'
                : onPath && answer === false
                  ? '#ea580c'
                  : !hasSchoolPath && inGroup && hasPrimary
                    ? '#94a3b8'
                    : '#cbd5e1'

            const activeAnswers = answersForNode(primaryKeys, node.id)
            const yesActive = activeAnswers.has(true)
            const noActive = activeAnswers.has(false)
            const highlightAnswers =
              hasPrimary && (hasSchoolPath ? onPath : inGroup)
            const btnY = node.y + NODE_H - BTN_H - 6

            return (
              <g key={node.id} opacity={dimmed ? 0.28 : 1}>
                <rect
                  x={node.x}
                  y={node.y}
                  width={NODE_W}
                  height={NODE_H}
                  rx={6}
                  fill={onPath ? '#fffbeb' : '#ffffff'}
                  stroke={border}
                  strokeWidth={onPath ? 2.5 : 1.25}
                />
                {captureMode ? (
                  wrapSvgLines(
                    nodeQuestionPlain(node.id, thresholds),
                    28,
                  ).map((line, i) => (
                    <text
                      key={`${node.id}-q-${i}`}
                      x={node.x + 8}
                      y={node.y + 14 + i * 11}
                      fill="#1f2937"
                      fontSize="10"
                      fontWeight="600"
                      fontFamily="Inter, Segoe UI, system-ui, sans-serif"
                    >
                      {line}
                    </text>
                  ))
                ) : (
                  <foreignObject
                    x={node.x + 6}
                    y={node.y + 4}
                    width={NODE_W - 12}
                    height={NODE_H - BTN_H - 10}
                  >
                    <div className="text-[11.5px] leading-tight font-medium text-mps-text">
                      <NodeQuestion
                        nodeId={node.id}
                        thresholds={thresholds}
                        onThresholdsChange={onThresholdsChange}
                      />
                    </div>
                  </foreignObject>
                )}
                <rect
                  x={node.x + 10}
                  y={btnY}
                  width={BTN_W}
                  height={BTN_H}
                  rx={3}
                  fill={
                    highlightAnswers && yesActive ? '#0d9488' : '#14b8a6'
                  }
                  opacity={highlightAnswers && !yesActive ? 0.3 : 1}
                />
                <text
                  x={node.x + 10 + BTN_W / 2}
                  y={btnY + BTN_H / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="white"
                  fontSize="11"
                  fontWeight="700"
                  opacity={highlightAnswers && !yesActive ? 0.3 : 1}
                >
                  Yes
                </text>
                <rect
                  x={node.x + 10 + BTN_W + 6}
                  y={btnY}
                  width={BTN_W}
                  height={BTN_H}
                  rx={3}
                  fill={
                    highlightAnswers && noActive ? '#ea580c' : '#f97316'
                  }
                  opacity={highlightAnswers && !noActive ? 0.3 : 1}
                />
                <text
                  x={node.x + 10 + BTN_W + 6 + BTN_W / 2}
                  y={btnY + BTN_H / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="white"
                  fontSize="11"
                  fontWeight="700"
                  opacity={highlightAnswers && !noActive ? 0.3 : 1}
                >
                  No
                </text>
              </g>
            )
          })}

          {OUTCOMES.map((outcome) => {
            const active = groupId === outcome.id
            const color = STRATEGY_GROUP_MAP[outcome.id].color
            const count = groupCounts?.[outcome.id] ?? 0
            const barW =
              showBars && maxGroupCount > 0
                ? Math.max(count > 0 ? 4 : 0, (count / maxGroupCount) * BAR_MAX_W)
                : 0
            const interactive = Boolean(onOutcomeHover || onGroupSelect)
            return (
              <g
                key={outcome.id}
                opacity={groupId && !active ? 0.25 : 1}
                style={{ cursor: interactive ? 'pointer' : undefined }}
                onMouseEnter={() => onOutcomeHover?.(outcome.id)}
                onMouseLeave={() => onOutcomeHover?.(null)}
                onClick={() => onGroupSelect?.(outcome.id)}
              >
                <rect
                  x={outcome.x}
                  y={outcome.y}
                  width={OUT_W}
                  height={OUT_H}
                  rx={6}
                  fill={color}
                  stroke={active ? '#f5c518' : 'transparent'}
                  strokeWidth={active ? 3 : 0}
                />
                {captureMode ? (
                  <text
                    x={outcome.x + OUT_W / 2}
                    y={outcome.y + OUT_H / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#ffffff"
                    fontSize="10"
                    fontWeight="700"
                    fontFamily="Inter, Segoe UI, system-ui, sans-serif"
                  >
                    {`${outcome.id}: ${STRATEGY_GROUP_MAP[outcome.id].shortLabel}`}
                  </text>
                ) : (
                  <foreignObject
                    x={outcome.x + 5}
                    y={outcome.y + 3}
                    width={OUT_W - 10}
                    height={OUT_H - 6}
                  >
                    <div className="pointer-events-none flex h-full items-center justify-center text-center text-[10.5px] leading-tight font-semibold text-white">
                      {outcome.label}
                    </div>
                  </foreignObject>
                )}
                {showBars && (
                  <>
                    <rect
                      x={BAR_X}
                      y={outcome.y}
                      width={BAR_MAX_W}
                      height={BAR_H}
                      rx={6}
                      fill="#e5e7eb"
                    />
                    <rect
                      x={BAR_X}
                      y={outcome.y}
                      width={barW}
                      height={BAR_H}
                      rx={6}
                      fill={color}
                    />
                    <text
                      x={BAR_X + BAR_MAX_W + 8}
                      y={outcome.y + OUT_H / 2}
                      textAnchor="start"
                      dominantBaseline="middle"
                      fill="#111827"
                      fontSize="11"
                      fontWeight="700"
                      fontFamily="Inter, Segoe UI, system-ui, sans-serif"
                    >
                      {count} School{count === 1 ? '' : 's'}
                    </text>
                  </>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {path.length > 0 && (
        <ol className="space-y-1.5 border-t border-mps-gray-border px-4 py-3">
          {path.map((step, i) => (
            <li key={`${step.nodeId}-${i}`} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mps-gray text-[10px] font-semibold">
                {i + 1}
              </span>
              <span>
                <span className="text-mps-muted">{step.question}</span>{' '}
                <span
                  className={
                    step.answer
                      ? 'font-semibold text-mps-teal'
                      : 'font-semibold text-mps-orange'
                  }
                >
                  {step.answerLabel}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
        </>
      )}
    </div>
  )
}
