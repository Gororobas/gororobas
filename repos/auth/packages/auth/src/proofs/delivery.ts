import { Effect, Layer, type Context, type Redacted, Schema } from "effect";

import type { LoginIdentifier } from "../identity/models";
import { reportAuthFailure } from "../internal/diagnostics";
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

export interface ProofDelivery {
  /** Acceptance by vendor is not delivery to the recipient. Typed failures become
   * ambiguous; defects/interruption propagate. The transport is invoked at most once
   * per committed issue in this process; no retry or external exactly-once claim.
   * No diagnostic/body escapes the public operation boundary. */
  readonly send: (message: ProofDeliveryMessage) => Effect.Effect<ProofDeliveryOutcome>;
}

export const proofDeliveryLayer = <Id, E, R>(
  service: Context.Key<Id, ProofDelivery>,
  send: (message: ProofDeliveryMessage) => Effect.Effect<ProofDeliveryOutcome, E, R>,
) => {
  const callback = send;

  return Layer.effect(
    service,
    Effect.gen(function* () {
      const services = yield* Effect.context<R>();

      return {
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
