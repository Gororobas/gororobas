import { Option } from "effect"

import type { OutputFormat } from "../types.js"
import { runCheck } from "./check-impl.js"

export interface CheckArgs {
  patterns: string
  testPattern: string
  format: OutputFormat
  ignore: string | undefined
}

export function runCheckCommand(args: CheckArgs) {
  return runCheck({
    format: args.format,
    ignore: args.ignore ? Option.some(args.ignore) : Option.none(),
    patterns: args.patterns,
    testPattern: args.testPattern,
  })
}
