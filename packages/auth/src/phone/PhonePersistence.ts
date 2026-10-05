import { Context, type Effect } from "effect";

import type { CommitJournal, PreparedCommit } from "../hooks/commit";
import type { ProofCompletionPlan } from "../proofs/completion";
import type { SubjectId } from "../Schema";
import type {
  PhoneActionAuthorization,
  PhoneLifecycleAction,
  PhoneLifecyclePolicy,
  PhoneLifecycleTarget,
  PhoneMutationDecision,
} from "./lifecycleModels";
import type { PhoneNumber, PhoneOtpUnavailable } from "./models";

export interface PhoneMutation {
  readonly moduleId: string;
  readonly action: PhoneLifecycleAction;
  readonly commandId: string;
  readonly target: PhoneLifecycleTarget;
  readonly authorization?: PhoneActionAuthorization;
  readonly completion: ProofCompletionPlan;
  readonly policy: PhoneLifecyclePolicy;
}

/** Custody tombstones are permanent. Recycled numbers never create, transfer or
 * merge accounts automatically. Verification/change and continuation consumption
 * share one native owner; a failed protected write cannot consume the proof. */
export class PhonePersistence extends Context.Service<
  PhonePersistence,
  {
    readonly target: (input: {
      readonly moduleId: string;
      readonly action: PhoneLifecycleAction;
      readonly phoneNumber: PhoneNumber;
      readonly subjectId?: SubjectId;
      readonly sourcePhoneNumber?: PhoneNumber;
    }) => Effect.Effect<PhoneLifecycleTarget, PhoneOtpUnavailable>;
    readonly mutate: <A>(
      input: PhoneMutation,
      prepare: (decision: PhoneMutationDecision, journal: CommitJournal) => PreparedCommit<A>,
    ) => Effect.Effect<PreparedCommit<A>, PhoneOtpUnavailable>;
  }
>()("effect-auth/PhonePersistence") {}
