import { Schema } from "effect";

import type { SessionCapabilities } from "./models";
import type { SessionPolicy } from "./policy";

export const SessionInvalidationTrigger = Schema.Literals([
  "password-reset",
  "factor-reset",
  "credential-change",
  "subject-disable",
  "subject-delete",
  "identifier-change",
  "all-session-revocation",
]);

export type SessionInvalidationTrigger = typeof SessionInvalidationTrigger.Type;

export const SessionInvalidationWindow = Schema.Struct({
  trigger: SessionInvalidationTrigger,
  existingSessions: Schema.Literals(["immediate", "original-absolute-expiry"]),
  maximumExposureMillis: Schema.Natural,
  oldAuthenticationEvidence: Schema.Literal("rejected"),
});

export type SessionInvalidationWindow = typeof SessionInvalidationWindow.Type;

/**
 * Report only AFTER the consumer commits the mutation and security-revision bump
 * in the same authority. Disable/delete also prevent fresh issuance; a reset
 * permits fresh verification using the replacement credential. Pure stateless
 * renewal preserves each old token's absolute bound and may replay until then.
 */
export const sessionInvalidationWindow = (
  trigger: SessionInvalidationTrigger,
  capabilities: SessionCapabilities,
  policy: SessionPolicy,
): SessionInvalidationWindow => ({
  trigger,
  existingSessions:
    capabilities.subjectInvalidation === "immediate" ? "immediate" : "original-absolute-expiry",
  maximumExposureMillis:
    capabilities.subjectInvalidation === "immediate"
      ? 0
      : policy.maximumIssuedAbsoluteLifetimeMillis,
  oldAuthenticationEvidence: "rejected",
});
