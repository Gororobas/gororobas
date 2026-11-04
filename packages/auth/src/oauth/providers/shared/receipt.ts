import * as OAuth from "@yielded/oauth/OAuth";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

import { OAuthProtocolRejected, OAuthUnavailable } from "../../signInErrors";
import { type TokenCompatibility } from "./compatibility";

/** Provider-specific raw fields are inspected before the generic token projection. */
export const tokens = Effect.fn("OpenIdConnect.tokens")(function* (
  receipt: OAuth.TokenReceipt,
  compatibility: TokenCompatibility | undefined,
  input: Parameters<TokenCompatibility["inspectReceipt"]>[1],
) {
  if (compatibility !== undefined)
    yield* compatibility.inspectReceipt({ ...receipt, body: Redacted.value(receipt.body) }, input);

  return yield* OAuth.tokens(receipt).pipe(
    Effect.catchCause((cause) =>
      Effect.failCause(
        Cause.map(cause, (error) =>
          error._tag === "OAuthRejected"
            ? OAuthProtocolRejected.make({})
            : OAuthUnavailable.make({}),
        ),
      ),
    ),
  );
});
