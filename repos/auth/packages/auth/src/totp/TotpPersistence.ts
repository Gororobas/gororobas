import { Context, type Effect } from "effect";

import type { CommitJournal, PreparedCommit } from "../hooks/commit";
import type { SubjectId } from "../Schema";
import type { TotpUnavailable } from "./errors";
import type { TotpDecision, TotpMutation, TotpSnapshot } from "./models";

export type PrepareTotpCommit<A> = (
  value: TotpDecision,
  journal: CommitJournal,
) => PreparedCommit<A>;

/** Owns subject policy/revision, factor state and digest consumption in one native commit. */
export class TotpPersistence extends Context.Service<
  TotpPersistence,
  {
    readonly snapshot: (input: {
      readonly moduleId: string;
      readonly subjectId: SubjectId;
    }) => Effect.Effect<TotpSnapshot | undefined, TotpUnavailable>;
    readonly mutate: <A>(
      input: TotpMutation,
      prepare: PrepareTotpCommit<A>,
    ) => Effect.Effect<PreparedCommit<A>, TotpUnavailable>;
  }
>()("effect-auth/TotpPersistence") {}
