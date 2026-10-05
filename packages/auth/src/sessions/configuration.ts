import { Duration, Layer, type Schema, type Scope } from "effect";

import { cryptoLayer, hooksLayer } from "../auth/defaults";
import type { SessionSigningKeyring } from "./crypto";
import { SessionConfigurationError } from "./errors";
import type { makeSessionModule, ModuleService } from "./module";
import type { SessionPolicy } from "./policy";

export interface SessionOptions {
  readonly idleTimeout?: Duration.Input;
  readonly maxAge?: Duration.Input;
  readonly renewAfter?: Duration.Input;
  readonly issuer?: string;
  readonly audience?: string;
  readonly generation?: number;
  /** Retain the greatest maxAge of still-usable issued tokens after reducing policy. */
  readonly maximumIssuedAge?: Duration.Input;
  readonly maximumTokenBytes?: number;
}

export interface StatefulConfiguration {
  readonly mode: "stateful";
  readonly policy: (namespace: string) => SessionPolicy;
}

export interface StatelessConfiguration {
  readonly mode: "stateless";
  readonly policy: (namespace: string) => SessionPolicy;
  readonly keys: SessionSigningKeyring;
}

export interface StateAssistedConfiguration {
  readonly mode: "state-assisted";
  readonly policy: (namespace: string) => SessionPolicy;
  readonly keys: SessionSigningKeyring;
}

export type SessionConfiguration =
  | StatefulConfiguration
  | StatelessConfiguration
  | StateAssistedConfiguration;

const policy = (options: SessionOptions, immediate: boolean) => {
  let values: Omit<SessionPolicy, "issuer" | "audience">;

  try {
    const maxAge = Duration.toMillis(options.maxAge ?? (immediate ? "30 days" : "15 minutes"));

    const idle = Duration.toMillis(
      options.idleTimeout ?? Math.min(maxAge, Duration.toMillis("7 days")),
    );

    values = Object.freeze({
      generation: options.generation ?? 1,
      idleLifetimeMillis: idle,
      absoluteLifetimeMillis: maxAge,
      renewalIntervalMillis: Duration.toMillis(
        options.renewAfter ?? Math.min(Math.floor(idle / 2), Duration.toMillis("1 day")),
      ),
      maximumIssuedAbsoluteLifetimeMillis: Duration.toMillis(options.maximumIssuedAge ?? maxAge),
      maximumTokenBytes: options.maximumTokenBytes ?? 4096,
      requireImmediateInvalidation: immediate,
    });
  } catch {
    throw SessionConfigurationError.make({ reason: "policy" });
  }
  const issuer = options.issuer;
  const audience = options.audience;

  return (namespace: string): SessionPolicy => ({
    ...values,
    issuer: issuer ?? namespace,
    audience: audience ?? namespace,
  });
};

/** Authoritative sessions with immediate revocation; supply the bound persistence services. */
export const stateful = (options: SessionOptions = {}): StatefulConfiguration =>
  Object.freeze({ mode: "stateful", policy: policy(options, true) });

/** Database-free verification with a fifteen-minute default lifetime.
 * Sign-out clears this client's credential only; longer lifetimes require explicit policy. */
export const stateless = (
  options: SessionOptions & { readonly keys: SessionSigningKeyring },
): StatelessConfiguration =>
  Object.freeze({ mode: "stateless", policy: policy(options, false), keys: options.keys });

/** Signed credentials checked against application-owned validity state. */
export const stateAssisted = (
  options: SessionOptions & { readonly keys: SessionSigningKeyring },
): StateAssistedConfiguration =>
  Object.freeze({ mode: "state-assisted", policy: policy(options, true), keys: options.keys });

export type SessionRequirements<C, Id extends string, Claims extends Schema.Top> =
  | Exclude<Claims["DecodingServices"] | Claims["EncodingServices"], Scope.Scope>
  | (C extends StatefulConfiguration
      ?
          | ModuleService<Id, "persistence", Claims["Type"]>
          | ModuleService<Id, "repository", Claims["Type"]>
      : C extends StateAssistedConfiguration
        ? ModuleService<Id, "validity", Claims["Type"]>
        : never);

export const configuredLayer = <
  const Id extends string,
  Claims extends Schema.Codec<unknown, unknown, unknown, unknown>,
  C extends SessionConfiguration,
>(
  sessions: ReturnType<typeof makeSessionModule<Id, Claims>>,
  configuration: C,
): Layer.Layer<
  ModuleService<Id, "strategy", Claims["Type"]>,
  SessionConfigurationError,
  SessionRequirements<C, Id, Claims>
> => {
  const configured = configuration.policy(sessions.moduleId);

  const defaults = <A, E, R>(layer: Layer.Layer<A, E, R>) =>
    layer.pipe(Layer.provide([cryptoLayer, hooksLayer]));

  const layer =
    configuration.mode === "stateful"
      ? defaults(sessions.statefulLayer(configured))
      : configuration.mode === "stateless"
        ? defaults(sessions.statelessLayer(configured, configuration.keys))
        : defaults(sessions.stateAssistedLayer(configured, configuration.keys));

  // The selected mode determines exactly which persistence port the layer acquires.
  return layer as Layer.Layer<
    ModuleService<Id, "strategy", Claims["Type"]>,
    SessionConfigurationError,
    SessionRequirements<C, Id, Claims>
  >;
};
