import { useEffect, useMemo, useState } from 'react'
import { DataPanel } from './components/DataPanel'
import { InteractiveMap } from './components/InteractiveMap'
import { Step3Summary } from './components/Step3Summary'
import { Step4Prioritize } from './components/Step4Prioritize'
import { Step5SaveExport } from './components/Step5SaveExport'
import { WelcomeModal } from './components/WelcomeModal'
import {
  isDashboardUnlocked,
  PasswordGate,
} from './components/PasswordGate'
import { collectionToSchools } from './data/mockSchools'
import defaultLocationsGeojson from './data/MPSSchools.json'
import { classifyAll } from './lib/decisionTree'
import {
  loadSchoolsFromSheets,
  mergeGeoJsonLocations,
} from './lib/loadSchoolsFromSheets'
import { applyDistanceProximity, type DistanceRuntime } from './lib/schoolDistances'
import {
  SHEET_SOURCE_META,
  type FallbackFieldInfo,
} from './lib/sheetSources'
import {
  mergeThresholds,
  type DecisionThresholds,
} from './config/strategyGroups'
import {
  mergeSharedWeights,
  readScenarioFromLocation,
  type SharedScenario,
} from './lib/scenarioShare'
import { applyBelowRegionalSpecialtyMedian } from './lib/regionalSpecialtyMedian'
import type { PrioritizationGroupId } from './config/prioritizationGroups'
import type { SchoolCollection } from './types/school'
import mpsLogo from './assets/MPS-logo-RGB.jpeg'
import peLogo from './assets/logo-Perkins-Eastman.png'
import { X } from 'lucide-react'

type TabId = 'understand' | 'summary' | 'map' | 'prioritize' | 'save'

const TABS: { id: TabId; label: string }[] = [
  { id: 'understand', label: 'Understand School-Level Data' },
  { id: 'summary', label: 'Sort into Strategy Groups' },
  { id: 'map', label: 'Compare Schools on the Map' },
  { id: 'prioritize', label: 'Prioritize within Strategy Groups' },
  { id: 'save', label: 'Save and Export Scenario' },
]

const WELCOME_KEY = 'mps-lrfmp-welcome-dismissed'

function locationLabel(extra?: string): string {
  const base = SHEET_SOURCE_META.new.dataLabel
  return extra ? `${base} + ${extra}` : `${base} + MPSSchools.geojson`
}

function withDefaultLocations(sheet: SchoolCollection): SchoolCollection {
  return mergeGeoJsonLocations(sheet, defaultLocationsGeojson)
}

export default function App() {
  const [collection, setCollection] = useState<SchoolCollection | null>(null)
  const [dataLabel, setDataLabel] = useState('Loading sheet…')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [fallbackFields, setFallbackFields] = useState<FallbackFieldInfo[]>([])
  const [distanceRuntime, setDistanceRuntime] = useState<DistanceRuntime | null>(
    null,
  )
  const [showDataSources, setShowDataSources] = useState(false)
  const [sharedScenario] = useState<SharedScenario | null>(() =>
    readScenarioFromLocation(),
  )
  const [thresholds, setThresholds] = useState<DecisionThresholds>(() =>
    mergeThresholds(sharedScenario?.thresholds),
  )
  const [weightsByGroup, setWeightsByGroup] = useState(() =>
    mergeSharedWeights(sharedScenario?.weights),
  )
  const [tab, setTab] = useState<TabId>(() =>
    sharedScenario ? 'prioritize' : 'understand',
  )
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null)
  const [prioritizeGroupId, setPrioritizeGroupId] = useState<
    PrioritizationGroupId | undefined
  >(() => sharedScenario?.groupId)
  const [activePrioritizeGroupId, setActivePrioritizeGroupId] =
    useState<PrioritizationGroupId>(sharedScenario?.groupId ?? '1')
  const [unlocked, setUnlocked] = useState(() => isDashboardUnlocked())
  const [showWelcome, setShowWelcome] = useState(() => {
    try {
      return sessionStorage.getItem(WELCOME_KEY) !== '1'
    } catch {
      return true
    }
  })

  const dismissWelcome = () => {
    try {
      sessionStorage.setItem(WELCOME_KEY, '1')
    } catch {
      /* ignore */
    }
    setShowWelcome(false)
  }

  const { schools, missingBoardDistrictWarning } = useMemo(() => {
    if (!collection) {
      return { schools: [], missingBoardDistrictWarning: null as string | null }
    }
    let raw = collectionToSchools(collection)
    if (distanceRuntime) {
      raw = applyDistanceProximity(raw, distanceRuntime, thresholds)
    }
    const { schools: enriched, missingBoardDistrict } =
      applyBelowRegionalSpecialtyMedian(raw)
    if (missingBoardDistrict.length === 0) {
      return { schools: enriched, missingBoardDistrictWarning: null }
    }
    const list = missingBoardDistrict
      .map((s) => `${s.schoolName} (${s.schoolId})`)
      .join('; ')
    console.warn(
      `[MPS Dashboard] Schools missing Board District (review): ${list}`,
    )
    return {
      schools: enriched,
      missingBoardDistrictWarning: `${missingBoardDistrict.length} school(s) are missing a Board District and were treated as not below-median for regional specialty programs: ${missingBoardDistrict
        .map((s) => `${s.schoolName} (${s.schoolId})`)
        .join(', ')}`,
    }
  }, [collection, distanceRuntime, thresholds])

  const classifications = useMemo(
    () => classifyAll(schools, thresholds),
    [schools, thresholds],
  )

  const loadFromSheet = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await loadSchoolsFromSheets('new', thresholds)
      const next = withDefaultLocations(result.collection)
      setCollection(next)
      setFallbackFields(result.fallbackFields)
      setDistanceRuntime(result.distanceRuntime)
      setDataLabel(locationLabel())
      setSelectedSchoolId(null)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load school data from the Google Sheet.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!unlocked) return
    void loadFromSheet()
    // Initial load only after unlock — subsequent reloads call loadFromSheet explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked])

  const handleReload = () => {
    void loadFromSheet()
  }

  const handleUpload = async (file: File) => {
    if (!collection) {
      setError('Load sheet data before uploading GeoJSON locations.')
      setShowDataSources(true)
      return
    }
    try {
      const text = await file.text()
      const json = JSON.parse(text) as unknown
      const result = await loadSchoolsFromSheets('new', thresholds)
      const merged = mergeGeoJsonLocations(result.collection, json)
      setCollection(merged)
      setFallbackFields(result.fallbackFields)
      setDistanceRuntime(result.distanceRuntime)
      setDataLabel(locationLabel(`locations from ${file.name}`))
      setError(null)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not merge GeoJSON locations onto sheet schools.',
      )
      setShowDataSources(true)
    }
  }

  const goToPrioritize = (groupId: string) => {
    setPrioritizeGroupId(groupId as PrioritizationGroupId)
    setTab('prioritize')
  }

  const selectSchool = (schoolId: string) => {
    setSelectedSchoolId(schoolId)
    const classification = classifications.find((c) => c.schoolId === schoolId)
    if (classification) {
      setPrioritizeGroupId(classification.groupId)
    }
    setTab('prioritize')
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-mps-gray">
      <PasswordGate open={!unlocked} onSuccess={() => setUnlocked(true)} />
      <WelcomeModal
        open={unlocked && showWelcome}
        onClose={dismissWelcome}
      />

      {showDataSources && (
        <div
          className="fixed inset-0 z-[1100] flex items-start justify-center overflow-y-auto bg-slate-900/45 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="data-sources-title"
          onClick={() => setShowDataSources(false)}
        >
          <div
            className="relative my-4 w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowDataSources(false)}
              className="absolute top-3 right-3 z-10 rounded p-1 text-mps-muted transition hover:bg-mps-gray hover:text-mps-text"
              aria-label="Close data sources"
            >
              <X className="h-5 w-5" />
            </button>
            <span id="data-sources-title" className="sr-only">
              View and Update Data Sources
            </span>
            <DataPanel
              schoolCount={schools.length}
              dataLabel={dataLabel}
              loading={loading}
              fallbackFields={fallbackFields}
              onReloadDefault={handleReload}
              onUpload={handleUpload}
              error={error}
            />
          </div>
        </div>
      )}

      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-mps-gray-border bg-white px-5 py-3">
        <h1 className="min-w-0 text-lg font-bold text-mps-blue sm:text-xl">
          MPS Long-Range Facilities Plan Strategy Tool
        </h1>
        <div className="flex shrink-0 items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => setShowDataSources(true)}
            className="rounded-md bg-mps-blue px-3 py-2 text-xs font-semibold whitespace-nowrap text-white transition hover:bg-mps-blue-dark sm:text-sm"
          >
            View and Update Data Sources
          </button>
          <img
            src={mpsLogo}
            alt="Milwaukee Public Schools"
            className="h-10 w-auto object-contain sm:h-11"
          />
          <img
            src={peLogo}
            alt="Perkins Eastman"
            className="h-8 w-auto object-contain sm:h-9"
          />
        </div>
      </header>

      <div className="min-h-0 w-full flex-1 overflow-hidden p-4">
        <main className="card flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          <div className="grid shrink-0 grid-cols-2 border-b border-mps-gray-border sm:grid-cols-5">
            {TABS.map((item) => {
              const active = tab === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`min-h-[52px] border-r border-mps-gray-border px-1.5 py-3 text-left text-[10px] font-semibold last:border-r-0 sm:px-2 sm:text-xs lg:px-3 lg:text-sm ${
                    active
                      ? 'bg-white text-mps-blue'
                      : 'bg-mps-gray text-mps-text hover:bg-white'
                  }`}
                >
                  {item.label}
                </button>
              )
            })}
          </div>

          <div
            className={`min-h-0 flex-1 p-5 md:p-6 ${
              tab === 'map' || tab === 'understand'
                ? 'flex flex-col overflow-hidden'
                : 'overflow-y-auto'
            }`}
          >
            {missingBoardDistrictWarning && (
              <div
                role="status"
                className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                <span className="font-semibold">Data review needed: </span>
                {missingBoardDistrictWarning}
              </div>
            )}
            {loading && !collection ? (
              <p className="text-sm text-mps-muted">
                Loading school data from the Google Sheet…
              </p>
            ) : (
              <>
                {tab === 'understand' && collection && (
                  <div className="min-h-0 flex-1">
                    <InteractiveMap
                      collection={collection}
                      schools={schools}
                      classifications={classifications}
                      thresholds={thresholds}
                      active={tab === 'understand'}
                      mode="understand"
                    />
                  </div>
                )}
                {tab === 'summary' && (
                  <Step3Summary
                    schools={schools}
                    classifications={classifications}
                    thresholds={thresholds}
                    onThresholdsChange={setThresholds}
                    onSelectSchool={selectSchool}
                    onGoToPrioritize={goToPrioritize}
                  />
                )}
                {tab === 'map' && collection && (
                  <div className="min-h-0 flex-1">
                    <InteractiveMap
                      collection={collection}
                      schools={schools}
                      classifications={classifications}
                      thresholds={thresholds}
                      active={tab === 'map'}
                      mode="compare"
                    />
                  </div>
                )}
                {tab === 'prioritize' && (
                  <Step4Prioritize
                    schools={schools}
                    classifications={classifications}
                    thresholds={thresholds}
                    onThresholdsChange={setThresholds}
                    weightsByGroup={weightsByGroup}
                    onWeightsByGroupChange={setWeightsByGroup}
                    initialGroupId={prioritizeGroupId}
                    initialScenario={sharedScenario}
                    selectedSchoolId={selectedSchoolId}
                    onSelectSchool={setSelectedSchoolId}
                    onActiveGroupChange={setActivePrioritizeGroupId}
                  />
                )}
                {tab === 'save' && (
                  <Step5SaveExport
                    schools={schools}
                    classifications={classifications}
                    thresholds={thresholds}
                    weightsByGroup={weightsByGroup}
                    activeGroupId={activePrioritizeGroupId}
                  />
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
