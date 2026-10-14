import {
  makeNativePhoneServices,
  type AnyPhoneMapping as SharedMapping,
} from "@yielded/auth-persistence/Adapter";
import {
  PhoneOtpUnavailable,
  PhoneLifecyclePolicy,
  PhoneConfigurationError,
} from "@yielded/auth/PhoneOtp";
import { Effect, Schema } from "effect";

import { NativeDatabase, type NativeDatabaseHandle } from "./native-database";
import {
  coordinateNativeTarget,
  nativeTarget,
  type NativeTargetConfiguration,
} from "./native-target";
import { type AnyPhoneMapping, type PhonePersistenceServices } from "./phone-model";
import { nativeProofMapping } from "./proof-target";
import { validateDrizzleStorage } from "./storage-validation";

const unavailable = () => PhoneOtpUnavailable.make({});

const validate = Effect.fnUntraced(
  function* (source: AnyPhoneMapping, configuration: NativeTargetConfiguration) {
    yield* validateDrizzleStorage(source);
    yield* validateDrizzleStorage(source.proofs);
    yield* Schema.decodeEffect(PhoneLifecyclePolicy)(source.policy);
    if (configuration.mode === "batch" && source.proofs.d1?.primary !== true)
      return yield* PhoneConfigurationError.make({});
  },
  Effect.mapError(() => PhoneConfigurationError.make({})),
);

const services = Effect.fnUntraced(function* (
  source: AnyPhoneMapping,
  configuration: NativeTargetConfiguration,
) {
  const target = yield* nativeTarget(configuration);
  const mapping: SharedMapping = { ...source, proofs: nativeProofMapping(source.proofs) };

  return yield* target.provide(makeNativePhoneServices(target.tables, mapping));
});

export const makeTargetPhonePersistenceServices = (
  source: AnyPhoneMapping,
  configuration: NativeTargetConfiguration,
) => validate(source, configuration).pipe(Effect.andThen(services(source, configuration)));

export const coordinateTargetPhonePersistence = <Transaction, A, E, R>(
  database: NativeDatabaseHandle,
  source: AnyPhoneMapping,
  configuration: NativeTargetConfiguration,
  body: (transaction: Transaction, services: PhonePersistenceServices) => Effect.Effect<A, E, R>,
) =>
  validate(source, configuration).pipe(
    Effect.provideService(NativeDatabase, database),
    Effect.andThen(
      coordinateNativeTarget(
        unavailable,
        database,
        configuration,
        services(source, configuration),
        body,
      ),
    ),
  );
