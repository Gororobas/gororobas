import { Atom as AuthAtom, OperationHttpClient as Fetch } from "@yielded/auth";
import * as PasskeyBrowser from "@yielded/auth-simplewebauthn/Browser";
import { Effect, Layer, Redacted } from "effect";
import { Atom } from "effect/reactivity";

import { transport } from "./studio-transport";

/** Keep this effect's scope open for the browser application. Render `current`
 * in the control registry and all account atoms in the current subject registry.
 * The host supplies an Effect HttpClient and the finite TOTP private reveal collector. */
export const makeStudioBrowser = Effect.fn("Studio.browser")(function* <R = never, RNative = never>(
  options: Fetch.OperationFetchOptions<R, RNative>,
  initialSubject: string | null = null,
) {
  const lifetime = yield* AuthAtom.makeLifetime({ initialSubject }).pipe(
    Effect.provide(Fetch.layer(options)),
  );

  const browser = yield* PasskeyBrowser.make();
  const runtime = Atom.context()(Layer.succeed(AuthAtom.AuthAtomLifetime, lifetime));
  const accountKeys = ["studio/member", "studio/keys", "studio/session"];

  const fromCompletion = (
    result: typeof transport.routes.completeSignIn.operation.rpc.successSchema.Type,
  ) => (result._tag === "Authenticated" ? result.session.subjectId : undefined);

  const signIn = AuthAtom.workflow<{ flowId: string; commandId: string }>()(
    runtime,
    (input) =>
      Effect.gen(function* () {
        const workflow = yield* AuthAtom.AuthAtomWorkflow;

        const started = yield* workflow.call(transport.routes.signIn, {
          ...input,
          profileId: "primary",
        });

        const response = yield* browser.authenticate({ started, mediation: "required" });

        yield* workflow.current;

        return yield* workflow.completeAuthentication(
          transport.routes.completeSignIn,
          { flowId: input.flowId, response: Redacted.value(response.response) },
          fromCompletion,
        );
      }),
    { reactivityKeys: accountKeys },
  );

  const mutation = <
    R extends typeof transport.routes.verifyTotp | typeof transport.routes.recoverPending,
  >(
    route: R,
  ) =>
    AuthAtom.mutation(route, {
      runtime,
      reactivityKeys: accountKeys,
      subject: { fromSuccess: fromCompletion },
    });

  return {
    lifetime,
    signIn,
    verifyTotp: mutation(transport.routes.verifyTotp),
    recoverPending: mutation(transport.routes.recoverPending),
    member: AuthAtom.query(transport.routes.member, undefined, {
      runtime,
      reactivityKeys: ["studio/member"],
    }),
    keys: AuthAtom.query(
      transport.routes.listKeys,
      { limit: 20 },
      {
        runtime,
        reactivityKeys: ["studio/keys"],
      },
    ),
    renameKey: AuthAtom.mutation(transport.routes.renameKey, {
      runtime,
      reactivityKeys: ["studio/keys"],
    }),
    signOut: AuthAtom.mutation(transport.routes.signOut, {
      runtime,
      reactivityKeys: accountKeys,
      subject: { fromSuccess: () => null },
    }),
  };
});
