/** Primitives for application-owned persistence implementations and transaction adapters. */
export { CurrentCommitJournal } from "./hooks/commit";

export {
  AuthDiagnostic,
  reportAuthDiagnostic,
  reportAuthFailure,
  reportPersistenceFailure,
} from "./internal/diagnostics";

export { hooksLayer } from "./auth/defaults";
export { keyValueRateLimiterStore } from "./auth/rateLimiter";
export { CleanupLimit, CleanupResult } from "./persistence/cleanup";
