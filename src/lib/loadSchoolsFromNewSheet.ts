import {
  NEW_SHEET_FIELDS,
  NEW_SHEET_RACE_FIELDS,
  type NewSheetFieldSpec,
  type NewSheetTabKey,
} from '../config/newSheetFieldMap'
import {
  DEFAULT_THRESHOLDS,
  type DecisionThresholds,
} from '../config/strategyGroups'
import type { SchoolCollection, SchoolFeature, SchoolProperties } from '../types/school'
import { formatGradeBand, roundBuildingScore } from './formatters'
import {
  NEW_LRFMP_SHEET_ID,
  NEW_SHEET_NAMES,
  cellString,
  fetchSheetTable,
  isBlankOrErrorCell,
  type GvizRow,
} from './googleSheets'
import {
  formatBoardDistrict,
  formatSchoolId,
  loadOldWorkbookSchools,
  normalizeDpiCode,
  normalizeRaceEthnicityLabel,
  parseGrowthCapacity,
  parseNumber,
  parsePercent,
  parseReportCardScore,
  parseYes,
  siteKeyFromSchoolId,
} from './loadSchoolsFromSheets'
import {
  findColumnIndex,
  resolveNewSheetColumns,
} from './resolveNewSheetColumns'
import {
  SPECIALTY_PROGRAM_COLUMNS,
  SPECIAL_ED_PROGRAM_COLUMNS,
  isProgramOffered,
  type ProgramColumnSpec,
} from '../config/programOfferings'
import {
  computeProximityFlags,
  parseDistanceMatrix,
  type DistanceRuntime,
} from './schoolDistances'
import type { FallbackFieldInfo, SheetSourceId } from './sheetSources'

export interface LoadSchoolsResult {
  collection: SchoolCollection
  fallbackFields: FallbackFieldInfo[]
  source: SheetSourceId
  /** Present when New sheet loaded a usable SchoolToSchoolDistances matrix. */
  distanceRuntime: DistanceRuntime | null
}

/**
 * Detect "date last accessed" stamp rows (often sheet row 2/3 with 7/21/26).
 * Google Sheets may send those cells as formatted strings, gviz Date(...)
 * literals, or numeric Excel/Sheets serial dates.
 */
function looksLikeDateStamp(value: string): boolean {
  const s = value.trim()
  if (!s) return false
  if (/^date(\s+last\s+accessed)?\b/i.test(s)) return true
  if (/^Date\(\s*\d{4}\s*,\s*\d{1,2}\s*,\s*\d{1,2}/i.test(s)) return true
  if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(s)) return true
  return false
}

function cellDisplay(row: GvizRow, index: number): string {
  const cell = row.c?.[index]
  if (!cell) return ''
  const formatted = cell.f != null ? String(cell.f).trim() : ''
  if (formatted) return formatted
  return cellString(row, index)
}

/** MPS Site IDs in these workbooks are small; ~1980+ date serials are > 29000. */
function looksLikeDateSerial(site: string): boolean {
  const n = Number(site)
  return Number.isFinite(n) && n > 10000
}

function isDataSiteRow(row: GvizRow, nameColIndex: number): boolean {
  const site = cellString(row, 0)
  const name =
    nameColIndex >= 0
      ? cellDisplay(row, nameColIndex)
      : cellDisplay(row, 3) || cellDisplay(row, 4)
  if (!site || !name) return false
  if (/site|uniqueid|school name|official/i.test(name)) return false
  if (looksLikeDateStamp(name) || looksLikeDateStamp(site)) return false
  if (looksLikeDateSerial(site)) return false
  if (!/^\d+(\.0+)?$/.test(site) && Number.isNaN(Number(site))) return false
  return true
}

function indexBySite(
  table: { rows: GvizRow[] },
  nameColIndex: number,
): Map<string, GvizRow> {
  const map = new Map<string, GvizRow>()
  for (const row of table.rows) {
    if (!isDataSiteRow(row, nameColIndex)) continue
    const site = String(Number(cellString(row, 0)))
    if (!map.has(site)) map.set(site, row)
  }
  return map
}

/**
 * Index pivot / projection rows by Unique ID (hex), not Site.
 */
function indexByUniqueId(
  table: { rows: GvizRow[] },
  uniqueIdColIndex = 0,
): Map<string, GvizRow> {
  const map = new Map<string, GvizRow>()
  for (const row of table.rows) {
    const id = cellString(row, uniqueIdColIndex).toLowerCase().trim()
    if (!id || id.length < 4) continue
    if (!map.has(id)) map.set(id, row)
  }
  return map
}

function readCellAt(
  row: GvizRow | undefined,
  colIndex: number,
): { v: string | number | boolean | null; f: string | null; missing: boolean } {
  if (!row || colIndex < 0) return { v: null, f: null, missing: true }
  const cell = row.c?.[colIndex]
  const v = cell?.v ?? null
  const f = cell?.f ?? null
  // Prefer a non-blank v; otherwise use formatted f (text in numeric columns).
  const vBlank =
    v === null ||
    v === undefined ||
    (typeof v === 'string' && !String(v).trim())
  const effective = vBlank ? f : v
  return { v, f, missing: isBlankOrErrorCell(effective) }
}

function resolveUniqueIdColumn(headers: string[]): number {
  for (const label of ['Unique ID', 'UniqueID', 'Unique Id']) {
    const { index } = findColumnIndex(headers, label)
    if (index >= 0) return index
  }
  return -1
}

function noteFallback(
  list: FallbackFieldInfo[],
  seen: Set<string>,
  info: FallbackFieldInfo,
) {
  if (seen.has(info.key)) return
  seen.add(info.key)
  list.push(info)
}

function emptyRace(): Record<string, number> {
  return {}
}

function toFeature(props: SchoolProperties): SchoolFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [0, 0] },
    properties: props,
  }
}

/**
 * Load schools from the new workbook using the in-app field map
 * (`config/newSheetFieldMap.ts`). Columns are resolved by matching header
 * **labels** on each tab (not fixed Excel letters). Only rows with School and
 * Site Info “Include in Evaluation” = Y are loaded (new sheet only — never
 * legacy 1.1 Evaluate). Unmapped, blank/#REF!, or missing-header fields fall
 * back to the old workbook for other attributes. Distance-based proximity
 * fields are recomputed from SchoolToSchoolDistances when available.
 */
export async function loadNewWorkbookSchools(
  thresholds: DecisionThresholds = DEFAULT_THRESHOLDS,
): Promise<LoadSchoolsResult> {
  const [
    siteTable,
    enrollmentTable,
    enrollmentSumsTable,
    programTable,
    buildingTable,
    distancesTable,
    oldCollection,
  ] = await Promise.all([
    fetchSheetTable(NEW_SHEET_NAMES.siteInfo, NEW_LRFMP_SHEET_ID),
    fetchSheetTable(NEW_SHEET_NAMES.enrollment, NEW_LRFMP_SHEET_ID),
    fetchSheetTable(NEW_SHEET_NAMES.enrollmentSums, NEW_LRFMP_SHEET_ID),
    fetchSheetTable(NEW_SHEET_NAMES.program, NEW_LRFMP_SHEET_ID),
    fetchSheetTable(NEW_SHEET_NAMES.building, NEW_LRFMP_SHEET_ID),
    fetchSheetTable(NEW_SHEET_NAMES.distances, NEW_LRFMP_SHEET_ID),
    loadOldWorkbookSchools(),
  ])

  const tables = {
    siteInfo: siteTable,
    enrollment: enrollmentTable,
    enrollmentSums: enrollmentSumsTable,
    program: programTable,
    building: buildingTable,
  }
  const { byKey: resolvedCols, issues: headerIssues, headersByTab } =
    resolveNewSheetColumns(tables)

  const nameColForTab = (tab: NewSheetTabKey): number => {
    // Site Info uses preferred (E); other tabs typically have Official (D).
    const labels = [
      NEW_SHEET_FIELDS.schoolName.label,
      ...(NEW_SHEET_FIELDS.schoolName.aliases ?? []),
    ]
    for (const label of labels) {
      const { index } = findColumnIndex(headersByTab[tab], label)
      if (index >= 0) return index
    }
    return 3
  }

  const siteBySite = indexBySite(siteTable, nameColForTab('siteInfo'))
  const enrollBySite = indexBySite(enrollmentTable, nameColForTab('enrollment'))
  const programBySite = indexBySite(programTable, nameColForTab('program'))
  const buildingBySite = indexBySite(buildingTable, nameColForTab('building'))
  const enrollmentSumsByUniqueId = indexByUniqueId(
    enrollmentSumsTable,
    (() => {
      const pivotUid = resolveUniqueIdColumn(headersByTab.enrollmentSums)
      return pivotUid >= 0 ? pivotUid : 1
    })(),
  )
  const currentEnrollmentCol =
    resolvedCols.get(NEW_SHEET_FIELDS.currentEnrollment.key)?.index ?? -1
  const enrollmentFiveYearsAgoCol =
    resolvedCols.get(NEW_SHEET_FIELDS.enrollmentFiveYearsAgo.key)?.index ?? -1
  const uniqueIdCol = resolveUniqueIdColumn(headersByTab.siteInfo)
  const programHeaders = headersByTab.program
  const resolveProgramCols = (specs: ProgramColumnSpec[]) =>
    specs
      .map((spec) => {
        const { index } = findColumnIndex(programHeaders, spec.label)
        return index >= 0 ? { index, displayName: spec.displayName } : null
      })
      .filter((x): x is { index: number; displayName: string } => Boolean(x))
  const specialtyProgramCols = resolveProgramCols(SPECIALTY_PROGRAM_COLUMNS)
  const specialEdProgramCols = resolveProgramCols(SPECIAL_ED_PROGRAM_COLUMNS)

  const collectOfferedPrograms = (
    site: string,
    cols: { index: number; displayName: string }[],
  ): string[] => {
    const row = programBySite.get(site)
    if (!row) return []
    const names: string[] = []
    for (const col of cols) {
      const cell = readCellAt(row, col.index)
      if (cell.missing) continue
      if (isProgramOffered(cell.v, cell.f)) names.push(col.displayName)
    }
    return names
  }

  const oldBySite = new Map(
    oldCollection.features.map((f) => [
      siteKeyFromSchoolId(f.properties.schoolId),
      f.properties,
    ]),
  )

  const tabRows = (tab: NewSheetTabKey): Map<string, GvizRow> => {
    switch (tab) {
      case 'siteInfo':
        return siteBySite
      case 'enrollment':
        return enrollBySite
      case 'enrollmentSums':
        // Joined by Unique ID in the school loop, not by Site.
        return new Map()
      case 'program':
        return programBySite
      case 'building':
        return buildingBySite
    }
  }

  const fallbackFields: FallbackFieldInfo[] = [...headerIssues]
  const seenFallback = new Set(fallbackFields.map((f) => f.key))
  const headerMismatchKeys = new Set(
    fallbackFields
      .filter((f) => f.reason === 'header-mismatch')
      .map((f) => f.key.replace(/^header:/, '')),
  )
  const mappedFieldStats = new Map<
    string,
    { label: string; ok: number; missing: number }
  >()

  const recordMappedStat = (
    key: string,
    label: string,
    missing: boolean,
  ) => {
    const prev = mappedFieldStats.get(key) ?? { label, ok: 0, missing: 0 }
    if (missing) prev.missing += 1
    else prev.ok += 1
    mappedFieldStats.set(key, prev)
  }

  const getField = (
    site: string,
    spec: NewSheetFieldSpec | undefined,
  ): ReturnType<typeof readCellAt> => {
    if (!spec) {
      return { v: null, f: null, missing: true }
    }
    const resolved = resolvedCols.get(spec.key)
    const colIndex = resolved?.index ?? -1
    const row = tabRows(spec.tab).get(site)
    const cell = readCellAt(row, colIndex)
    recordMappedStat(spec.key, spec.label, cell.missing || colIndex < 0)
    return cell
  }

  const features: SchoolFeature[] = []
  const uniqueIdBySchoolId = new Map<string, string>()

  for (const [site, siteRow] of siteBySite) {
    // Include in Evaluation = Y (new sheet only — never legacy Evaluate).
    const includeSpec = NEW_SHEET_FIELDS.includeInEvaluation
    const includeCol = resolvedCols.get(includeSpec.key)?.index ?? -1
    const includeCell = readCellAt(siteRow, includeCol)
    if (includeCol < 0 || !parseYes(includeCell.v ?? includeCell.f)) continue

    const schoolId = formatSchoolId(site)
    if (!schoolId) continue
    const old = oldBySite.get(site)

    if (uniqueIdCol >= 0) {
      const uniqueId = cellString(siteRow, uniqueIdCol).toLowerCase()
      if (uniqueId) uniqueIdBySchoolId.set(schoolId, uniqueId)
    }

    const nameCell = getField(site, NEW_SHEET_FIELDS.schoolName)
    const schoolName = !nameCell.missing
      ? String(nameCell.v ?? nameCell.f ?? '').trim()
      : (old?.schoolName || '')
    if (!schoolName || looksLikeDateStamp(schoolName)) continue

    const utilCell = getField(site, NEW_SHEET_FIELDS.utilizationRate)
    const utilizationRate = !utilCell.missing
      ? parsePercent(utilCell.v, utilCell.f)
      : (old?.utilizationRate ?? 0)

    const projCell = getField(site, NEW_SHEET_FIELDS.projectedUtilization10yr)
    const projectedUtilization10yr = !projCell.missing
      ? parsePercent(projCell.v, projCell.f)
      : (old?.projectedUtilization10yr ?? 0)

    const gradeCell = getField(site, NEW_SHEET_FIELDS.gradeBand)
    const gradeBandRaw = !gradeCell.missing
      ? String(gradeCell.v ?? gradeCell.f ?? '')
      : (old?.gradeBand ?? '')
    const gradeBand = formatGradeBand(gradeBandRaw) || undefined

    const siteCapCell = getField(site, NEW_SHEET_FIELDS.siteExpansionCapacity)
    const siteExpansionCapacity = !siteCapCell.missing
      ? parseGrowthCapacity(siteCapCell.v)
      : (old?.siteExpansionCapacity ?? false)

    const dpiCell = getField(site, NEW_SHEET_FIELDS.dpiSchoolCode)
    const dpiSchoolCode = !dpiCell.missing
      ? (normalizeDpiCode(dpiCell.v) ?? undefined)
      : old?.dpiSchoolCode

    const addressCell = getField(site, NEW_SHEET_FIELDS.address)
    const address = !addressCell.missing
      ? String(addressCell.v ?? addressCell.f ?? '').trim()
      : old?.address

    const boardCell = getField(site, NEW_SHEET_FIELDS.boardDistrict)
    const boardDistrict = !boardCell.missing
      ? formatBoardDistrict(boardCell.v)
      : (old?.boardDistrict ?? '')

    const leadCell = getField(site, NEW_SHEET_FIELDS.pre1978LeadRisk)
    const pre1978LeadRisk = !leadCell.missing
      ? parseYes(leadCell.v)
      : (old?.pre1978LeadRisk ?? false)

    const adaCell = getField(site, NEW_SHEET_FIELDS.adaAccessible)
    const adaAccessible = !adaCell.missing
      ? parseYes(adaCell.v)
      : (old?.adaAccessible ?? false)

    const nonMpsCell = getField(site, NEW_SHEET_FIELDS.nonMpsSchoolsWithin1Mile)
    const nonMpsSchoolsWithin1Mile = !nonMpsCell.missing
      ? parseYes(nonMpsCell.v)
      : (old?.nonMpsSchoolsWithin1Mile ?? false)

    const academicCell = getField(site, NEW_SHEET_FIELDS.academicPerformance)
    const academicCol = resolvedCols.get(NEW_SHEET_FIELDS.academicPerformance.key)
    let academicPerformance = 0
    let academicPerformanceLabel: string | undefined
    let academicHasNumericScore = false
    // Prefer formatted text (f) when present — gviz often puts ratings like
    // NeedsImprovement in f while v is blank/0 for mixed-type columns.
    const academicRaw = (() => {
      const formatted =
        academicCell.f != null ? String(academicCell.f).trim() : ''
      if (formatted && !/^-?\d+(\.\d+)?%?$/.test(formatted.replace(/,/g, ''))) {
        return formatted
      }
      if (
        typeof academicCell.v === 'string' &&
        academicCell.v.trim() &&
        !/^-?\d+(\.\d+)?%?$/.test(academicCell.v.trim().replace(/,/g, ''))
      ) {
        return academicCell.v.trim()
      }
      if (
        typeof academicCell.v === 'number' &&
        Number.isFinite(academicCell.v)
      ) {
        if (
          academicCell.v === 0 &&
          formatted &&
          !/^-?\d+(\.\d+)?%?$/.test(formatted.replace(/,/g, ''))
        ) {
          return formatted
        }
        // Skip date-serial / meta rows mistaken as scores (e.g. 46224).
        if (academicCell.v > 1000) return null
        return academicCell.v
      }
      if (formatted) return formatted
      if (academicCell.v != null && String(academicCell.v).trim()) {
        return academicCell.v
      }
      return null
    })()
    if (academicCol && academicCol.index >= 0) {
      // Column exists on the new sheet — never invent 0.0/100 from legacy.
      if (academicRaw != null && academicRaw !== '') {
        const parsed = parseReportCardScore(academicRaw)
        academicPerformance = parsed.score
        academicPerformanceLabel = parsed.label
        academicHasNumericScore = parsed.hasNumericScore
      } else {
        academicHasNumericScore = false
      }
    } else if (old?.academicHasNumericScore) {
      academicPerformance = old.academicPerformance ?? 0
      academicHasNumericScore = true
    } else if (old?.academicPerformanceLabel) {
      academicPerformanceLabel = old.academicPerformanceLabel
      academicHasNumericScore = false
    }

    const specialEdCell = getField(site, NEW_SHEET_FIELDS.specialEdProgramCount)
    const specialEdProgramCount = !specialEdCell.missing
      ? parseNumber(specialEdCell.v)
      : (old?.specialEdProgramCount ?? 0)

    const enrollSpec = NEW_SHEET_FIELDS.currentEnrollment
    const fiveYrSpec = NEW_SHEET_FIELDS.enrollmentFiveYearsAgo
    const siteUniqueId =
      uniqueIdCol >= 0
        ? cellString(siteRow, uniqueIdCol).toLowerCase().trim()
        : ''
    const pivotRow = siteUniqueId
      ? enrollmentSumsByUniqueId.get(siteUniqueId)
      : undefined
    const enrollCell = readCellAt(pivotRow, currentEnrollmentCol)
    const fiveYrCell = readCellAt(pivotRow, enrollmentFiveYearsAgoCol)
    recordMappedStat(enrollSpec.key, enrollSpec.label, enrollCell.missing)
    recordMappedStat(fiveYrSpec.key, fiveYrSpec.label, fiveYrCell.missing)
    const currentEnrollment = !enrollCell.missing
      ? parseNumber(enrollCell.v ?? enrollCell.f)
      : (old?.currentEnrollment ?? 0)
    const enrollmentFiveYearsAgo = !fiveYrCell.missing
      ? parseNumber(fiveYrCell.v ?? fiveYrCell.f)
      : null
    // Average yearly % change over 5 years (matches prior sheet metric).
    let enrollmentGrowth5yrPct = old?.enrollmentGrowth5yrPct ?? 0
    if (
      !enrollCell.missing &&
      enrollmentFiveYearsAgo !== null &&
      enrollmentFiveYearsAgo > 0
    ) {
      enrollmentGrowth5yrPct =
        ((currentEnrollment - enrollmentFiveYearsAgo) /
          enrollmentFiveYearsAgo /
          5) *
        100
    } else if (
      !enrollCell.missing &&
      enrollmentFiveYearsAgo === 0 &&
      currentEnrollment > 0
    ) {
      enrollmentGrowth5yrPct = 100
    }

    const capacityCell = getField(site, NEW_SHEET_FIELDS.buildingCapacity)
    const buildingCapacity = !capacityCell.missing
      ? parseNumber(capacityCell.v)
      : old?.buildingCapacity

    const attendCell = getField(site, NEW_SHEET_FIELDS.studentsInAttendanceArea)
    const studentsInAttendanceArea = !attendCell.missing
      ? parsePercent(attendCell.v, attendCell.f)
      : (old?.studentsInAttendanceArea ?? 0)

    const econRateCell = getField(site, NEW_SHEET_FIELDS.economicDisadvantageRate)
    const economicDisadvantageRate = !econRateCell.missing
      ? parsePercent(econRateCell.v, econRateCell.f)
      : (old?.economicDisadvantageRate ?? 0)

    const econCountCell = getField(
      site,
      NEW_SHEET_FIELDS.economicallyDisadvantagedCount,
    )
    const economicallyDisadvantagedCount = !econCountCell.missing
      ? parseNumber(econCountCell.v)
      : (old?.economicallyDisadvantagedCount ?? 0)

    const ellCell = getField(site, NEW_SHEET_FIELDS.ellStudentCount)
    const ellStudentCount = !ellCell.missing
      ? parseNumber(ellCell.v)
      : (old?.ellStudentCount ?? 0)

    const raceEthnicityCounts: Record<string, number> = { ...emptyRace() }
    let anyRaceFromNew = false
    for (const spec of NEW_SHEET_RACE_FIELDS) {
      const raceMatch = /^raceEthnicityCounts\[(.+)\]$/.exec(spec.key)
      const label = normalizeRaceEthnicityLabel(raceMatch?.[1] ?? '')
      if (!label) continue
      const cell = getField(site, spec)
      if (!cell.missing) {
        raceEthnicityCounts[label] = parseNumber(cell.v ?? cell.f)
        anyRaceFromNew = true
        continue
      }
      const oldCount = old?.raceEthnicityCounts?.[label]
      if (typeof oldCount === 'number' && Number.isFinite(oldCount)) {
        raceEthnicityCounts[label] = oldCount
      }
    }
    if (!anyRaceFromNew && old?.raceEthnicityCounts) {
      Object.assign(raceEthnicityCounts, old.raceEthnicityCounts)
    }

    const fciCell = getField(site, NEW_SHEET_FIELDS.fci)
    const fci = !fciCell.missing ? parseNumber(fciCell.v) : old?.fci

    const euiCell = getField(site, NEW_SHEET_FIELDS.energyUseIntensity)
    const energyUseIntensity = !euiCell.missing
      ? parseNumber(euiCell.v)
      : old?.energyUseIntensity

    const acCell = getField(site, NEW_SHEET_FIELDS.acCoverage)
    const acCoverage = !acCell.missing
      ? parsePercent(acCell.v, acCell.f)
      : (old?.acCoverage ?? 0)

    const sqftCell = getField(site, NEW_SHEET_FIELDS.buildingSquareFootage)
    const buildingSquareFootage = !sqftCell.missing
      ? parseNumber(sqftCell.v ?? sqftCell.f)
      : old?.buildingSquareFootage

    const bldgCell = getField(site, NEW_SHEET_FIELDS.buildingScore)
    const buildingScore = !bldgCell.missing
      ? roundBuildingScore(parseNumber(bldgCell.v ?? bldgCell.f))
      : roundBuildingScore(old?.buildingScore ?? 0)

    const progCell = getField(site, NEW_SHEET_FIELDS.programmaticOfferings)
    const programmaticOfferings = !progCell.missing
      ? parseNumber(progCell.v)
      : (old?.programmaticOfferings ?? 0)

    const specialtyProgramNames = collectOfferedPrograms(
      site,
      specialtyProgramCols,
    )
    const specialEdProgramNames = collectOfferedPrograms(
      site,
      specialEdProgramCols,
    )

    const props: SchoolProperties = {
      schoolId,
      schoolName,
      address,
      gradeBand,
      utilizationRate,
      projectedUtilization10yr,
      enrollmentGrowth5yr: enrollmentGrowth5yrPct >= 0,
      enrollmentGrowth5yrPct,
      dpiSchoolCode,
      buildingScore,
      programmaticOfferings,
      specialtyProgramCount: programmaticOfferings,
      specialtyProgramNames:
        specialtyProgramNames.length > 0
          ? specialtyProgramNames
          : (old?.specialtyProgramNames ?? []),
      nearbyCapacityAvailable: old?.nearbyCapacityAvailable ?? false,
      siteExpansionCapacity,
      nearUnderutilizedSchool: old?.nearUnderutilizedSchool ?? false,
      studentsInAttendanceArea,
      economicDisadvantageRate,
      currentEnrollment,
      buildingCapacity,
      economicallyDisadvantagedCount,
      ellStudentCount,
      raceEthnicityCounts,
      boardDistrict,
      academicPerformance,
      academicPerformanceLabel,
      academicHasNumericScore,
      pre1978LeadRisk,
      adaAccessible,
      acCoverage,
      buildingSquareFootage,
      fci,
      energyUseIntensity,
      belowRegionalSpecialtyMedian: false,
      nonMpsSchoolsWithin1Mile,
      specialEdProgramCount,
      specialEdProgramNames:
        specialEdProgramNames.length > 0
          ? specialEdProgramNames
          : (old?.specialEdProgramNames ?? []),
      overutilizedMpsWithin1Mile: old?.overutilizedMpsWithin1Mile ?? false,
      receivesDisplacedStudents: old?.receivesDisplacedStudents,
    }

    features.push(toFeature(props))
  }

  const distanceMatrix = parseDistanceMatrix(distancesTable)
  let distanceRuntime: DistanceRuntime | null = null
  if (distanceMatrix && uniqueIdBySchoolId.size > 0) {
    distanceRuntime = {
      matrix: distanceMatrix,
      uniqueIdBySchoolId,
    }
    const schoolDistInputs = features
      .map((f) => {
        const uniqueId = uniqueIdBySchoolId.get(f.properties.schoolId)
        if (!uniqueId) return null
        return {
          uniqueId,
          utilizationRate: f.properties.utilizationRate,
          siteExpansionCapacity: f.properties.siteExpansionCapacity,
          feature: f,
        }
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x))

    const flags = computeProximityFlags(
      schoolDistInputs,
      distanceMatrix,
      thresholds,
    )
    for (const item of schoolDistInputs) {
      const flag = flags.get(item.uniqueId.toLowerCase())
      if (!flag) continue
      item.feature.properties.nearUnderutilizedSchool =
        flag.nearUnderutilizedSchool
      item.feature.properties.nearbyCapacityAvailable =
        flag.nearbyCapacityAvailable
      item.feature.properties.overutilizedMpsWithin1Mile =
        flag.overutilizedMpsWithin1Mile
    }
  } else {
    for (const key of [
      {
        key: 'nearUnderutilizedSchool',
        label: 'Near underutilized school (distance matrix)',
      },
      {
        key: 'nearbyCapacityAvailable',
        label: 'Nearby school capacity available (distance matrix)',
      },
      {
        key: 'overutilizedMpsWithin1Mile',
        label: 'Overutilized MPS school (distance matrix)',
      },
    ] as const) {
      noteFallback(fallbackFields, seenFallback, {
        key: key.key,
        label: key.label,
        reason: 'distance-matrix-unavailable',
      })
    }
    for (const f of features) {
      const site = siteKeyFromSchoolId(f.properties.schoolId)
      const old = oldBySite.get(site)
      if (!old) continue
      f.properties.nearUnderutilizedSchool = old.nearUnderutilizedSchool
      f.properties.nearbyCapacityAvailable = old.nearbyCapacityAvailable
      f.properties.overutilizedMpsWithin1Mile = old.overutilizedMpsWithin1Mile
    }
  }

  for (const [key, stats] of mappedFieldStats) {
    if (key === 'includeInEvaluation') continue
    if (headerMismatchKeys.has(key)) continue
    if (stats.ok === 0 && stats.missing > 0) {
      noteFallback(fallbackFields, seenFallback, {
        key,
        label: stats.label,
        reason: 'missing-value',
      })
    }
  }

  if (features.length === 0) {
    throw new Error(
      'No schools were found in the new Google Sheet (School and Site Info, Include in Evaluation = Y).',
    )
  }

  return {
    collection: { type: 'FeatureCollection', features },
    fallbackFields,
    source: 'new',
    distanceRuntime,
  }
}
