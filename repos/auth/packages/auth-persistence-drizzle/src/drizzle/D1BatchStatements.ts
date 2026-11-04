import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Statement from "effect/sql/Statement";

/** Appends application statements to the current coordinator's single atomic batch. */
export class D1BatchStatements extends Context.Service<
  D1BatchStatements,
  {
    readonly append: (statement: Statement.Statement<unknown>) => Effect.Effect<void>;
  }
>()("effect-auth/D1BatchStatements") {}
