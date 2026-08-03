import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Search, X } from 'lucide-react'
import {
  STRATEGY_GROUPS,
  STRATEGY_GROUP_MAP,
  formatMilesPhrase,
  type DecisionThresholds,
} from '../config/strategyGroups'
import {
  UTILIZATION_BANDS,
  utilizationBandFor,
  type UtilizationBandId,
} from '../config/utilizationBands'
import { hasMapCoordinates } from '../lib/loadSchoolsFromSheets'
import type {
  ClassificationResult,
  SchoolCollection,
  SchoolProperties,
  StrategyGroupId,
} from '../types/school'
import { SchoolProfilePanel } from './SchoolProfilePanel'
import { MetricHelpTip } from './MetricHelpTip'

export type MapViewMode = 'compare' | 'understand'

interface InteractiveMapProps {
  collection: SchoolCollection
  schools: SchoolProperties[]
  classifications: ClassificationResult[]
  thresholds: DecisionThresholds
  /** Remount / resize when this tab is visible */
  active: boolean
  /** compare = strategy colors + multi-select; understand = utilization colors + single-select */
  mode?: MapViewMode
}

const MAX_COMPARE = 4

function detailFields(thresholds: DecisionThresholds): {
  key: keyof SchoolProperties
  label: string
  percent?: boolean
}[] {
  return [
    { key: 'address', label: 'Address' },
    { key: 'boardDistrict', label: 'Board District' },
    { key: 'gradeBand', label: 'Grade Band' },
    { key: 'utilizationRate', label: 'Utilization Rate', percent: true },
    {
      key: 'projectedUtilization10yr',
      label: '10-yr Projected Utilization',
      percent: true,
    },
    {
      key: 'enrollmentGrowth5yrPct',
      label: 'Enrollment Growth (5yr)',
      percent: true,
    },
    { key: 'buildingScore', label: 'Building Score' },
    { key: 'programmaticOfferings', label: 'Programmatic Offerings' },
    { key: 'specialtyProgramNames', label: 'Specialty Programs Offered' },
    {
      key: 'nearbyCapacityAvailable',
      label: `Nearby Capacity Available (within ${formatMilesPhrase(thresholds.nearbyCapacityMiles)})`,
    },
    { key: 'siteExpansionCapacity', label: 'Site Expansion Capacity' },
    {
      key: 'nearUnderutilizedSchool',
      label: `Near Underutilized School (within ${formatMilesPhrase(thresholds.nearUnderutilizedMiles)})`,
    },
    {
      key: 'studentsInAttendanceArea',
      label: 'Students from Attendance Area',
      percent: true,
    },
    {
      key: 'economicDisadvantageRate',
      label: 'Economic Disadvantage Rate',
      percent: true,
    },
    { key: 'academicPerformance', label: 'Academic Performance' },
    { key: 'pre1978LeadRisk', label: 'Pre-1978 Lead Risk' },
    { key: 'adaAccessible', label: 'ADA Accessible' },
    { key: 'acCoverage', label: 'AC Coverage', percent: true },
    { key: 'fci', label: 'Facility Condition Index (FCI)' },
    { key: 'energyUseIntensity', label: 'Energy Use Intensity' },
    { key: 'specialtyProgramCount', label: 'Specialty Program Count' },
    {
      key: 'belowRegionalSpecialtyMedian',
      label: 'Fewer Specialty Programs than Regional Median',
    },
    { key: 'nonMpsSchoolsWithin1Mile', label: 'Non-MPS Schools Within 1 Mile' },
    { key: 'specialEdProgramCount', label: 'Special Ed Program Count' },
    { key: 'specialEdProgramNames', label: 'Special Ed Programs Offered' },
    { key: 'overutilizedMpsWithin1Mile', label: 'Overutilized MPS Within 1 Mile' },
  ]
}

function formatValue(value: unknown, percent = false): string {
  if (value === undefined || value === null || value === '') return '—'
  if (Array.isArray(value)) {
    return value.length === 0 ? '—' : value.map(String).join(', ')
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') {
    const n = Number.isInteger(value) ? String(value) : value.toFixed(1)
    return percent ? `${n}%` : n
  }
  return percent ? `${value}%` : String(value)
}

function isEmptyValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0
  return value === undefined || value === null || value === ''
}

type FieldQuality = 'ok' | 'missing' | 'constant'

function analyzeFieldQuality(
  schools: SchoolProperties[],
  key: keyof SchoolProperties,
): FieldQuality {
  if (schools.length === 0) return 'missing'
  const values = schools.map((s) => s[key])
  if (values.every(isEmptyValue)) return 'missing'
  const tokens = values.map((v) =>
    isEmptyValue(v) ? '__empty__' : JSON.stringify(v),
  )
  return new Set(tokens).size <= 1 ? 'constant' : 'ok'
}

const ALL_GROUP_IDS = STRATEGY_GROUPS.map((g) => g.id)
const ALL_BAND_IDS = UTILIZATION_BANDS.map((b) => b.id)

/** Milwaukee metro framing — midway between the first default and the north nudge. */
const DEFAULT_MAP_BOUNDS: L.LatLngBoundsExpression = [
  [42.96, -88.075],
  [43.145, -87.855],
]

function toLegendTitleCase(label: string): string {
  const idx = label.indexOf(':')
  const prefix = idx >= 0 ? label.slice(0, idx).trim() : ''
  const rest = (idx >= 0 ? label.slice(idx + 1) : label).trim()
  const titled = rest
    .toLowerCase()
    .split(/(\s+|\/|&|-)/)
    .map((part) => {
      if (
        !part ||
        /^\s+$/.test(part) ||
        part === '/' ||
        part === '&' ||
        part === '-'
      ) {
        return part
      }
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join('')
  return prefix ? `${prefix}: ${titled}` : titled
}

function applyDefaultExtents(map: L.Map) {
  map.fitBounds(DEFAULT_MAP_BOUNDS, { animate: false })
}

function toggleMultiSelection(
  prev: string[],
  schoolId: string,
  max: number,
): string[] {
  if (prev.includes(schoolId)) {
    return prev.filter((id) => id !== schoolId)
  }
  if (prev.length >= max) return prev
  return [...prev, schoolId]
}

function toggleSingleSelection(prev: string[], schoolId: string): string[] {
  if (prev.includes(schoolId)) return []
  return [schoolId]
}

export function InteractiveMap({
  collection,
  schools,
  classifications,
  thresholds,
  active,
  mode = 'compare',
}: InteractiveMapProps) {
  const isUnderstand = mode === 'understand'
  const maxSelection = isUnderstand ? 1 : MAX_COMPARE

  const mapElRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const defaultExtentsAppliedRef = useRef(false)
  const searchWrapRef = useRef<HTMLDivElement>(null)
  const selectedIdsRef = useRef<string[]>([])

  const [enabledGroups, setEnabledGroups] = useState<Set<StrategyGroupId>>(
    () => new Set(ALL_GROUP_IDS),
  )
  const [enabledBands, setEnabledBands] = useState<Set<UtilizationBandId>>(
    () => new Set(ALL_BAND_IDS),
  )
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [selectionHint, setSelectionHint] = useState<string | null>(null)

  selectedIdsRef.current = selectedSchoolIds

  const fields = useMemo(() => detailFields(thresholds), [thresholds])

  const classificationById = useMemo(() => {
    const map = new Map<string, ClassificationResult>()
    for (const c of classifications) map.set(c.schoolId, c)
    return map
  }, [classifications])

  const schoolById = useMemo(() => {
    const map = new Map<string, SchoolProperties>()
    for (const s of schools) map.set(s.schoolId, s)
    return map
  }, [schools])

  const mappableFeatures = useMemo(
    () => collection.features.filter(hasMapCoordinates),
    [collection],
  )

  const selectedSchools = useMemo(
    () =>
      selectedSchoolIds
        .map((id) => schoolById.get(id))
        .filter((s): s is SchoolProperties => Boolean(s)),
    [selectedSchoolIds, schoolById],
  )

  const fieldQualityByKey = useMemo(() => {
    const map = new Map<keyof SchoolProperties, FieldQuality>()
    for (const { key } of fields) {
      map.set(key, analyzeFieldQuality(schools, key))
    }
    return map
  }, [schools, fields])

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []

    const rankMatch = (school: (typeof schools)[number]): number | null => {
      const name = school.schoolName.toLowerCase()
      const id = school.schoolId.toLowerCase()
      if (name === q) return 0
      if (name.startsWith(q)) return 1
      const words = name.split(/[^a-z0-9]+/).filter(Boolean)
      if (words.some((w) => w.startsWith(q))) return 2
      const nameIdx = name.indexOf(q)
      if (nameIdx >= 0) return 3 + nameIdx / 1000
      if (id === q || id.startsWith(q)) return 10
      if (id.includes(q)) return 11
      return null
    }

    return schools
      .map((school) => ({ school, rank: rankMatch(school) }))
      .filter(
        (row): row is { school: (typeof schools)[number]; rank: number } =>
          row.rank !== null,
      )
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank
        return a.school.schoolName.localeCompare(b.school.schoolName)
      })
      .slice(0, 12)
      .map((row) => row.school)
  }, [schools, searchQuery])

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (!searchWrapRef.current?.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  const selectOrToggleSchool = (schoolId: string) => {
    setSelectedSchoolIds((prev) => {
      if (isUnderstand) {
        setSelectionHint(null)
        return toggleSingleSelection(prev, schoolId)
      }
      if (prev.includes(schoolId)) {
        setSelectionHint(null)
        return prev.filter((id) => id !== schoolId)
      }
      if (prev.length >= maxSelection) {
        setSelectionHint(
          `You can compare up to ${maxSelection} schools at a time. Clear one to add another.`,
        )
        return prev
      }
      setSelectionHint(null)
      return [...prev, schoolId]
    })
  }

  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return

    const map = L.map(mapElRef.current, {
      center: [43.0389, -87.9065],
      zoom: 11,
      zoomControl: true,
    })

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      },
    ).addTo(map)

    const layer = L.layerGroup().addTo(map)
    mapRef.current = map
    layerRef.current = layer
    defaultExtentsAppliedRef.current = false

    return () => {
      map.remove()
      mapRef.current = null
      layerRef.current = null
      defaultExtentsAppliedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!active || !mapRef.current) return
    const map = mapRef.current
    const refresh = () => {
      map.invalidateSize()
      if (!defaultExtentsAppliedRef.current) {
        applyDefaultExtents(map)
        defaultExtentsAppliedRef.current = true
      }
    }
    const t1 = window.setTimeout(refresh, 50)
    const t2 = window.setTimeout(refresh, 250)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [active])

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return

    layer.clearLayers()
    const selectedSet = new Set(selectedSchoolIds)

    for (const feature of mappableFeatures) {
      const props = feature.properties
      const band = utilizationBandFor(props.utilizationRate)
      const classification = classificationById.get(props.schoolId)
      const groupId = classification?.groupId ?? '3'
      const color = isUnderstand
        ? band.color
        : STRATEGY_GROUP_MAP[groupId].color
      const muted = isUnderstand
        ? !enabledBands.has(band.id)
        : !enabledGroups.has(groupId)
      const [lng, lat] = feature.geometry.coordinates
      const selected = selectedSet.has(props.schoolId)

      const marker = L.circleMarker([lat, lng], {
        radius: selected ? 10 : 7,
        color: selected ? '#111827' : color,
        weight: selected ? 2.5 : 1.5,
        fillColor: color,
        fillOpacity: muted ? 0.18 : 0.85,
        opacity: muted ? 0.35 : 1,
      })

      const tooltipBody = isUnderstand
        ? `<div style="line-height:1.35;font-family:var(--font-sans),Inter,Segoe UI,system-ui,sans-serif">
          <strong>${escapeHtml(props.schoolName)}</strong><br/>
          Utilization: ${formatValue(props.utilizationRate, true)}<br/>
          ${escapeHtml(band.label)}<br/>
          Building Score: ${formatValue(props.buildingScore)}<br/>
          Programmatic Offerings: ${formatValue(props.programmaticOfferings)}
        </div>`
        : `<div style="line-height:1.35;font-family:var(--font-sans),Inter,Segoe UI,system-ui,sans-serif">
          <strong>${escapeHtml(props.schoolName)}</strong><br/>
          Strategy Group: ${escapeHtml(toLegendTitleCase(STRATEGY_GROUP_MAP[groupId].label))}<br/>
          Utilization: ${formatValue(props.utilizationRate, true)}<br/>
          Building Score: ${formatValue(props.buildingScore)}<br/>
          Programmatic Offerings: ${formatValue(props.programmaticOfferings)}
        </div>`

      marker.bindTooltip(tooltipBody, {
        sticky: true,
        opacity: 0.95,
        className: 'mps-map-tooltip',
      })

      marker.on('click', () => {
        const next = isUnderstand
          ? toggleSingleSelection(selectedIdsRef.current, props.schoolId)
          : toggleMultiSelection(
              selectedIdsRef.current,
              props.schoolId,
              maxSelection,
            )
        if (
          !isUnderstand &&
          next.length === selectedIdsRef.current.length &&
          !selectedIdsRef.current.includes(props.schoolId)
        ) {
          setSelectionHint(
            `You can compare up to ${maxSelection} schools at a time. Clear one to add another.`,
          )
          return
        }
        setSelectionHint(null)
        setSelectedSchoolIds(next)
      })

      marker.addTo(layer)
    }
  }, [
    mappableFeatures,
    classificationById,
    enabledGroups,
    enabledBands,
    selectedSchoolIds,
    isUnderstand,
    maxSelection,
  ])

  const allGroupsOn = enabledGroups.size === ALL_GROUP_IDS.length
  const allBandsOn = enabledBands.size === ALL_BAND_IDS.length

  const toggleGroup = (id: StrategyGroupId) => {
    setEnabledGroups((prev) => {
      if (prev.size === ALL_GROUP_IDS.length) {
        return new Set<StrategyGroupId>([id])
      }
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleBand = (id: UtilizationBandId) => {
    setEnabledBands((prev) => {
      if (prev.size === ALL_BAND_IDS.length) {
        return new Set<UtilizationBandId>([id])
      }
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = () => {
    setSelectedSchoolIds([])
    setSelectionHint(null)
  }

  const removeSchool = (schoolId: string) => {
    setSelectedSchoolIds((prev) => prev.filter((id) => id !== schoolId))
    setSelectionHint(null)
  }

  const searchInputId = isUnderstand
    ? 'understand-school-search'
    : 'map-school-search'

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="shrink-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <h2 className="shrink-0 whitespace-nowrap pt-1 text-xl font-bold text-mps-blue">
            {isUnderstand
              ? 'Understand School-Level Data'
              : 'Compare Schools on the Map'}
          </h2>
          <div className="w-fit max-w-full rounded-lg border border-mps-blue-border bg-mps-blue-soft px-3 py-2.5 text-sm leading-snug text-mps-text">
            {isUnderstand
              ? 'This map displays all schools color-coded by utilization. Click a school on the map or use search to view its attributes.'
              : `This map displays all schools color-coded by their recommended strategy group. Click schools on the map or use search to select up to ${MAX_COMPARE} schools and compare them side by side.`}
          </div>
        </div>
        {selectionHint && (
          <p className="mt-2 text-xs font-medium text-amber-800">{selectionHint}</p>
        )}
      </header>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-stretch">
        <div className="flex min-h-0 flex-col gap-2">
          <div
            ref={mapElRef}
            className="h-[min(42vh,380px)] w-full overflow-hidden rounded-md border border-mps-gray-border lg:h-auto lg:min-h-0 lg:flex-1"
          />

          <div className="flex shrink-0 flex-wrap gap-1.5">
            {isUnderstand
              ? UTILIZATION_BANDS.map((band) => {
                  const on = enabledBands.has(band.id)
                  const title = allBandsOn
                    ? 'Show only this utilization band'
                    : on
                      ? 'Click to mute band'
                      : 'Click to show band at full opacity'
                  return (
                    <button
                      key={band.id}
                      type="button"
                      onClick={() => toggleBand(band.id)}
                      className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-left text-[11px] font-semibold transition ${
                        on
                          ? 'border-mps-gray-border bg-white text-mps-text'
                          : 'border-mps-gray-border bg-mps-gray text-mps-muted'
                      }`}
                      title={title}
                    >
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor: band.color,
                          opacity: on ? 1 : 0.35,
                        }}
                      />
                      {band.label}
                    </button>
                  )
                })
              : STRATEGY_GROUPS.map((group) => {
                  const on = enabledGroups.has(group.id)
                  const title = allGroupsOn
                    ? 'Show only this group'
                    : on
                      ? 'Click to mute group'
                      : 'Click to show group at full opacity'
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                      className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-left text-[11px] font-semibold transition ${
                        on
                          ? 'border-mps-gray-border bg-white text-mps-text'
                          : 'border-mps-gray-border bg-mps-gray text-mps-muted'
                      }`}
                      title={title}
                    >
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor: group.color,
                          opacity: on ? 1 : 0.35,
                        }}
                      />
                      {toLegendTitleCase(group.label)}
                    </button>
                  )
                })}
            <button
              type="button"
              onClick={() =>
                isUnderstand
                  ? setEnabledBands(new Set(ALL_BAND_IDS))
                  : setEnabledGroups(new Set(ALL_GROUP_IDS))
              }
              disabled={isUnderstand ? allBandsOn : allGroupsOn}
              className="rounded-md border border-mps-gray-border bg-white px-2 py-1 text-[11px] font-semibold text-mps-text transition hover:bg-mps-gray/50 disabled:cursor-default disabled:opacity-40"
              title={isUnderstand ? 'Show all utilization bands' : 'Show all strategy groups'}
            >
              Show all
            </button>
            <button
              type="button"
              onClick={() =>
                isUnderstand
                  ? setEnabledBands(new Set())
                  : setEnabledGroups(new Set())
              }
              disabled={
                isUnderstand
                  ? enabledBands.size === 0
                  : enabledGroups.size === 0
              }
              className="rounded-md border border-mps-gray-border bg-white px-2 py-1 text-[11px] font-semibold text-mps-text transition hover:bg-mps-gray/50 disabled:cursor-default disabled:opacity-40"
              title={
                isUnderstand
                  ? 'Mute all utilization bands'
                  : 'Mute all strategy groups'
              }
            >
              Hide all
            </button>
          </div>
        </div>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-md border border-mps-gray-border bg-white max-lg:max-h-[45vh]">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-mps-gray-border px-3 py-2.5">
            <div className="min-w-0 flex-1 basis-[min(100%,16rem)]">
              {isUnderstand && selectedSchools[0] ? (
                <>
                  <h3 className="text-lg font-bold leading-snug text-mps-blue sm:text-xl">
                    {selectedSchools[0].schoolName}
                  </h3>
                  <p className="mt-0.5 text-xs text-mps-muted sm:text-sm">
                    {[
                      selectedSchools[0].boardDistrict?.trim()
                        ? selectedSchools[0].boardDistrict.replace(
                            /^district\s*/i,
                            'District ',
                          )
                        : null,
                      selectedSchools[0].gradeBand?.trim() || null,
                      Number.isFinite(selectedSchools[0].currentEnrollment)
                        ? `${Math.round(selectedSchools[0].currentEnrollment)} Students`
                        : null,
                      selectedSchools[0].buildingCapacity != null &&
                      Number.isFinite(selectedSchools[0].buildingCapacity)
                        ? `${Math.round(selectedSchools[0].buildingCapacity)} Capacity`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' | ') || '—'}
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-sm font-bold text-mps-blue">
                    {selectedSchools.length === 0
                      ? isUnderstand
                        ? 'School details'
                        : 'School comparison'
                      : selectedSchools.length === 1
                        ? 'School details'
                        : `Comparing ${selectedSchools.length} schools`}
                  </h3>
                  <p className="text-xs text-mps-muted">
                    {selectedSchools.length === 0
                      ? isUnderstand
                        ? 'Select a school on the map or search below'
                        : `Select up to ${MAX_COMPARE} schools on the map or search below`
                      : `${selectedSchools.length} of ${MAX_COMPARE} selected · click a marker again or use ✕ to remove`}
                  </p>
                </>
              )}
            </div>

            <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:max-w-md">
              <div ref={searchWrapRef} className="relative min-w-0 flex-1">
                <label className="sr-only" htmlFor={searchInputId}>
                  Search schools
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-mps-muted" />
                  <input
                    id={searchInputId}
                    type="search"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      setSearchOpen(true)
                    }}
                    onFocus={() => setSearchOpen(true)}
                    placeholder="Search schools…"
                    className="w-full rounded-md border border-mps-gray-border bg-white py-1.5 pr-3 pl-8 text-xs outline-none focus:border-mps-blue sm:text-sm"
                  />
                </div>
                {searchOpen && searchQuery.trim() && (
                  <ul className="absolute right-0 z-30 mt-1 max-h-64 w-[min(100%,20rem)] overflow-auto rounded-md border border-mps-gray-border bg-white shadow-lg">
                    {searchResults.length === 0 ? (
                      <li className="px-3 py-2 text-xs text-mps-muted">
                        No schools match “{searchQuery.trim()}”.
                      </li>
                    ) : (
                      searchResults.map((school) => {
                        const selected = selectedSchoolIds.includes(
                          school.schoolId,
                        )
                        const group = classificationById.get(school.schoolId)
                        const band = utilizationBandFor(school.utilizationRate)
                        return (
                          <li key={school.schoolId}>
                            <button
                              type="button"
                              onClick={() => {
                                selectOrToggleSchool(school.schoolId)
                                setSearchQuery('')
                                setSearchOpen(false)
                              }}
                              className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition hover:bg-mps-blue-soft ${
                                selected ? 'bg-mps-blue-soft/70' : ''
                              }`}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium text-mps-text">
                                  {school.schoolName}
                                </span>
                                <span className="block text-xs text-mps-muted">
                                  {isUnderstand
                                    ? band.label
                                    : group
                                      ? toLegendTitleCase(
                                          STRATEGY_GROUP_MAP[group.groupId]
                                            .label,
                                        )
                                      : '\u00a0'}
                                </span>
                              </span>
                              <span className="shrink-0 text-[11px] font-semibold text-mps-blue">
                                {selected
                                  ? 'Remove'
                                  : isUnderstand
                                    ? 'Select'
                                    : 'Add'}
                              </span>
                            </button>
                          </li>
                        )
                      })
                    )}
                  </ul>
                )}
              </div>
              {selectedSchools.length > 0 && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="shrink-0 text-xs font-semibold whitespace-nowrap text-mps-muted hover:text-mps-blue"
                >
                  {isUnderstand ? 'Clear' : 'Clear all'}
                </button>
              )}
            </div>
          </div>

          {selectedSchools.length > 0 ? (
            isUnderstand ? (
              <SchoolProfilePanel
                school={selectedSchools[0]}
                schools={schools}
              />
            ) : (
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full min-w-[28rem] text-left text-xs">
                  <thead className="sticky top-0 z-10 border-b border-mps-gray-border bg-mps-gray">
                    <tr>
                      <th className="px-3 py-2 font-semibold text-mps-muted">
                        Field
                      </th>
                      {selectedSchools.map((school) => {
                        const group = classificationById.get(school.schoolId)
                        const meta = group
                          ? STRATEGY_GROUP_MAP[group.groupId]
                          : undefined
                        return (
                          <th
                            key={school.schoolId}
                            className="min-w-[8.5rem] px-3 py-2 font-semibold text-mps-text"
                            style={
                              meta
                                ? {
                                    boxShadow: `inset 0 3px 0 0 ${meta.color}`,
                                  }
                                : undefined
                            }
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate font-bold text-mps-blue">
                                  {school.schoolName}
                                </div>
                                {meta ? (
                                  <div
                                    className="truncate text-[11px] font-semibold"
                                    style={{ color: meta.color }}
                                  >
                                    {meta.id}: {meta.shortLabel}
                                  </div>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                onClick={() => removeSchool(school.schoolId)}
                                className="shrink-0 rounded p-0.5 text-mps-muted hover:bg-white hover:text-mps-text"
                                aria-label={`Remove ${school.schoolName}`}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-mps-gray-border">
                      <td className="px-3 py-1.5 font-medium text-mps-text">
                        Strategy Group
                      </td>
                      {selectedSchools.map((school) => {
                        const group = classificationById.get(school.schoolId)
                        const meta = group
                          ? STRATEGY_GROUP_MAP[group.groupId]
                          : undefined
                        return (
                          <td
                            key={school.schoolId}
                            className="px-3 py-1.5 text-mps-text"
                          >
                            {meta ? (
                              <span
                                className="inline-flex max-w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] font-semibold text-white"
                                style={{ backgroundColor: meta.color }}
                                title={toLegendTitleCase(meta.label)}
                              >
                                <span className="truncate">
                                  {toLegendTitleCase(meta.label)}
                                </span>
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                        )
                      })}
                    </tr>
                    {fields.map(({ key, label, percent }) => {
                      const quality = fieldQualityByKey.get(key) ?? 'ok'
                      const flagged = quality !== 'ok'
                      return (
                        <tr
                          key={key}
                          className={`border-b border-mps-gray-border last:border-b-0 ${
                            flagged ? 'bg-mps-gray/40 text-mps-muted' : ''
                          }`}
                        >
                          <td className="px-3 py-1.5 font-medium whitespace-nowrap text-mps-text">
                            <span className="inline-flex flex-wrap items-center gap-1.5">
                              {label}
                              <MetricHelpTip helpKey={key} side="right" />
                              {quality === 'missing' && (
                                <span
                                  className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold tracking-wide text-amber-900 uppercase"
                                  title="No value for any loaded school (field not populated from the sheet)"
                                >
                                  Not available
                                </span>
                              )}
                              {quality === 'constant' && (
                                <span
                                  className="rounded bg-slate-200 px-1 py-0.5 text-[10px] font-semibold tracking-wide text-slate-700 uppercase"
                                  title="Same value for every loaded school"
                                >
                                  No variation
                                </span>
                              )}
                            </span>
                          </td>
                          {selectedSchools.map((school) => (
                            <td
                              key={school.schoolId}
                              className={`px-3 py-1.5 ${
                                flagged ? 'text-mps-muted' : 'text-mps-text'
                              } ${
                                key === 'specialtyProgramNames' ||
                                key === 'specialEdProgramNames'
                                  ? 'max-w-[14rem] whitespace-normal'
                                  : ''
                              }`}
                            >
                              {formatValue(school[key], percent)}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <div className="flex flex-1 items-center justify-center px-6 py-10 text-center">
              <p className="max-w-sm text-sm text-mps-muted">
                {isUnderstand
                  ? 'Select a school on the map or from search to view detailed information here.'
                  : `Select up to ${MAX_COMPARE} schools on the map or from search to compare detailed information here.`}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
