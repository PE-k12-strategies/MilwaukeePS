import { useMemo, useState, type ReactNode } from 'react'
import { raceEthnicityAxisLines } from '../lib/loadSchoolsFromSheets'
import {
  aggregateBoardDistrict,
  aggregateEll,
  aggregateFreeReducedLunch,
  aggregateRaceEthnicity,
  type StackedCategoryBar,
} from '../lib/strategyGroupCharts'
import type {
  ClassificationResult,
  SchoolProperties,
  StrategyGroupId,
} from '../types/school'

interface StrategyGroupChartsProps {
  schools: SchoolProperties[]
  classifications: ClassificationResult[]
  /** Count vs within-category % — controlled by parent header toggle. */
  valueMode?: ValueMode
  /** Full-width pop-out: larger plot area. */
  expanded?: boolean
  /**
   * Strategy group to emphasize. When omitted/null, all groups use full
   * saturation (e.g. All Schools overview). Ignored when `highlightGroupIds` is set.
   */
  highlightGroupId?: StrategyGroupId | null
  /**
   * Emphasize multiple leaf groups (e.g. All Building-Focused → 2.1 + 2.2).
   * When set, only these groups are active; others are muted.
   */
  highlightGroupIds?: StrategyGroupId[] | null
  /**
   * Optional fill color for active (highlighted) segments — e.g. parent “All” color.
   * When omitted, each segment keeps its leaf strategy-group color.
   */
  highlightColor?: string | null
}

type Tip = {
  x: number
  y: number
  lines: string[]
} | null

/** Match chart card header (`text-xs` = 12px). Axis tick labels stay smaller. */
const HEADER_SIZE = 12
const AXIS_SIZE = 7
const TOOLTIP_SIZE = 10
const CHART_W = 248
const CHART_W_EXPANDED = 520
/** Slot height per category row (bar + gap). */
const ROW_H = 22
const ROW_H_EXPANDED = 28
const BAR_H = 14
const BAR_H_EXPANDED = 18
/** Shared plot padding — left room for category labels; bottom for count ticks. */
const PAD = { top: 4, right: 8, bottom: 18, left: 52 }
const PAD_EXPANDED = { top: 6, right: 12, bottom: 22, left: 64 }

function districtAxisLabel(category: string): string {
  const m = category.match(/(\d+)/)
  return m ? m[1] : category
}

function niceMax(value: number): number {
  if (value <= 0) return 10
  const exp = Math.pow(10, Math.floor(Math.log10(value)))
  const n = value / exp
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return nice * exp
}

function formatCount(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(Math.round(n))
}

function formatPctTick(n: number): string {
  if (!Number.isFinite(n)) return '0%'
  return `${Math.round(n)}%`
}

/** Within-category % composition by strategy group (each bar totals 100). */
function toCategoryPercentBars(
  data: StackedCategoryBar[],
): StackedCategoryBar[] {
  return data.map((cat) => {
    const total = cat.total
    const stacks = cat.stacks.map((seg) => ({
      ...seg,
      value: total > 0 ? (seg.value / total) * 100 : 0,
    }))
    return {
      category: cat.category,
      stacks,
      total: total > 0 ? 100 : 0,
    }
  })
}

type ValueMode = 'count' | 'percent'

export type ChartValueMode = ValueMode

/** Opaque lighter / less-saturated version of a strategy-group hue. */
function mutedGroupColor(hex: string): string {
  const raw = hex.replace('#', '')
  if (raw.length !== 6) return hex
  const r = parseInt(raw.slice(0, 2), 16) / 255
  const g = parseInt(raw.slice(2, 4), 16) / 255
  const b = parseInt(raw.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  let l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        break
      case g:
        h = ((b - r) / d + 2) / 6
        break
      default:
        h = ((r - g) / d + 4) / 6
        break
    }
  }
  s = Math.min(1, s * 0.72)
  l = Math.min(0.92, l * 0.45 + 0.55)

  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  let rr: number
  let gg: number
  let bb: number
  if (s === 0) {
    rr = gg = bb = l
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    rr = hue2rgb(p, q, h + 1 / 3)
    gg = hue2rgb(p, q, h)
    bb = hue2rgb(p, q, h - 1 / 3)
  }
  const toHex = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(rr)}${toHex(gg)}${toHex(bb)}`
}

function barFill(color: string, active: boolean): string {
  return active ? color : mutedGroupColor(color)
}

function resolveHighlight(
  groupId: StrategyGroupId,
  leafColor: string,
  highlightGroupId?: StrategyGroupId | null,
  highlightGroupIds?: StrategyGroupId[] | null,
  highlightColor?: string | null,
): { active: boolean; fill: string } {
  const multi = highlightGroupIds != null && highlightGroupIds.length > 0
  const active = multi
    ? highlightGroupIds.includes(groupId)
    : highlightGroupId == null || groupId === highlightGroupId
  const color =
    active && highlightColor && (multi || highlightGroupId != null)
      ? highlightColor
      : leafColor
  return { active, fill: barFill(color, active) }
}

function ChartCard({
  title,
  yLabel,
  children,
}: {
  title: string
  yLabel: string
  children: ReactNode
}) {
  return (
    <div className="flex h-full min-w-0 flex-col rounded-lg border border-mps-gray-border bg-white p-2">
      <div
        className="mb-0.5 min-h-[1rem] font-semibold leading-tight text-mps-text"
        style={{ fontSize: HEADER_SIZE }}
      >
        {title}
      </div>
      <div
        className="mb-0.5 min-h-[1rem] text-mps-muted"
        style={{ fontSize: HEADER_SIZE }}
      >
        {yLabel}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}

function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null
  return (
    <div
      className="pointer-events-none absolute z-10 max-w-[180px] rounded border border-mps-gray-border bg-white px-2 py-1 leading-snug text-mps-text shadow-md"
      style={{
        left: tip.x,
        top: tip.y,
        transform: 'translate(-50%, -110%)',
        fontSize: TOOLTIP_SIZE,
      }}
    >
      {tip.lines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  )
}

function StackedHorizontalChart({
  title,
  data,
  rawData,
  xMax,
  mode,
  expanded = false,
  highlightGroupId,
  highlightGroupIds,
  highlightColor,
  formatCategory,
}: {
  title: string
  data: StackedCategoryBar[]
  /** Original counts — used for tooltips when mode is percent. */
  rawData: StackedCategoryBar[]
  /** Shared / fixed X-axis maximum (already nice’d by caller when shared). */
  xMax: number
  mode: ValueMode
  expanded?: boolean
  highlightGroupId?: StrategyGroupId | null
  highlightGroupIds?: StrategyGroupId[] | null
  highlightColor?: string | null
  /** Return one or more lines for the category axis label. */
  formatCategory?: (category: string) => string | string[]
}) {
  const [tip, setTip] = useState<Tip>(null)
  const n = Math.max(data.length, 1)
  const pad = expanded ? PAD_EXPANDED : PAD
  const rowH = expanded ? ROW_H_EXPANDED : ROW_H
  const barH = expanded ? BAR_H_EXPANDED : BAR_H
  const width = expanded ? CHART_W_EXPANDED : CHART_W
  const height = pad.top + pad.bottom + n * rowH
  const innerW = width - pad.left - pad.right
  const ticks = [0, 0.5, 1].map((t) => t * xMax)
  const plotLeft = pad.left
  const plotBottom = pad.top + n * rowH
  const rawByCategory = useMemo(
    () => new Map(rawData.map((c) => [c.category, c])),
    [rawData],
  )

  return (
    <ChartCard
      title={title}
      yLabel={mode === 'percent' ? '% of category' : 'Students (count)'}
    >
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          preserveAspectRatio="xMidYMid meet"
          className="block w-full"
          style={{
            aspectRatio: `${width} / ${height}`,
            height: 'auto',
          }}
          role="img"
          aria-label={title}
        >
          {ticks.map((tick) => {
            const x = plotLeft + (xMax > 0 ? (tick / xMax) * innerW : 0)
            return (
              <g key={tick}>
                <line
                  x1={x}
                  x2={x}
                  y1={pad.top}
                  y2={plotBottom}
                  stroke="#e5e7eb"
                  strokeDasharray="3 3"
                />
                <text
                  x={x}
                  y={plotBottom + 10}
                  textAnchor="middle"
                  fill="#6b7280"
                  fontSize={AXIS_SIZE}
                >
                  {mode === 'percent' ? formatPctTick(tick) : formatCount(tick)}
                </text>
              </g>
            )
          })}
          {data.map((cat, i) => {
            const rowY = pad.top + i * rowH
            const barY = rowY + (rowH - barH) / 2
            let xCursor = plotLeft
            const formatted = formatCategory
              ? formatCategory(cat.category)
              : cat.category
            const labelLines = Array.isArray(formatted)
              ? formatted
              : [formatted]
            const labelBlockH = labelLines.length * 8
            const labelStartY =
              rowY + rowH / 2 - labelBlockH / 2 + 6
            const rawCat = rawByCategory.get(cat.category)

            return (
              <g key={cat.category}>
                <text
                  x={pad.left - 4}
                  y={labelStartY}
                  textAnchor="end"
                  fill="#6b7280"
                  fontSize={AXIS_SIZE}
                >
                  {labelLines.map((line, lineIdx) => (
                    <tspan
                      key={`${cat.category}-${lineIdx}`}
                      x={pad.left - 4}
                      dy={lineIdx === 0 ? 0 : '1.05em'}
                    >
                      {line}
                    </tspan>
                  ))}
                </text>
                {cat.stacks.map((seg) => {
                  const w = xMax > 0 ? (seg.value / xMax) * innerW : 0
                  const x = xCursor
                  xCursor += w
                  const { fill } = resolveHighlight(
                    seg.groupId,
                    seg.color,
                    highlightGroupId,
                    highlightGroupIds,
                    highlightColor,
                  )
                  if (seg.value <= 0) return null
                  const rawSeg = rawCat?.stacks.find(
                    (s) => s.groupId === seg.groupId,
                  )
                  return (
                    <rect
                      key={seg.groupId}
                      x={x}
                      y={barY}
                      width={Math.max(w, 1)}
                      height={barH}
                      fill={fill}
                      onMouseEnter={(e) => {
                        const parent = e.currentTarget.closest('.relative')
                        const parentRect = parent?.getBoundingClientRect()
                        if (!parentRect) return
                        const lines = [
                          cat.category,
                          `${seg.groupId}: ${seg.shortLabel}`,
                        ]
                        if (mode === 'percent') {
                          lines.push(`${seg.value.toFixed(1)}% of category`)
                          if (rawSeg) {
                            lines.push(
                              `${Math.round(rawSeg.value).toLocaleString()} students`,
                            )
                          }
                        } else {
                          lines.push(
                            `${Math.round(seg.value).toLocaleString()} students`,
                          )
                        }
                        setTip({
                          x: e.clientX - parentRect.left,
                          y: e.clientY - parentRect.top,
                          lines,
                        })
                      }}
                      onMouseLeave={() => setTip(null)}
                    />
                  )
                })}
              </g>
            )
          })}
        </svg>
        <Tooltip tip={tip} />
      </div>
    </ChartCard>
  )
}

export function StrategyGroupCharts({
  schools,
  classifications,
  valueMode = 'count',
  expanded = false,
  highlightGroupId,
  highlightGroupIds,
  highlightColor,
}: StrategyGroupChartsProps) {
  const mode = valueMode

  const frl = useMemo(
    () => aggregateFreeReducedLunch(schools, classifications),
    [schools, classifications],
  )
  const ell = useMemo(
    () => aggregateEll(schools, classifications),
    [schools, classifications],
  )
  const race = useMemo(
    () => aggregateRaceEthnicity(schools, classifications),
    [schools, classifications],
  )
  const district = useMemo(
    () => aggregateBoardDistrict(schools, classifications),
    [schools, classifications],
  )

  const frlView = useMemo(
    () => (mode === 'percent' ? toCategoryPercentBars(frl) : frl),
    [frl, mode],
  )
  const ellView = useMemo(
    () => (mode === 'percent' ? toCategoryPercentBars(ell) : ell),
    [ell, mode],
  )
  const raceView = useMemo(
    () => (mode === 'percent' ? toCategoryPercentBars(race) : race),
    [race, mode],
  )
  const districtView = useMemo(
    () => (mode === 'percent' ? toCategoryPercentBars(district) : district),
    [district, mode],
  )

  const binaryXMax = useMemo(() => {
    if (mode === 'percent') return 100
    const peak = Math.max(
      ...frl.map((d) => d.total),
      ...ell.map((d) => d.total),
      0,
    )
    return niceMax(peak)
  }, [frl, ell, mode])

  const raceXMax = mode === 'percent' ? 100 : 30_000
  const districtXMax = useMemo(() => {
    if (mode === 'percent') return 100
    return niceMax(Math.max(...district.map((d) => d.total), 0))
  }, [district, mode])

  return (
    <div className="min-w-0">
      <div className="grid grid-cols-2 items-start gap-1.5">
        <StackedHorizontalChart
          title="Free/Reduced Lunch"
          data={frlView}
          rawData={frl}
          xMax={binaryXMax}
          mode={mode}
          expanded={expanded}
          highlightGroupId={highlightGroupId}
          highlightGroupIds={highlightGroupIds}
          highlightColor={highlightColor}
        />
        <StackedHorizontalChart
          title="English Language Learners"
          data={ellView}
          rawData={ell}
          xMax={binaryXMax}
          mode={mode}
          expanded={expanded}
          highlightGroupId={highlightGroupId}
          highlightGroupIds={highlightGroupIds}
          highlightColor={highlightColor}
        />
        <StackedHorizontalChart
          title="Race/Ethnicity"
          data={raceView}
          rawData={race}
          xMax={raceXMax}
          mode={mode}
          expanded={expanded}
          highlightGroupId={highlightGroupId}
          highlightGroupIds={highlightGroupIds}
          highlightColor={highlightColor}
          formatCategory={raceEthnicityAxisLines}
        />
        <StackedHorizontalChart
          title="Board District"
          data={districtView}
          rawData={district}
          xMax={districtXMax}
          mode={mode}
          expanded={expanded}
          highlightGroupId={highlightGroupId}
          highlightGroupIds={highlightGroupIds}
          highlightColor={highlightColor}
          formatCategory={districtAxisLabel}
        />
      </div>
    </div>
  )
}
