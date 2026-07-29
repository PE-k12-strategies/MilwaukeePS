export type StrategyGroupId =
  | '1'
  | '2.1'
  | '2.2'
  | '2.3'
  | '2.4'
  | '3'
  | '4'

export interface SchoolProperties {
  schoolId: string
  schoolName: string
  address?: string
  gradeBand?: string
  /** Utilization rate as percentage (e.g. 72 = 72%) */
  utilizationRate: number
  /** 10-year projected utilization rate as percentage */
  projectedUtilization10yr: number
  /** True if enrollment grew over the last 5 years (legacy; prefer enrollmentGrowth5yrPct) */
  enrollmentGrowth5yr: boolean
  /** 5-year enrollment growth as percentage (e.g. 3.2 = 3.2%) */
  enrollmentGrowth5yrPct: number
  /**
   * DPI school code from sheet 3.1 Connections (col L), normalized without
   * leading zeros — joins to GeoJSON SCHOOL_ID.
   */
  dpiSchoolCode?: number
  /** Composite building condition score 1–10 (10 = excellent) */
  buildingScore: number
  /** Count of specialized programmatic offerings */
  programmaticOfferings: number
  /** Nearby MPS schools within 1 mile have available student capacity */
  nearbyCapacityAvailable: boolean
  /** Site has capacity for campus expansion */
  siteExpansionCapacity: boolean
  /** Within 1 mile of another underutilized school */
  nearUnderutilizedSchool: boolean
  /** % of enrolled students who live in the attendance area (0–100) */
  studentsInAttendanceArea: number
  /** Share of economically disadvantaged students (0–100) */
  economicDisadvantageRate: number
  /** Current enrollment headcount (3.3 col S, 2024–2025) */
  currentEnrollment: number
  /**
   * Building student capacity (New sheet Student Enrollment Data col T).
   * Available seats = capacity − enrollment (negative when enrollment exceeds capacity).
   */
  buildingCapacity?: number
  /** Economically disadvantaged student count (3.3 col AM) */
  economicallyDisadvantagedCount: number
  /** English Language Learner student count (3.3 col AO) */
  ellStudentCount: number
  /** Race/ethnicity student counts keyed by sheet header (3.3 AR–AY) */
  raceEthnicityCounts: Record<string, number>
  /** Board district label, e.g. "District 1" (3.2 col K) */
  boardDistrict: string
  /** Academic performance score (higher = better) */
  academicPerformance: number
  /** Building constructed before 1978 (lead risk) */
  pre1978LeadRisk: boolean
  /** Academic spaces are ADA accessible */
  adaAccessible: boolean
  /** Air conditioning coverage (0–100) */
  acCoverage: number
  /** Building floor area in square feet (School and Site Info col M) */
  buildingSquareFootage?: number
  /** Facility Condition Index from sheet 1.2 (lower often = better condition) */
  fci?: number
  /** Energy Use Intensity from sheet 1.2 */
  energyUseIntensity?: number
  /** Count of specialty programs at the school */
  specialtyProgramCount: number
  /**
   * True when specialtyProgramCount is strictly below the median
   * specialtyProgramCount among evaluable schools in the same Board District.
   */
  belowRegionalSpecialtyMedian: boolean
  /** Non-MPS public school within 1 mile (3.2 col AD) */
  nonMpsSchoolsWithin1Mile: boolean
  /** Self-contained special education programs */
  specialEdProgramCount: number
  /**
   * True when sheet 3.2 “Distance to Overutilized School” is 0
   * (at/adjacent to an overutilized school).
   */
  overutilizedMpsWithin1Mile: boolean
  /** Likely to receive students from closures/mergers */
  receivesDisplacedStudents?: boolean
}

export interface SchoolFeature {
  type: 'Feature'
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  }
  properties: SchoolProperties
}

export interface SchoolCollection {
  type: 'FeatureCollection'
  features: SchoolFeature[]
}

export interface DecisionStep {
  nodeId: string
  question: string
  answer: boolean
  answerLabel: 'Yes' | 'No'
}

export interface ClassificationResult {
  schoolId: string
  groupId: StrategyGroupId
  path: DecisionStep[]
}

export interface PrioritizationCriterion {
  key: string
  label: string
  description: string
  /** If true, higher raw values score higher; if false, lower raw values score higher */
  higherIsPriority: boolean
  /** How to read the school property for scoring */
  valueType: 'number' | 'booleanInverse' | 'booleanDirect'
  property: keyof SchoolProperties
}

export interface GroupWeightConfig {
  groupId: string
  title: string
  criteria: PrioritizationCriterion[]
  defaultWeights: Record<string, number>
  showAdditionalFactors?: boolean
}
