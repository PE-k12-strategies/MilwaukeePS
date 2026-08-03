/**
 * Short helper copy for metrics shown in Understand School-Level Data
 * and Compare Schools on the Map.
 */
export const METRIC_HELP: Record<string, string> = {
  address: 'Street address of the school campus.',
  boardDistrict: 'MPS Board District that serves this school.',
  gradeBand:
    'Grade configuration served by the school (for example Elementary, Middle, High School, or K–8).',
  utilizationRate:
    'Current enrollment divided by building capacity. Values over 100% mean the school is over capacity.',
  projectedUtilization10yr:
    'Estimated utilization in about 10 years based on enrollment projections and capacity.',
  enrollmentGrowth5yrPct:
    'Average yearly percent change in enrollment over the last five years (from the enrollment sums pivot).',
  buildingScore:
    'Composite facility condition score (0–10). Higher scores generally indicate better building condition.',
  programmaticOfferings:
    'Count of specialty / enrichment programs and pathways offered at the school.',
  specialtyProgramNames:
    'Names of specialty programs and pathways offered at the school (from Program Data).',
  nearbyCapacityAvailable:
    'Whether another school within the configured distance has capacity available to absorb students.',
  siteExpansionCapacity:
    'Whether the site has physical room to expand (growth capacity) according to the sheet.',
  nearUnderutilizedSchool:
    'Whether another underutilized MPS school is within the configured distance.',
  studentsInAttendanceArea:
    "Share of enrolled students who live in the school's attendance area.",
  economicDisadvantageRate:
    'Share of students identified as economically disadvantaged (often aligned with free/reduced lunch).',
  academicPerformance:
    'Wisconsin DPI report card score for the school (higher is better).',
  pre1978LeadRisk:
    'Whether the building was constructed before 1978, used as a lead-risk indicator.',
  adaAccessible:
    'Whether the facility is considered ADA accessible according to the sheet.',
  acCoverage:
    'Share of learning spaces / classrooms with air conditioning.',
  fci: 'Facility Condition Index — a measure of building condition (context depends on how FCI is scored in the source data).',
  energyUseIntensity:
    'Energy Use Intensity (EUI) — energy use relative to building size.',
  specialtyProgramCount:
    'Number of specialty programs or pathways (often aligned with programmatic offerings).',
  belowRegionalSpecialtyMedian:
    'Whether this school offers fewer specialty programs than the median among schools in its region / district peer set.',
  nonMpsSchoolsWithin1Mile:
    'Whether there is a non-MPS public school within about one mile.',
  specialEdProgramCount:
    'Number of special education programs reported for the school. Programs are weighted — some count more heavily than others in this score.',
  specialEdProgramNames:
    'Special education programs offered at the school, spelled out from sheet acronyms (e.g. AU → Autistic Self-Contained).',
  overutilizedMpsWithin1Mile:
    'Whether an overutilized MPS school is within about one mile.',
  currentEnrollment: 'Students enrolled in the current school year.',
  buildingCapacity: 'Student capacity of the building used for utilization calculations.',
  availableCapacity:
    'Building capacity minus current enrollment. Negative values mean the school is over capacity.',
  buildingSquareFootage: 'Total building floor area in square feet.',
  ellStudents: 'Share of enrolled students identified as English Language Learners (ELL).',
  freeReducedLunch:
    'Share of students who are economically disadvantaged / eligible for free or reduced-price lunch.',
  schoolProfileNormalized:
    "Radar view of this school's percentile ranks (0–100) versus all loaded schools on key metrics.",
  studentDemographics:
    'Breakdown of enrolled students by race / ethnicity (from sheet headcounts).',
  utilizationComparison:
    "How this school's utilization compares to all other loaded schools (rank, share below/above).",
  enrollmentComparison:
    "How this school's enrollment size compares to all other loaded schools.",
  facilityDetails: 'Building and accessibility attributes from the facilities / site data.',
  academicPrograms:
    'Academic performance and program counts from the sheet, with specialty and special education programs listed by name.',
  enrollmentCapacity: 'Current enrollment, capacity, and projected utilization figures.',
}

export function metricHelp(key: string | undefined | null): string | undefined {
  if (!key) return undefined
  return METRIC_HELP[key]
}
