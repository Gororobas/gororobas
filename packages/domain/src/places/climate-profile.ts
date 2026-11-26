import { Schema } from "effect"

const AreaFraction = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))

export const ClimateDistribution = Schema.Struct({
  mean: Schema.Finite,
  p10: Schema.Finite,
  p50: Schema.Finite,
  p90: Schema.Finite,
  coverage: AreaFraction,
  cellCount: Schema.Int.check(Schema.isGreaterThan(0)),
})

export const PlaceClimateProfile = Schema.Struct({
  dataset: Schema.Literal("CHELSA v2.1"),
  baseline: Schema.Literal("1981–2010"),
  boundarySource: Schema.Literals(["IBGE", "IGAC", "DANE", "Who's On First"]),
  boundaryVersion: Schema.NullOr(Schema.String),
  elevationMeters: Schema.NullOr(Schema.Int),
  supportFraction: AreaFraction,
  computedAt: Schema.String,
  months: Schema.Array(
    Schema.Struct({
      month: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 12 })),
      temperatureC: ClimateDistribution,
      precipitationMm: ClimateDistribution,
      minimumTemperatureC: ClimateDistribution,
      maximumTemperatureC: ClimateDistribution,
      relativeHumidityPercent: ClimateDistribution,
      potentialEvapotranspirationMm: ClimateDistribution,
      vaporPressureDeficitKpa: ClimateDistribution,
      shortwaveRadiationWm2: ClimateDistribution,
      daylightHours: Schema.Finite,
    }),
  ).check(Schema.isBetweenLength(12, 12)),
})

export type PlaceClimateProfile = typeof PlaceClimateProfile.Type

export const PlaceClimateState = Schema.TaggedUnion({
  Generating: {},
  Available: { profile: PlaceClimateProfile },
  Unavailable: {},
})

export type PlaceClimateState = typeof PlaceClimateState.Type
