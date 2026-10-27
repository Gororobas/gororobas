import { Array, Option, Schema, pipe } from 'effect'

export const ChartMode = Schema.Literals(['Adoption', 'Velocity', 'Ecosystem'])
export const chartModes: ReadonlyArray<typeof ChartMode.Type> =
  ChartMode.literals

export const Period = Schema.Literals([
  'LastEightWeeks',
  'LastSixteenWeeks',
  'LastYear',
])
export const periods: ReadonlyArray<typeof Period.Type> = Period.literals

export const PackageId = Schema.Literals([
  'Core',
  'Ui',
  'Devtools',
  'VitePlugin',
])
export const packageIds: ReadonlyArray<typeof PackageId.Type> =
  PackageId.literals

export const PackageSpec = Schema.Struct({
  id: PackageId,
  npmName: Schema.String,
  displayName: Schema.String,
  role: Schema.String,
})

export const packageSpecs: ReadonlyArray<typeof PackageSpec.Type> = [
  {
    id: 'Core',
    npmName: 'foldkit',
    displayName: 'foldkit',
    role: 'runtime',
  },
  {
    id: 'Ui',
    npmName: '@foldkit/ui',
    displayName: '@foldkit/ui',
    role: 'components',
  },
  {
    id: 'Devtools',
    npmName: '@foldkit/devtools',
    displayName: '@foldkit/devtools',
    role: 'inspection',
  },
  {
    id: 'VitePlugin',
    npmName: '@foldkit/vite-plugin',
    displayName: '@foldkit/vite-plugin',
    role: 'build',
  },
]

export const WeeklyTelemetry = Schema.Struct({
  weekStart: Schema.String,
  cumulativeStars: Schema.Number,
  commits: Schema.Number,
  releases: Schema.Number,
})

export const WeeklyDownloads = Schema.Struct({
  weekStart: Schema.String,
  downloads: Schema.Number,
})

export const PackageSnapshot = Schema.Struct({
  id: PackageId,
  npmName: Schema.String,
  displayName: Schema.String,
  role: Schema.String,
  latestVersion: Schema.String,
  publishedAt: Schema.String,
  totalDownloads: Schema.Number,
  lastWeekDownloads: Schema.Number,
  dependencyCount: Schema.Number,
  downloadsByWeek: Schema.Array(WeeklyDownloads),
})

export const DependencyEdge = Schema.Struct({
  source: PackageId,
  target: PackageId,
  kind: Schema.Literals(['Dependency', 'PeerDependency']),
})

export const ContributorSummary = Schema.Struct({
  login: Schema.String,
  contributions: Schema.Number,
  avatarUrl: Schema.Option(Schema.String),
})

export const RepositorySnapshot = Schema.Struct({
  stars: Schema.Number,
  forks: Schema.Number,
  watchers: Schema.Number,
  openIssues: Schema.Number,
  openPullRequests: Schema.Number,
  visibleContributors: Schema.Number,
  pushedAt: Schema.String,
  defaultBranch: Schema.String,
})

export const Telemetry = Schema.Struct({
  fetchedAt: Schema.Number,
  repository: RepositorySnapshot,
  packages: Schema.Array(PackageSnapshot),
  weeks: Schema.Array(WeeklyTelemetry),
  dependencyEdges: Schema.Array(DependencyEdge),
  topContributors: Schema.Array(ContributorSummary),
  warnings: Schema.Array(Schema.String),
})

// CONSTANT

const LAST_EIGHT_WEEKS = 8
const LAST_SIXTEEN_WEEKS = 16
const LAST_YEAR_WEEKS = 52

// QUERY

const weekCountByPeriod: Record<typeof Period.Type, number> = {
  LastEightWeeks: LAST_EIGHT_WEEKS,
  LastSixteenWeeks: LAST_SIXTEEN_WEEKS,
  LastYear: LAST_YEAR_WEEKS,
}

const weekCountForPeriod = (period: typeof Period.Type): number =>
  weekCountByPeriod[period]

export const periodLabels: Record<typeof Period.Type, string> = {
  LastEightWeeks: '8 weeks',
  LastSixteenWeeks: '16 weeks',
  LastYear: '1 year',
}

export const packageIdToSpec = (
  packageId: typeof PackageId.Type,
): typeof PackageSpec.Type =>
  pipe(
    packageSpecs,
    Array.findFirst(({ id }) => id === packageId),
    Option.getOrElse(() => ({
      id: 'Core' as const,
      npmName: 'foldkit',
      displayName: 'foldkit',
      role: 'runtime',
    })),
  )

export const visibleWeeks = (
  telemetry: typeof Telemetry.Type,
  period: typeof Period.Type,
): ReadonlyArray<typeof WeeklyTelemetry.Type> =>
  Array.takeRight(telemetry.weeks, weekCountForPeriod(period))

export const totalDownloads = (telemetry: typeof Telemetry.Type): number =>
  Array.reduce(
    telemetry.packages,
    0,
    (total, snapshot) => total + snapshot.totalDownloads,
  )

export const totalCommits = (telemetry: typeof Telemetry.Type): number =>
  Array.reduce(telemetry.weeks, 0, (total, week) => total + week.commits)

export const findPackageSnapshot = (
  telemetry: typeof Telemetry.Type,
  packageId: typeof PackageId.Type,
): Option.Option<typeof PackageSnapshot.Type> =>
  Array.findFirst(telemetry.packages, snapshot => snapshot.id === packageId)
