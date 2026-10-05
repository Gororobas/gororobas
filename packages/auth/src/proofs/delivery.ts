import { Effect, Layer, type Context, type Redacted, Schema } from "effect";

import type { LoginIdentifier } from "../identity/models";
import { reportAuthFailure } from "../internal/diagnostics";
import { ProofConfigurationError } from "./errors";
import {
  ProofDeliveryOutcome,
  type ProofDeliveryId,
  type ProofPurpose,
  type ProofReference,
} from "./models";

export interface ProofDeliveryMessage {
  readonly deliveryId: ProofDeliveryId;
  readonly purpose: ProofPurpose;
  readonly reference: ProofReference;
  readonly recipient: LoginIdentifier;
  readonly secret: Redacted.Redacted<string>;
  readonly format: "token" | "numeric-code";
  readonly expiresAtMillis: number;
  readonly template: string;
  readonly locale: string;
}

export const ProofVendorPolicy = Schema.Struct({
  vendorId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
  /** A consumer asserts the vendor deduplicates identical delivery IDs for this horizon. */
  idempotencyMillis: Schema.Natural,
});

export type ProofVendorPolicy = typeof ProofVendorPolicy.Type;

export interface ProofDelivery {
  readonly vendor: ProofVendorPolicy;
  /** Acceptance by vendor is not delivery to the recipient. Typed failures become
   * ambiguous; defects/interruption propagate after dispatch attempts ambiguous settlement.
   * No diagnostic/body escapes the public operation boundary. */
  readonly send: (message: ProofDeliveryMessage) => Effect.Effect<ProofDeliveryOutcome>;
}

export const proofDeliveryLayer = <Id, E, R>(
  service: Context.Key<Id, ProofDelivery>,
  vendor: ProofVendorPolicy,
  send: (message: ProofDeliveryMessage) => Effect.Effect<ProofDeliveryOutcome, E, R>,
) => {
  const configuration = { ...vendor };
  const callback = send;

  return Layer.effect(
    service,
    Effect.gen(function* () {
      const checked = Object.freeze(
        yield* Schema.decodeEffect(ProofVendorPolicy)(configuration).pipe(
          Effect.mapError(() => ProofConfigurationError.make({ reason: "delivery" })),
        ),
      );

      const services = yield* Effect.context<R>();

      return {
        vendor: checked,
        send: (message: ProofDeliveryMessage) =>
          Effect.suspend(() => callback(message)).pipe(
            Effect.provide(services),
            Effect.flatMap(Schema.decodeEffect(ProofDeliveryOutcome)),
            Effect.tapCause((cause) => reportAuthFailure("proof-delivery", cause)),
            Effect.catch(() => Effect.succeed({ _tag: "Ambiguous" as const })),
          ),
      };
    }),
  );
};
