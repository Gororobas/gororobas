import { Config, Schema } from "effect"

export const Environment = Schema.Literals(["development", "test", "production"])
export type Environment = typeof Environment.Type

export const environmentConfig = Config.schema(Environment, "NODE_ENV").pipe(
  Config.withDefault("development"),
)
