import { Context, type DateTime, type Effect } from "effect";

import type {
  IdentityConflict,
  IdentityUnavailable,
  LoginIdentifier,
  ProvisioningResult,
} from "./models";

/**
 * Trusted method input after its registration proof/policy has been checked.
 * This is a service input, never a remotely exposed registration payload.
 * Omit verifiedAt for password-only registration with an unverified identifier.
 */
export type SubjectProvisioningInput = { readonly requestId: string } & (
  | { readonly identifier?: never; readonly verifiedAt?: never }
  | { readonly identifier: LoginIdentifier; readonly verifiedAt?: DateTime.Utc }
);

/**
 * Application authority for subject creation and initial identifier binding.
 *
 * Repeating a requestId with the same input must resolve the same subject;
 * repeating it with different input must fail. Identifier uniqueness and
 * provisioning commit together when they share an authority. Cross-authority
 * implementations return ProvisioningPending until reconciliation is complete,
 * never an authenticated result for a partially provisioned account.
 *
 * This port does not create a session or bind method-specific credentials. The
 * method's registration coordinator owns that atomic boundary (or exposes its
 * pending recovery outcome) before it can issue an authenticated result.
 */
export class SubjectProvisioner extends Context.Service<
  SubjectProvisioner,
  {
    readonly provision: (
      input: SubjectProvisioningInput,
    ) => Effect.Effect<ProvisioningResult, IdentityConflict | IdentityUnavailable>;
  }
>()("effect-auth/SubjectProvisioner") {}
