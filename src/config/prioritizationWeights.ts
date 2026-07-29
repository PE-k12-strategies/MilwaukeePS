import type { GroupWeightConfig } from '../types/school'

const utilizationHigher: GroupWeightConfig['criteria'][number] = {
  key: 'utilizationRate',
  label: 'Utilization Rate',
  description: 'Higher weight prioritizes schools with higher utilization rates',
  higherIsPriority: true,
  valueType: 'number',
  property: 'utilizationRate',
}

const utilizationLower: GroupWeightConfig['criteria'][number] = {
  key: 'utilizationRate',
  label: 'Utilization Rate',
  description: 'Higher weight prioritizes schools with lower utilization rates',
  higherIsPriority: false,
  valueType: 'number',
  property: 'utilizationRate',
}

const attendanceHigher: GroupWeightConfig['criteria'][number] = {
  key: 'studentsInAttendanceArea',
  label: 'Students from Attendance Area (%)',
  description:
    'Higher weight prioritizes schools with a higher share of students from the attendance area',
  higherIsPriority: true,
  valueType: 'number',
  property: 'studentsInAttendanceArea',
}

const attendanceLower: GroupWeightConfig['criteria'][number] = {
  key: 'studentsInAttendanceArea',
  label: 'Students from Attendance Area (%)',
  description:
    'Higher weight prioritizes schools with a lower share of students from the attendance area',
  higherIsPriority: false,
  valueType: 'number',
  property: 'studentsInAttendanceArea',
}

const economicHigher: GroupWeightConfig['criteria'][number] = {
  key: 'economicDisadvantageRate',
  label: 'Economically Disadvantaged Students',
  description:
    'Higher weight prioritizes schools with more economically disadvantaged students enrolled',
  higherIsPriority: true,
  valueType: 'number',
  property: 'economicDisadvantageRate',
}

const economicLower: GroupWeightConfig['criteria'][number] = {
  key: 'economicDisadvantageRate',
  label: 'Economically Disadvantaged Students',
  description:
    'Higher weight prioritizes schools with fewer economically disadvantaged students enrolled',
  higherIsPriority: false,
  valueType: 'number',
  property: 'economicDisadvantageRate',
}

const buildingPoorer: GroupWeightConfig['criteria'][number] = {
  key: 'buildingCondition',
  label: 'Building Condition',
  description: 'Higher weight prioritizes schools with poorer building conditions',
  higherIsPriority: false,
  valueType: 'number',
  property: 'buildingScore',
}

const academicLower: GroupWeightConfig['criteria'][number] = {
  key: 'academicPerformance',
  label: 'Academic Performance',
  description: 'Higher weight prioritizes schools with lower academic performance',
  higherIsPriority: false,
  valueType: 'number',
  property: 'academicPerformance',
}

const leadRisk: GroupWeightConfig['criteria'][number] = {
  key: 'pre1978LeadRisk',
  label: 'Pre-1978 Building Lead Risk',
  description:
    'Higher weight prioritizes schools built before 1978 (potential lead risk)',
  higherIsPriority: true,
  valueType: 'booleanDirect',
  property: 'pre1978LeadRisk',
}

const adaNotAccessible: GroupWeightConfig['criteria'][number] = {
  key: 'adaAccessibility',
  label: 'ADA Accessibility',
  description: 'Higher weight prioritizes schools that are not ADA accessible',
  higherIsPriority: true,
  valueType: 'booleanInverse',
  property: 'adaAccessible',
}

const acLower: GroupWeightConfig['criteria'][number] = {
  key: 'acStatus',
  label: 'AC Status',
  description: 'Higher weight prioritizes schools with lower air conditioning coverage',
  higherIsPriority: false,
  valueType: 'number',
  property: 'acCoverage',
}

const programAccess: GroupWeightConfig['criteria'][number] = {
  key: 'programAccess',
  label: 'Program Access',
  description: 'Higher weight prioritizes schools with fewer existing specialty programs',
  higherIsPriority: false,
  valueType: 'number',
  property: 'specialtyProgramCount',
}

const regionalProgramAccess: GroupWeightConfig['criteria'][number] = {
  key: 'regionalProgramAccess',
  label: 'Regional Program Access',
  description:
    'Higher weight prioritizes schools with below-median existing specialty program scores for that SBD/region',
  higherIsPriority: true,
  valueType: 'booleanDirect',
  property: 'belowRegionalSpecialtyMedian',
}

const proximityNonMps: GroupWeightConfig['criteria'][number] = {
  key: 'proximityNonMps',
  label: 'Proximity to non-MPS Schools',
  description:
    'Higher weight prioritizes schools with a non-MPS public school within 1 mile',
  higherIsPriority: true,
  valueType: 'booleanDirect',
  property: 'nonMpsSchoolsWithin1Mile',
}

const specialEd: GroupWeightConfig['criteria'][number] = {
  key: 'specialEdPrograms',
  label: 'Special Ed Programs',
  description:
    'Higher weight prioritizes schools with fewer self-contained special education programs',
  higherIsPriority: false,
  valueType: 'number',
  property: 'specialEdProgramCount',
}

const proximityOverutilized: GroupWeightConfig['criteria'][number] = {
  key: 'proximityOverutilized',
  label: 'Proximity to overutilized MPS Schools',
  description:
    'Higher weight prioritizes schools within 1 mile of an overutilized MPS school',
  higherIsPriority: true,
  valueType: 'booleanDirect',
  property: 'overutilizedMpsWithin1Mile',
}

export const GROUP_WEIGHT_CONFIGS: Record<string, GroupWeightConfig> = {
  '1': {
    groupId: '1',
    title: 'Prioritization Weights for 1: Closure/Merger',
    showAdditionalFactors: true,
    criteria: [
      utilizationLower,
      attendanceLower,
      economicLower,
      academicLower,
      buildingPoorer,
      leadRisk,
      adaNotAccessible,
      acLower,
    ],
    defaultWeights: {
      utilizationRate: 8.0,
      studentsInAttendanceArea: 6.0,
      economicDisadvantageRate: 3.0,
      academicPerformance: 0,
      buildingCondition: 7.0,
      pre1978LeadRisk: 0,
      adaAccessibility: 2.0,
      acStatus: 0,
    },
  },
  '2.1': {
    groupId: '2.1',
    title: 'Prioritization Weights for 2.1: Building & Programmatic Investments',
    criteria: [
      utilizationHigher,
      attendanceHigher,
      economicHigher,
      programAccess,
      regionalProgramAccess,
      proximityNonMps,
      buildingPoorer,
      academicLower,
      leadRisk,
      adaNotAccessible,
      acLower,
    ],
    defaultWeights: {
      utilizationRate: 5.0,
      studentsInAttendanceArea: 3.0,
      economicDisadvantageRate: 6.0,
      programAccess: 8.0,
      regionalProgramAccess: 8.0,
      proximityNonMps: 0,
      buildingCondition: 8.0,
      academicPerformance: 0,
      pre1978LeadRisk: 4.0,
      adaAccessibility: 4.0,
      acStatus: 4.0,
    },
  },
  '2.2': {
    groupId: '2.2',
    title: 'Prioritization Weights for 2.2: Building Investment',
    criteria: [
      utilizationHigher,
      economicHigher,
      attendanceHigher,
      buildingPoorer,
      proximityNonMps,
      leadRisk,
      adaNotAccessible,
      acLower,
    ],
    defaultWeights: {
      utilizationRate: 5.0,
      economicDisadvantageRate: 6.0,
      studentsInAttendanceArea: 3.0,
      buildingCondition: 8.0,
      proximityNonMps: 0,
      pre1978LeadRisk: 4.0,
      adaAccessibility: 4.0,
      acStatus: 4.0,
    },
  },
  '2.3': {
    groupId: '2.3',
    title: 'Prioritization Weights for 2.3: Programmatic Investment',
    criteria: [
      utilizationHigher,
      attendanceHigher,
      economicHigher,
      programAccess,
      regionalProgramAccess,
      proximityNonMps,
    ],
    defaultWeights: {
      utilizationRate: 4.0,
      studentsInAttendanceArea: 3.0,
      economicDisadvantageRate: 6.0,
      programAccess: 8.0,
      regionalProgramAccess: 8.0,
      proximityNonMps: 0,
    },
  },
  'all-building-focused': {
    groupId: 'all-building-focused',
    title: 'Prioritization Weights for All Building-Focused (2.1 + 2.2)',
    criteria: [
      utilizationHigher,
      economicHigher,
      attendanceHigher,
      buildingPoorer,
      proximityNonMps,
      leadRisk,
      adaNotAccessible,
      acLower,
    ],
    defaultWeights: {
      utilizationRate: 5.0,
      economicDisadvantageRate: 6.0,
      studentsInAttendanceArea: 3.0,
      buildingCondition: 8.0,
      proximityNonMps: 0,
      pre1978LeadRisk: 4.0,
      adaAccessibility: 4.0,
      acStatus: 4.0,
    },
  },
  'all-program-focused': {
    groupId: 'all-program-focused',
    title: 'Prioritization Weights for All Program-Focused (2.1 + 2.3)',
    criteria: [
      utilizationHigher,
      attendanceHigher,
      economicHigher,
      programAccess,
      regionalProgramAccess,
      proximityNonMps,
    ],
    defaultWeights: {
      utilizationRate: 4.0,
      studentsInAttendanceArea: 3.0,
      economicDisadvantageRate: 6.0,
      programAccess: 8.0,
      regionalProgramAccess: 8.0,
      proximityNonMps: 0,
    },
  },
  '2.4': {
    groupId: '2.4',
    title: 'Prioritization Weights for 2.4: Site-Specific Evaluation',
    showAdditionalFactors: true,
    criteria: [
      utilizationHigher,
      economicHigher,
      attendanceHigher,
      buildingPoorer,
      proximityNonMps,
      leadRisk,
      adaNotAccessible,
      acLower,
    ],
    defaultWeights: {
      utilizationRate: 1.5,
      economicDisadvantageRate: 1.0,
      studentsInAttendanceArea: 2.0,
      buildingCondition: 2.5,
      proximityNonMps: 1.0,
      pre1978LeadRisk: 0,
      adaAccessibility: 0,
      acStatus: 0,
    },
  },
  '3': {
    groupId: '3',
    title: 'Prioritization Weights for 3: Ongoing Monitoring & Evaluation',
    showAdditionalFactors: true,
    criteria: [
      utilizationHigher,
      attendanceHigher,
      economicHigher,
      programAccess,
      regionalProgramAccess,
      proximityNonMps,
    ],
    defaultWeights: {
      utilizationRate: 1.5,
      studentsInAttendanceArea: 2.0,
      economicDisadvantageRate: 1.5,
      programAccess: 1.5,
      regionalProgramAccess: 1.0,
      proximityNonMps: 1.0,
    },
  },
  '4': {
    groupId: '4',
    title: 'Prioritization Weights for 4: Building Addition',
    showAdditionalFactors: true,
    criteria: [
      utilizationHigher,
      attendanceHigher,
      economicHigher,
      specialEd,
      proximityOverutilized,
      proximityNonMps,
      buildingPoorer,
    ],
    defaultWeights: {
      utilizationRate: 2.0,
      studentsInAttendanceArea: 2.0,
      economicDisadvantageRate: 2.0,
      specialEdPrograms: 0,
      proximityOverutilized: 0,
      proximityNonMps: 0,
      buildingCondition: 2.0,
    },
  },
}
