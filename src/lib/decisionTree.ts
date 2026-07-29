import {
  DEFAULT_THRESHOLDS,
  formatMilesPhrase,
  type DecisionThresholds,
} from '../config/strategyGroups'
import type {
  ClassificationResult,
  DecisionStep,
  SchoolProperties,
  StrategyGroupId,
} from '../types/school'

function step(
  nodeId: string,
  question: string,
  answer: boolean,
): DecisionStep {
  return {
    nodeId,
    question,
    answer,
    answerLabel: answer ? 'Yes' : 'No',
  }
}

/**
 * Classify a school into a Strategy Candidate Group using the LRFMP decision flowchart.
 * All dynamic thresholds use inclusive ≥ comparisons.
 */
export function classifySchool(
  school: SchoolProperties,
  thresholds: DecisionThresholds = DEFAULT_THRESHOLDS,
): ClassificationResult {
  const path: DecisionStep[] = []
  const {
    utilizationLow,
    utilizationHigh,
    enrollmentGrowthMin,
  } = thresholds

  const utilAboveLow = school.utilizationRate >= utilizationLow
  path.push(
    step(
      'util_50',
      `Utilization rate above ${utilizationLow}%?`,
      utilAboveLow,
    ),
  )

  if (utilAboveLow) {
    const utilAboveHigh = school.utilizationRate >= utilizationHigh
    path.push(
      step(
        'util_100',
        `Utilization rate above ${utilizationHigh}%?`,
        utilAboveHigh,
      ),
    )

    if (utilAboveHigh) {
      const projectedAboveHigh =
        school.projectedUtilization10yr >= utilizationHigh
      path.push(
        step(
          'proj_100',
          `10-year projected enrollment still above ${utilizationHigh}% utilization rate?`,
          projectedAboveHigh,
        ),
      )

      if (projectedAboveHigh) {
        path.push(
          step(
            'nearby_cap',
            `Schools within ${formatMilesPhrase(thresholds.nearbyCapacityMiles)} have available student capacity?`,
            school.nearbyCapacityAvailable,
          ),
        )

        if (school.nearbyCapacityAvailable) {
          return finish(school.schoolId, '2.4', path)
        }

        path.push(
          step(
            'site_exp',
            'Site capacity for campus expansion?',
            school.siteExpansionCapacity,
          ),
        )

        if (school.siteExpansionCapacity) {
          return finish(school.schoolId, '4', path)
        }
        return finish(school.schoolId, '2.4', path)
      }
    }

    return classifyByBuildingAndPrograms(school, path, thresholds)
  }

  const growthOk = school.enrollmentGrowth5yrPct >= enrollmentGrowthMin
  path.push(
    step(
      'enroll_growth',
      `Enrollment Growth of at least ${enrollmentGrowthMin}% seen over last 5 years?`,
      growthOk,
    ),
  )

  if (growthOk) {
    return classifyByBuildingAndPrograms(school, path, thresholds)
  }

  path.push(
    step(
      'near_underutil',
      `Within ${formatMilesPhrase(thresholds.nearUnderutilizedMiles)} of another underutilized school?`,
      school.nearUnderutilizedSchool,
    ),
  )

  if (school.nearUnderutilizedSchool) {
    return finish(school.schoolId, '1', path)
  }

  return classifyByBuildingAndPrograms(school, path, thresholds)
}

function classifyByBuildingAndPrograms(
  school: SchoolProperties,
  path: DecisionStep[],
  thresholds: DecisionThresholds,
): ClassificationResult {
  const {
    buildingScoreCutoff,
    programmaticOfferingsCutoffHi,
    programmaticOfferingsCutoffLo,
  } = thresholds

  const buildingOk = school.buildingScore >= buildingScoreCutoff
  path.push(
    step(
      'building_score',
      `Composite Building Score of ${buildingScoreCutoff} or above?`,
      buildingOk,
    ),
  )

  const programCutoff = buildingOk
    ? programmaticOfferingsCutoffHi
    : programmaticOfferingsCutoffLo
  const hasPrograms = school.programmaticOfferings >= programCutoff
  const programNodeId = buildingOk ? 'programs_hi_bldg' : 'programs_lo_bldg'

  path.push(
    step(
      programNodeId,
      `${programCutoff} or more programmatic offerings?`,
      hasPrograms,
    ),
  )

  let groupId: StrategyGroupId
  if (buildingOk && hasPrograms) groupId = '3'
  else if (buildingOk && !hasPrograms) groupId = '2.3'
  else if (!buildingOk && hasPrograms) groupId = '2.2'
  else groupId = '2.1'

  return finish(school.schoolId, groupId, path)
}

function finish(
  schoolId: string,
  groupId: StrategyGroupId,
  path: DecisionStep[],
): ClassificationResult {
  return { schoolId, groupId, path }
}

export function classifyAll(
  schools: SchoolProperties[],
  thresholds: DecisionThresholds = DEFAULT_THRESHOLDS,
): ClassificationResult[] {
  return schools.map((s) => classifySchool(s, thresholds))
}
