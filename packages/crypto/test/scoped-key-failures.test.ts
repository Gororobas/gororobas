import { it } from "@effect/vitest";
import { Hmac } from "@yielded/crypto/Hmac";
import * as WebCrypto from "@yielded/crypto/WebCrypto";
import { Cause, Deferred, Effect, Exit, Fiber, Redacted, Scope } from "effect";
import { expect } from "vite-plus/test";

// 536a76b6c introduced availability checks and interrupt-only joining that
// discard child defects (reproduced at 4ea887e2). Gate native completion to
// force termination before the configured host reports its failure.
for (const termination of ["owner", "caller"] as const) {
  it.effect(`preserves a scoped key defect during ${termination} termination`, () =>
    Effect.gen(function* () {
      const defect = { nativeAdapter: "audit" };
      const entered = yield* Deferred.make<void>();
      let finish: ((value: unknown) => void) | undefined;

      const subtle = new Proxy(globalThis.crypto.subtle, {
        get(target, property) {
          if (property === "sign")
            return () =>
              new Promise<ArrayBuffer>((_resolve, reject) => {
                finish = reject;
                Deferred.doneUnsafe(entered, Effect.void);
              });
          const value = Reflect.get(target, property, target);

          return typeof value === "function" ? value.bind(target) : value;
        },
      });

      const owner = yield* Scope.make();
      const hmac = yield* Hmac.pipe(Effect.provide(WebCrypto.layerHmac(subtle)));

      const key = yield* hmac
        .importKey({ algorithm: "SHA-256", key: Redacted.make(new Uint8Array(32)) })
        .pipe(Effect.provideService(Scope.Scope, owner));

      const active = yield* Effect.forkChild(key.sign(new Uint8Array()));

      yield* Deferred.await(entered);
      yield* Effect.yieldNow;

      const stopping = yield* Effect.forkChild(
        termination === "owner" ? Scope.close(owner, Exit.void) : Fiber.interrupt(active),
        { startImmediately: true },
      );

      const pending = stopping.pollUnsafe() === undefined;

      // The configured host's error accessor defects inside classification;
      // ordinary native rejections still keep their finite privacy conversion.
      finish?.({
        get name() {
          throw defect;
        },
      });
      yield* Fiber.join(stopping);
      const exit = yield* Fiber.await(active);

      yield* Scope.close(owner, Exit.void);
      expect(pending).toBe(true);
      expect(
        Exit.isFailure(exit) &&
          exit.cause.reasons.some((r) => Cause.isDieReason(r) && r.defect === defect),
      ).toBe(true);
      expect((yield* key.sign(new Uint8Array()).pipe(Effect.flip))._tag).toBe("CryptoUnavailable");
    }),
  );
}
