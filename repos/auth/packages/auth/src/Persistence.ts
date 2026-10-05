/** Primitives for application-owned persistence implementations and transaction adapters. */
export { CurrentCommitJournal } from "./hooks/commit";
export { reportAuthFailure, reportPersistenceFailure } from "./internal/diagnostics";
export { cryptoLayer, hooksLayer } from "./auth/defaults";
