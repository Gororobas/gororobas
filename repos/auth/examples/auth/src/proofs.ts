import { BunRuntime } from "@effect/platform-bun";
import { EmailDelivery, Hooks, Proofs, WebCrypto } from "@yielded/auth";
import { Effect, Layer, Redacted } from "effect";
import { Base64Url } from "effect/encoding";

import { makeExampleProofAuthority } from "./proof-consumer";

const budget = { limit: 20, windowMillis: 60_000 };

const policy: Proofs.ProofPolicy = {
  lifetimeMillis: 60_000,
  maximumFailedAttempts: 3,
  abuse: {
    issues: budget,
    attempts: budget,
    subjectIssues: budget,
    subjectAttempts: budget,
    actionIssues: budget,
    actionAttempts: budget,
    resendCooldownMillis: 0,
  },
};

const base = Layer.mergeAll(
  WebCrypto.layerWebCrypto,
  Proofs.ProofDispatchScheduler.layerInline,
  Hooks.LifecycleHooks.empty,
  Proofs.ProofKeys.layer({
    activeKeyId: "current",
    keys: [
      {
        id: "current",
        // Demo-only key material. Production requires independently generated random keys.
        material: Redacted.make(Base64Url.encode(new Uint8Array(32).fill(23))),
      },
    ],
  }),
);

const authority = Layer.unwrap(makeExampleProofAuthority).pipe(Layer.provide(base));
// Trusted method authority resolves eligibility/binding. An HTTP client never supplies it.
const invocation = { _tag: "System", authority: "example-method" } as const;

const program = Effect.gen(function* () {
  for (const channel of ["email", "sms"] as const) {
    const delivered: Redacted.Redacted<string>[] = [];

    const sender = (message: Proofs.ProofDeliveryMessage) =>
      Effect.sync(() => {
        delivered.push(message.secret);

        return { _tag: "Accepted" as const };
      });

    const proofs = Proofs.make({
      namespace: `example/${channel}`,
      purpose: Proofs.ProofPurpose.make(`${channel}-verification`),
      binding: Proofs.IdentifierProofBinding,
      channel,
      template: "verify-identifier",
      secret: channel === "email" ? { _tag: "NumericCode", digits: 6 } : { _tag: "Token" },
      policy,
    });

    const capability = (
      channel === "email"
        ? proofs.emailLayer.pipe(
            Layer.provide(
              Layer.succeed(EmailDelivery.EmailDelivery, {
                send: (message) =>
                  Effect.sync(() => {
                    delivered.push(
                      Redacted.make(
                        Redacted.value(message.text).match(/code is ([0-9]+)/)?.[1] ?? "",
                      ),
                    );
                  }),
              }),
            ),
          )
        : proofs.smsLayer.pipe(Layer.provide(Proofs.SmsProofDelivery.layer(sender)))
    ).pipe(Layer.provide(authority), Layer.provide(base));

    const handlers = proofs.handlersLayer.pipe(Layer.provide(capability));

    const binding = {
      _tag: "Identifier",
      flowId: `${channel}-flow`,
      contextDigest: "example-action-and-replacement-fingerprint",
      identifier: {
        namespace: channel,
        value: channel === "email" ? "reader@example.invalid" : "+15555550123",
      },
    } as const;

    yield* Effect.gen(function* () {
      // The hardening request requires rejecting unsafe locale input before delivery.
      const invalidLocale = yield* proofs.operations.Request.invoke(invocation, {
        requestId: Proofs.ProofRequestId.make(`${channel}-request`),
        binding,
        locale: "en\nInjected",
        eligible: true,
      }).pipe(Effect.result);

      if (invalidLocale._tag !== "Failure" || delivered.length > 0)
        return yield* Effect.die("invalid locale reached proof delivery");

      const receipt = yield* proofs.operations.Request.invoke(invocation, {
        requestId: Proofs.ProofRequestId.make(`${channel}-request`),
        binding,
        locale: "en-ZA",
        eligible: true,
      });

      const resent = yield* proofs.operations.Request.invoke(invocation, {
        requestId: Proofs.ProofRequestId.make(`${channel}-resend`),
        binding,
        locale: "en-ZA",
        eligible: true,
      });

      const first = delivered[0];
      const latest = delivered[1];

      if (!first || !latest) return yield* Effect.die("example delivery missing");

      const superseded = yield* proofs.operations.Redeem.invoke(invocation, {
        reference: receipt.reference,
        binding,
        credential: Redacted.value(first),
      }).pipe(Effect.result);

      if (superseded._tag !== "Failure") return yield* Effect.die("superseded proof accepted");

      yield* proofs.operations.Redeem.invoke(invocation, {
        reference: resent.reference,
        binding,
        credential: Redacted.value(latest),
      });

      const replay = yield* proofs.operations.Redeem.invoke(invocation, {
        reference: resent.reference,
        binding,
        credential: Redacted.value(latest),
      }).pipe(Effect.result);

      if (replay._tag !== "Failure") return yield* Effect.die("proof replay accepted");
      yield* Effect.log(
        `${channel}: reissue superseded the previous code; direct redemption accepted once`,
      );
    }).pipe(Effect.provide(handlers));
  }
});

BunRuntime.runMain(program);
