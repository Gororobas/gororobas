import { Context, type Effect } from "effect";
import type { Statement } from "effect/sql/Statement";

/** Appends application statements to the current coordinator's single atomic batch. */
export class D1BatchStatements extends Context.Service<
  D1BatchStatements,
  {
    readonly append: (statement: Statement<unknown>) => Effect.Effect<void>;
  }
>()("effect-auth/D1BatchStatements") {}
