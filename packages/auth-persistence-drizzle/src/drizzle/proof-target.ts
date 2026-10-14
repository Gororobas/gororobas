import {
  makeNativeProofServices,
  requireStandalone,
  type AnyProofPersistenceMapping as SharedMapping,
} from "@yielded/auth-persistence/Adapter";
import { ProofUnavailable, ProofPersistence } from "@yielded/auth/Proofs";
import { Effect, Layer } from "effect";

import { nativeClock } from "./native-clock";
import type { NativeDatabaseHandle } from "./native-database";
import {
  coordinateNativeTarget,
  nativeTarget,
  type NativeTargetConfiguration,
} from "./native-target";
import type { AnyProofPersistenceMapping } from "./proof-model";
import { validateDrizzleStorage } from "./storage-validation";

const unavailable = () => ProofUnavailable.make({});

export const sqlClientProofStandaloneGuard = (marker: Parameters<typeof requireStandalone>[1]) =>
  requireStandalone(unavailable, marker);

export const nativeProofMapping = (value: AnyProofPersistenceMapping): SharedMapping => ({
  ...value,
  clock: nativeClock(value.clock),
});

export const makeTargetProofPersistenceServices = Effect.fnUntraced(function* (
  source: AnyProofPersistenceMapping,
  configuration: NativeTargetConfiguration,
) {
  yield* validateDrizzleStorage(source).pipe(Effect.mapError(unavailable));
  if (configuration.mode === "batch" && source.d1?.primary !== true) return yield* unavailable();
  const target = yield* nativeTarget(configuration);

  return yield* target.provide(makeNativeProofServices(target.tables, nativeProofMapping(source)));
});

export const coordinateTargetProofPersistence = <Transaction, A, E, R>(
  database: NativeDatabaseHandle,
  source: AnyProofPersistenceMapping,
  configuration: NativeTargetConfiguration,
  body: (
    transaction: Transaction,
    services: { readonly proofPersistence: ProofPersistence["Service"] },
  ) => Effect.Effect<A, E, R>,
) =>
  coordinateNativeTarget(
    unavailable,
    database,
    configuration,
    makeTargetProofPersistenceServices(source, configuration),
    body,
  );

export const proofPersistenceLayer = <E, R>(
  services: Effect.Effect<{ readonly proofPersistence: ProofPersistence["Service"] }, E, R>,
) =>
  Layer.effect(
    ProofPersistence,
    Effect.map(services, (value) => value.proofPersistence),
  );
