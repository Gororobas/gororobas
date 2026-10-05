import { Context, Effect, Layer, Result, Schema } from "effect";

import { cryptoLayer } from "../auth/defaults";
import type { AnyRoute } from "../http-operation/contract";
import { OperationHttpConfigurationError, OperationHttpError } from "../http-operation/errors";
import { oauthCallback, type OAuthHttpCallback } from "../http-operation/server";
import { origin as Origin } from "../internal/origin";
import { selectCallback } from "../oauth/callback";
import { OAuthConnectedProtocol } from "../oauth/OAuthConnectedProtocol";
import { OAuthProtocol } from "../oauth/OAuthProtocol";
import type { ProviderDefinition } from "../oauth/providerDefinition";
import { OAuthProviderKey } from "../oauth/schema";
import { OAuthRejected, OAuthUnavailable } from "../oauth/signInErrors";
import { OAuthCallbackId, OAuthRedirectUri } from "../oauth/signInModels";
import type { AuthActions } from "../operations/actions";
import { makeRequestBindingFlowResolver } from "../operations/requestBinding";

export interface OAuthCallbackOptions<R = never> {
  /** Defaults to the contract base path followed by /{provider}/callback. */
  readonly path?: `/${string}`;
  /** Defaults to the provider key. */
  readonly callbackId?: string;
  readonly allowedQueryParameters?: ReadonlyArray<string>;
  /** Render an application-owned continuation, such as registration or MFA.
   * Receives only the schema-encoded public result; credentials remain cookies. */
  readonly respond?: OAuthHttpCallback<R>["respond"];
}

export interface OAuthOptions<E = never, R = never, ResponseR = never> {
  readonly providers: Readonly<Record<string, ProviderDefinition<E, R>>>;
  /** Select explicitly when the contract has multiple OAuth completion actions. */
  readonly complete?: string;
  /** Override the default redirect for every provider. A callback may override it. */
  readonly respond?: OAuthHttpCallback<ResponseR>["respond"];
  readonly callbacks?: Readonly<
    Record<string, OAuthCallbackOptions<ResponseR> | ReadonlyArray<OAuthCallbackOptions<ResponseR>>>
  >;
}

const Path = Schema.String.check(Schema.isPattern(/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/));
const ProviderKey = OAuthProviderKey.check(Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9_-]*$/));

/** HTTP owns binding and routing; provider adapters own their implementation.
 * Each declaration supplies one provider's retained generations. Distinct paths
 * keep callback identities isolated even when a host does not return an issuer. */
export const makeOAuth = <E, R, ResponseR>(
  options: OAuthOptions<E, R, ResponseR>,
  origin: string,
  basePath: string,
  actions: AuthActions,
) => {
  const resolve = () => {
    try {
      Schema.decodeSync(Origin)(origin);
      const names = Object.keys(options.providers);

      if (
        names.length === 0 ||
        Object.keys(options.callbacks ?? {}).some((key) => !names.includes(key))
      )
        throw OperationHttpConfigurationError.make({ reason: "callback" });

      const selected = Object.entries(actions).filter(
        ([name, action]) =>
          action.oauthCallback === true &&
          (options.complete === undefined || name === options.complete),
      );

      if (selected.length !== 1) throw OperationHttpConfigurationError.make({ reason: "callback" });
      const [complete, action] = selected[0]!;

      if (
        action.mode !== "mutation" ||
        action.route.operation.replay !== "single-use" ||
        !action.route.operation.credentials ||
        action.requestFields.requestBinding !== "request-binding"
      )
        throw OperationHttpConfigurationError.make({ reason: "callback" });

      const paths = new Set(Object.values(actions).map((action) => String(action.route.path)));

      const entries = Object.entries(options.providers).map(([name, declaration]) => {
        const provider = Schema.decodeSync(ProviderKey)(name);
        const configured = options.callbacks?.[name];

        const callbacks =
          configured === undefined ? [{}] : Array.isArray(configured) ? configured : [configured];

        const ids = new Set<string>();

        if (callbacks.length === 0 || callbacks.length > 16)
          throw OperationHttpConfigurationError.make({ reason: "callback" });

        return {
          provider,
          declaration,
          callbacks: callbacks.map((callback: OAuthCallbackOptions<ResponseR>) => {
            const callbackId = Schema.decodeSync(OAuthCallbackId)(callback.callbackId ?? provider);

            const path = Schema.decodeSync(Path)(
              callback.path ?? `${basePath}/${provider}/callback`,
            );

            if (paths.has(path) || ids.has(callbackId))
              throw OperationHttpConfigurationError.make({ reason: "duplicate-route" });
            paths.add(path);
            ids.add(callbackId);

            return {
              ...callback,
              path,
              callbackId,
              redirectUri: Schema.decodeSync(OAuthRedirectUri)(`${origin}${path}`),
            };
          }),
        };
      });

      return { complete, entries };
    } catch (error) {
      throw Schema.is(OperationHttpConfigurationError)(error)
        ? error
        : OperationHttpConfigurationError.make({ reason: "callback" });
    }
  };

  // Snapshot URL/route selection once so independently built route and provider
  // Layers cannot observe different mutations of the caller's configuration.
  const saved = Result.try({
    try: resolve,
    catch: (error) =>
      Schema.is(OperationHttpConfigurationError)(error)
        ? error
        : OperationHttpConfigurationError.make({ reason: "callback" }),
  });

  const configuration = Effect.fromResult(saved);
  const respond = options.respond;

  const layer = Layer.effectContext(
    Effect.gen(function* () {
      const { entries } = yield* configuration;

      const installed = yield* Effect.forEach(
        entries,
        (entry) =>
          Effect.map(
            entry.declaration.configure(entry),
            (protocol) => [entry.provider, protocol] as const,
          ),
        { concurrency: 4 },
      );

      const protocols = new Map(installed);

      const signIn = OAuthProtocol.of({
        prepareAuthorization: (input) =>
          protocols.get(input.provider)?.prepareAuthorization(input) ?? OAuthRejected.make({}),
        exchangeVerifiedIdentity: (input) =>
          protocols.get(input.configuration.provider)?.exchangeVerifiedIdentity(input) ??
          OAuthUnavailable.make({}),
      });

      const connected = OAuthConnectedProtocol.of({
        prepareAuthorization: (input) =>
          protocols.get(input.profile.provider)?.connected?.prepareAuthorization(input) ??
          OAuthUnavailable.make({}),
        exchangeGrant: (input) =>
          protocols.get(input.configuration.provider)?.connected?.exchangeGrant(input) ??
          OAuthUnavailable.make({}),
        refreshGrant: (input) =>
          protocols.get(input.context.configuration.provider)?.connected?.refreshGrant(input) ??
          OAuthUnavailable.make({}),
        revokeGrant: (input) =>
          protocols.get(input.context.configuration.provider)?.connected?.revokeGrant(input) ??
          OAuthUnavailable.make({}),
      });

      return Context.make(OAuthProtocol, signIn).pipe(
        Context.add(OAuthConnectedProtocol, connected),
      );
    }),
  );

  const callbacks = <Routes extends Readonly<Record<string, AnyRoute>>>(routes: Routes) =>
    Effect.gen(function* () {
      const { complete, entries } = yield* configuration;

      const flowId = yield* makeRequestBindingFlowResolver("oauth-entry").pipe(
        Effect.provide(cryptoLayer),
      );

      // The selected name was validated against the same action table. Preserve
      // that table's concrete operation requirements through indexed lookup.
      const route = routes[complete] as Routes[keyof Routes] | undefined;

      if (route === undefined)
        return yield* OperationHttpConfigurationError.make({ reason: "callback" });

      return entries.flatMap((entry) =>
        entry.callbacks.map((callback) => {
          const { respond: configuredRespond, ...callbackOptions } = callback;
          const callbackRespond = configuredRespond ?? respond;

          return oauthCallback<Routes[keyof Routes], ResponseR>(route, {
            ...callbackOptions,
            ...(callbackRespond === undefined ? {} : { respond: callbackRespond }),
            provider: entry.provider,
            requestBinding: "context",
            allowedRedirectOrigins: [],
            flowId: (_request, credentials) => {
              const credential = credentials["request-binding"];

              return credential === undefined
                ? OperationHttpError.make({ reason: "credentials" })
                : flowId(credential).pipe(
                    Effect.mapError((error) =>
                      OperationHttpError.make({
                        reason:
                          error._tag === "RequestBindingUnavailable"
                            ? "unavailable"
                            : "credentials",
                      }),
                    ),
                  );
            },
          });
        }),
      );
    });

  const callbackUrl = (provider: string, callbackId?: string) => {
    const entry = Result.getOrThrow(saved).entries.find((entry) => entry.provider === provider);

    const callback =
      entry === undefined ? undefined : selectCallback(provider, entry.callbacks, callbackId);

    if (callback === undefined) throw OperationHttpConfigurationError.make({ reason: "callback" });

    return callback.redirectUri;
  };

  return { layer, callbacks, callbackUrl };
};
