import { useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { MetricHelpTip } from './MetricHelpTip'
import { utilizationBandFor } from '../config/utilizationBands'
import {
  availableSeats,
  compareMetric,
  demographicSlices,
  radarPercentiles,
  type DemoSlice,
} from '../lib/schoolProfileStats'
import type { SchoolProperties } from '../types/school'

interface SchoolProfilePanelProps {
  school: SchoolProperties
  schools: SchoolProperties[]
}

function formatPct(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(digits)}%`
}

function formatNum(n: number | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return digits === 0 ? String(Math.round(n)) : n.toFixed(digits)
}

function formatSqFt(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${Math.round(n).toLocaleString('en-US')} sq ft`
}

function ProgressBar({
  pct,
  color = '#111827',
}: {
  pct: number
  color?: string
}) {
  const w = Math.max(0, Math.min(100, pct))
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
      <div
        className="h-full rounded-full transition-[width]"
        style={{ width: `${w}%`, backgroundColor: color }}
      />
    </div>
  )
}

function MetricCard({
  value,
  label,
  color,
  barPct,
  helpKey,
}: {
  value: string
  label: string
  color: string
  barPct?: number
  helpKey?: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm">
      <p className="text-2xl font-bold tabular-nums" style={{ color }}>
        {value}
      </p>
      <p
        className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold"
        style={{ color }}
      >
        {label}
        <MetricHelpTip helpKey={helpKey} />
      </p>
      {barPct !== undefined ? (
        <ProgressBar pct={barPct} color="#111827" />
      ) : null}
    </div>
  )
}

function YesNoTag({ yes }: { yes: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        yes
          ? 'bg-emerald-100 text-emerald-800'
          : 'bg-rose-100 text-rose-800'
      }`}
    >
      {yes ? 'Yes' : 'No'}
    </span>
  )
}

function ChartHoverTip({
  tip,
}: {
  tip: { x: number; y: number; title: string; detail: string } | null
}) {
  if (!tip) return null
  return (
    <div
      className="pointer-events-none absolute z-20 max-w-[14rem] -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-left shadow-lg"
      style={{ left: tip.x, top: tip.y }}
      role="tooltip"
    >
      <p className="text-xs font-semibold text-slate-900">{tip.title}</p>
      <p className="text-[11px] text-slate-600">{tip.detail}</p>
    </div>
  )
}

function RadarChart({
  axes,
}: {
  axes: { label: string; percentile: number }[]
}) {
  const [tip, setTip] = useState<{
    x: number
    y: number
    title: string
    detail: string
  } | null>(null)
  const pad = 48
  const size = 260
  const cx = size / 2
  const cy = size / 2
  const r = 78
  const n = axes.length
  if (n < 3) return null

  const angleAt = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n
  const point = (i: number, t: number) => {
    const a = angleAt(i)
    return [cx + Math.cos(a) * r * t, cy + Math.sin(a) * r * t] as const
  }

  const labelLines = (label: string): string[] => {
    if (label === 'Academic Performance') return ['Academic', 'Performance']
    if (label === 'Utilization Rate') return ['Utilization', 'Rate']
    if (label === 'Free/Reduced Lunch') return ['Free/Reduced', 'Lunch']
    if (label === 'Building Score') return ['Building', 'Score']
    return [label]
  }

  const gridLevels = [0.25, 0.5, 0.75, 1]
  const dataPts = axes.map(
    (ax, i) => point(i, Math.max(0, Math.min(100, ax.percentile)) / 100),
  )
  const dataPath =
    dataPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') +
    'Z'

  const showTip = (
    e: MouseEvent<SVGElement>,
    title: string,
    detail: string,
  ) => {
    const host = e.currentTarget.ownerSVGElement?.parentElement
    if (!host) return
    const rect = host.getBoundingClientRect()
    setTip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      title,
      detail,
    })
  }

  return (
    <div className="relative mx-auto w-full max-w-[320px]">
      <svg
        viewBox={`${-pad} ${-pad} ${size + pad * 2} ${size + pad * 2}`}
        className="h-auto w-full"
      >
        {gridLevels.map((t) => {
          const pts = Array.from({ length: n }, (_, i) => point(i, t))
          const d =
            pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') +
            'Z'
          return (
            <path
              key={t}
              d={d}
              fill="none"
              stroke="#e2e8f0"
              strokeWidth={1}
            />
          )
        })}
        {axes.map((_, i) => {
          const [x, y] = point(i, 1)
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
          )
        })}
        <path
          d={dataPath}
          fill="rgba(37, 99, 235, 0.25)"
          stroke="#2563eb"
          strokeWidth={2}
        />
        {axes.map((ax, i) => {
          const [dx, dy] = dataPts[i]
          const [x, y] = point(i, 1.28)
          const lines = labelLines(ax.label)
          const lineH = 11
          const startY = y - ((lines.length - 1) * lineH) / 2
          const detail = `${ax.percentile.toFixed(0)}th percentile`
          return (
            <g key={ax.label}>
              <circle
                cx={dx}
                cy={dy}
                r={5}
                fill="#2563eb"
                stroke="#fff"
                strokeWidth={1.5}
                className="cursor-pointer"
                onMouseEnter={(e) => showTip(e, ax.label, detail)}
                onMouseMove={(e) => showTip(e, ax.label, detail)}
                onMouseLeave={() => setTip(null)}
              />
              {/* Larger invisible hit target */}
              <circle
                cx={dx}
                cy={dy}
                r={14}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={(e) => showTip(e, ax.label, detail)}
                onMouseMove={(e) => showTip(e, ax.label, detail)}
                onMouseLeave={() => setTip(null)}
              />
              <text
                x={x}
                y={startY}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-slate-600"
                style={{ fontSize: 10, fontWeight: 600 }}
              >
                {lines.map((line, li) => (
                  <tspan key={line} x={x} dy={li === 0 ? 0 : lineH}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          )
        })}
      </svg>
      <ChartHoverTip tip={tip} />
    </div>
  )
}

function PieChart({ slices }: { slices: DemoSlice[] }) {
  const [tip, setTip] = useState<{
    x: number
    y: number
    title: string
    detail: string
  } | null>(null)
  const size = 220
  const cx = size / 2
  const cy = size / 2
  const r = 72
  if (slices.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        No demographic data available.
      </p>
    )
  }

  let angle = -Math.PI / 2
  const arcs = slices.map((s) => {
    const sweep = (s.pct / 100) * 2 * Math.PI
    const start = angle
    const end = angle + sweep
    angle = end
    const large = sweep > Math.PI ? 1 : 0
    const x1 = cx + Math.cos(start) * r
    const y1 = cy + Math.sin(start) * r
    const x2 = cx + Math.cos(end) * r
    const y2 = cy + Math.sin(end) * r
    const mid = start + sweep / 2
    const lx = cx + Math.cos(mid) * (r + 28)
    const ly = cy + Math.sin(mid) * (r + 28)
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`
    return { ...s, d, lx, ly, mid }
  })

  const showTip = (
    e: MouseEvent<SVGElement>,
    title: string,
    detail: string,
  ) => {
    const host = e.currentTarget.ownerSVGElement?.parentElement
    if (!host) return
    const rect = host.getBoundingClientRect()
    setTip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      title,
      detail,
    })
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-full max-w-[240px]">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-auto w-full">
          {arcs.map((a) => {
            const detail = `${a.pct.toFixed(1)}% · ${Math.round(a.count).toLocaleString('en-US')} students`
            return (
              <path
                key={a.label}
                d={a.d}
                fill={a.color}
                stroke="#fff"
                strokeWidth={1.5}
                className="cursor-pointer transition-opacity hover:opacity-90"
                onMouseEnter={(e) => showTip(e, a.label, detail)}
                onMouseMove={(e) => showTip(e, a.label, detail)}
                onMouseLeave={() => setTip(null)}
              />
            )
          })}
        </svg>
        <ChartHoverTip tip={tip} />
      </div>
      <ul className="flex w-full flex-wrap justify-center gap-x-3 gap-y-1 text-[11px]">
        {slices.map((s) => (
          <li key={s.label} className="inline-flex items-center gap-1.5 text-slate-700">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span className="font-semibold">{s.label}:</span>
            <span>{s.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ComparisonCard({
  title,
  accent,
  schoolName,
  primaryValue,
  primaryLabel,
  belowLabel,
  aboveLabel,
  comparison,
  footerNote,
  capacityBlock,
  helpKey,
}: {
  title: string
  accent: 'blue' | 'green'
  schoolName: string
  primaryValue: string
  primaryLabel: string
  belowLabel: string
  aboveLabel: string
  comparison: ReturnType<typeof compareMetric>
  footerNote?: string
  capacityBlock?: {
    capacity: string
    available: string
    utilization: string
    bandLabel: string
  }
  helpKey?: string
}) {
  const isBlue = accent === 'blue'
  const topBg = isBlue ? 'bg-sky-50 border-l-sky-600' : 'bg-emerald-50 border-l-emerald-600'
  const topText = isBlue ? 'text-sky-800' : 'text-emerald-800'
  const midBg = isBlue ? 'bg-sky-50' : 'bg-emerald-50'
  const midText = isBlue ? 'text-sky-800' : 'text-emerald-800'
  const rankBg = isBlue
    ? 'border-amber-200 bg-amber-50 text-amber-900'
    : 'border-violet-200 bg-violet-50 text-violet-900'

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h4 className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-900">
        {title}
        <MetricHelpTip helpKey={helpKey} />
      </h4>
      <p className="text-xs text-slate-500">How this school compares to all others</p>

      <div
        className={`mt-3 flex items-center justify-between gap-3 rounded-md border-l-4 px-3 py-2.5 ${topBg}`}
      >
        <div className={`min-w-0 ${topText}`}>
          <p className="truncate text-sm font-bold">{schoolName}</p>
          <p className="text-[11px] opacity-80">Your selected school</p>
        </div>
        <div className={`shrink-0 text-right ${topText}`}>
          <p className="text-2xl font-bold tabular-nums leading-none">{primaryValue}</p>
          <p className="mt-0.5 text-[11px]">{primaryLabel}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-md bg-slate-100 px-2 py-2 text-center">
          <p className="text-xl font-bold tabular-nums text-slate-900">
            {comparison.schoolsBelow}
          </p>
          <p className="text-[10px] font-medium text-slate-600">{belowLabel}</p>
          <p className="text-[10px] text-slate-500">({comparison.pctBelow}%)</p>
        </div>
        <div className={`rounded-md px-2 py-2 text-center ${midBg}`}>
          <p className={`text-xl font-bold tabular-nums ${midText}`}>
            {accent === 'blue'
              ? formatPct(comparison.average)
              : formatNum(comparison.average)}
          </p>
          <p className={`text-[10px] font-medium ${midText}`}>District Average</p>
          <p className={`text-[10px] ${midText}`}>
            {comparison.aboveAverage ? 'Above Average' : 'Below Average'}
          </p>
        </div>
        <div className="rounded-md bg-slate-100 px-2 py-2 text-center">
          <p className="text-xl font-bold tabular-nums text-slate-900">
            {comparison.schoolsAbove}
          </p>
          <p className="text-[10px] font-medium text-slate-600">{aboveLabel}</p>
          <p className="text-[10px] text-slate-500">({comparison.pctAbove}%)</p>
        </div>
      </div>

      <div
        className={`mt-3 flex items-center justify-between gap-2 rounded-md border px-3 py-2 ${rankBg}`}
      >
        <div>
          <p className="text-xs font-semibold">School Ranking</p>
          {footerNote ? (
            <p className="text-[11px] opacity-90">{footerNote}</p>
          ) : null}
        </div>
        <p className="text-lg font-bold tabular-nums">
          #{comparison.rankFromTop} of {comparison.total}
        </p>
      </div>

      {capacityBlock && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-orange-900">
          <div>
            <p className="text-xs font-bold">Capacity Analysis</p>
            <p className="text-[11px]">
              Capacity: {capacityBlock.capacity}
              {' · '}
              Available: {capacityBlock.available}
            </p>
          </div>
          <div className="text-right text-[11px] font-semibold">
            <p>Utilization: {capacityBlock.utilization}</p>
            <p>{capacityBlock.bandLabel}</p>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoCard({
  label,
  helpKey,
  caption,
  children,
}: {
  label: string
  helpKey?: string
  /** Optional subtitle under the label/value row (e.g. program names). */
  caption?: string
  children: ReactNode
}) {
  return (
    <div className="rounded-md bg-sky-50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-sky-800">
          {label}
          <MetricHelpTip helpKey={helpKey} />
        </span>
        <div className="shrink-0 text-sm font-bold text-sky-950">{children}</div>
      </div>
      {caption ? (
        <p className="mt-1 text-[11px] leading-snug font-normal text-sky-900/75">
          {caption}
        </p>
      ) : null}
    </div>
  )
}

function SectionTitle({
  children,
  helpKey,
}: {
  children: ReactNode
  helpKey?: string
}) {
  return (
    <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900">
      <span className="inline-block h-2 w-2 rounded-full bg-sky-600" />
      <span className="inline-flex items-center gap-1">
        {children}
        <MetricHelpTip helpKey={helpKey} />
      </span>
    </h4>
  )
}

export function SchoolProfilePanel({ school, schools }: SchoolProfilePanelProps) {
  const band = utilizationBandFor(school.utilizationRate)
  const seats = availableSeats(school)

  const utilCmp = useMemo(
    () =>
      compareMetric(
        school.utilizationRate,
        schools.map((s) => s.utilizationRate),
      ),
    [school, schools],
  )
  const enrollCmp = useMemo(
    () =>
      compareMetric(
        school.currentEnrollment,
        schools.map((s) => s.currentEnrollment),
      ),
    [school, schools],
  )
  const radar = useMemo(
    () => radarPercentiles(school, schools),
    [school, schools],
  )
  const demos = useMemo(() => demographicSlices(school), [school])

  const ellPct =
    school.currentEnrollment > 0
      ? (school.ellStudentCount / school.currentEnrollment) * 100
      : 0

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3 sm:p-4">
      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <MetricCard
          value={formatPct(school.utilizationRate)}
          label="Utilization Rate"
          helpKey="utilizationRate"
          color={band.color}
          barPct={Math.min(school.utilizationRate, 100)}
        />
        <MetricCard
          value={`${formatNum(school.buildingScore, 1)}/10`}
          label="Building Score"
          helpKey="buildingScore"
          color="#16a34a"
          barPct={(school.buildingScore / 10) * 100}
        />
        <MetricCard
          value={formatNum(school.programmaticOfferings, 1)}
          label="Programmatic Offerings"
          helpKey="programmaticOfferings"
          color="#7c3aed"
        />
        <MetricCard
          value={formatPct(school.economicDisadvantageRate)}
          label="Free/Reduced Lunch"
          helpKey="freeReducedLunch"
          color="#dc2626"
          barPct={school.economicDisadvantageRate}
        />
      </div>

      {/* Radar + demographics */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-900">
            School Profile (Normalized)
            <MetricHelpTip helpKey="schoolProfileNormalized" />
          </h4>
          <p className="mb-2 text-xs text-slate-500">
            Scores on a 0–100 percentile scale relative to all schools.
          </p>
          <RadarChart axes={radar} />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-900">
            Student Demographics
            <MetricHelpTip helpKey="studentDemographics" />
          </h4>
          <p className="mb-2 text-xs text-slate-500">
            Race / ethnicity share of enrolled students.
          </p>
          <PieChart slices={demos} />
        </div>
      </div>

      {/* Comparisons */}
      <div className="grid gap-3 lg:grid-cols-2">
        <ComparisonCard
          title="Utilization Rate Comparison"
          helpKey="utilizationComparison"
          accent="blue"
          schoolName={school.schoolName}
          primaryValue={formatPct(school.utilizationRate)}
          primaryLabel="Utilization Rate"
          belowLabel="Schools Below"
          aboveLabel="Schools Above"
          comparison={utilCmp}
          footerNote={band.label}
        />
        <ComparisonCard
          title="Enrollment Comparison"
          helpKey="enrollmentComparison"
          accent="green"
          schoolName={school.schoolName}
          primaryValue={formatNum(school.currentEnrollment)}
          primaryLabel="Students"
          belowLabel="Schools Smaller"
          aboveLabel="Schools Larger"
          comparison={enrollCmp}
          capacityBlock={
            school.buildingCapacity != null
              ? {
                  capacity: formatNum(school.buildingCapacity),
                  available: seats == null ? '—' : formatNum(seats),
                  utilization: formatPct(school.utilizationRate),
                  bandLabel: band.label,
                }
              : undefined
          }
        />
      </div>

      {/* Additional info */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h4 className="mb-3 text-sm font-bold text-slate-900">
          Additional School Information
        </h4>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <SectionTitle helpKey="facilityDetails">Facility Details</SectionTitle>
            <div className="space-y-2">
              <InfoCard label="Pre-1978 Building" helpKey="pre1978LeadRisk">
                <YesNoTag yes={school.pre1978LeadRisk} />
              </InfoCard>
              <InfoCard label="ADA Compliant" helpKey="adaAccessible">
                <YesNoTag yes={school.adaAccessible} />
              </InfoCard>
              <InfoCard label="Learning Spaces AC" helpKey="acCoverage">
                {formatPct(school.acCoverage)}
              </InfoCard>
              <InfoCard
                label="Building Square Footage"
                helpKey="buildingSquareFootage"
              >
                {formatSqFt(school.buildingSquareFootage)}
              </InfoCard>
            </div>
          </div>
          <div>
            <SectionTitle helpKey="academicPrograms">
              Academic & Programs
            </SectionTitle>
            <div className="space-y-2">
              <div className="rounded-md bg-sky-50 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-sky-800">
                    WI DPI Report Card
                    <MetricHelpTip helpKey="academicPerformance" />
                  </span>
                  <span className="text-sm font-bold text-sky-950">
                    {formatNum(school.academicPerformance, 1)}/100
                  </span>
                </div>
                <ProgressBar pct={school.academicPerformance} />
              </div>
              <InfoCard
                label="# of Specialty Programs/Pathways"
                helpKey="programmaticOfferings"
                caption={
                  school.specialtyProgramNames.length > 0
                    ? school.specialtyProgramNames.join(', ')
                    : undefined
                }
              >
                {formatNum(school.programmaticOfferings, 1)}
              </InfoCard>
              <InfoCard
                label="Special Ed Programs"
                helpKey="specialEdProgramCount"
                caption={
                  school.specialEdProgramNames.length > 0
                    ? school.specialEdProgramNames.join(', ')
                    : undefined
                }
              >
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-sky-200 px-1.5 text-xs font-bold text-sky-950">
                  {formatNum(school.specialEdProgramCount)}
                </span>
              </InfoCard>
              <InfoCard label="ELL Students" helpKey="ellStudents">
                {formatPct(ellPct)}
              </InfoCard>
            </div>
          </div>
          <div>
            <SectionTitle helpKey="enrollmentCapacity">
              Students & Capacity
            </SectionTitle>
            <div className="space-y-2">
              <InfoCard label="SY24-25 Enrollment" helpKey="currentEnrollment">
                {formatNum(school.currentEnrollment)}
              </InfoCard>
              <InfoCard label="Building Capacity" helpKey="buildingCapacity">
                {formatNum(school.buildingCapacity)}
              </InfoCard>
              <InfoCard label="Available Capacity" helpKey="availableCapacity">
                {seats == null ? '—' : formatNum(seats)}
              </InfoCard>
              <InfoCard
                label="10-yr Projected Utilization"
                helpKey="projectedUtilization10yr"
              >
                {formatPct(school.projectedUtilization10yr)}
              </InfoCard>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
