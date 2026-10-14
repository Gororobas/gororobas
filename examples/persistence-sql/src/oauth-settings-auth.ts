import { Auth, Hooks, OAuth, Sessions } from "@yielded/auth";
import { Effect, Layer, Option, Schema } from "effect";

import { requirement } from "../../shared/oauth/storage";
import { SettingsApi } from "./oauth-settings-contract";

export const moduleId = "browser/oauth-settings";
export const sessionConfiguration = Sessions.stateAssisted({ maxAge: "8 hours" });

export const SettingsAuth = Auth.make(SettingsApi, {
  sessions: sessionConfiguration,
  strategies: {
    oauth: OAuth.make({ namespace: moduleId }),
    accounts: OAuth.makeAccounts({
      namespace: moduleId,
      policy: {
        ...OAuth.defaultOAuthSignInPolicy,
        maximumEvidenceAgeMillis: 300_000,
        requireImmediateInvalidation: true,
      },
    }),
  },
});

const SessionReader = SettingsAuth.sessions
  .stateAssistedLayer(sessionConfiguration.policy(SettingsAuth.sessions.moduleId))
  .pipe(Layer.provide(Hooks.LifecycleHooks.empty));

export const SettingsActionsLive = Layer.effect(
  OAuth.OAuthActionEvidence,
  Effect.gen(function* () {
    const sessions = yield* SettingsAuth.sessions.SessionStrategy;

    return OAuth.OAuthActionEvidence.of({
      verify: Effect.fn("OAuthSettings.authorize")(
        function* ({ invocation, challenge }) {
          const request = yield* Effect.serviceOption(Auth.AuthRequest);
          const token = Option.isSome(request) ? request.value.credentials.session : undefined;

          if (invocation._tag !== "Authenticated" || token === undefined)
            return yield* OAuth.OAuthActionRequired.make({});

          const { inspection } = yield* SettingsAuth.sessions
            .inspectInvocation(invocation, token)
            .pipe(Effect.provideService(SettingsAuth.sessions.SessionStrategy, sessions));

          const original = inspection.provenance.evidence;

          if (
            original.revision.subjectId !== challenge.revision.subjectId ||
            original.revision.securityRevision !== challenge.revision.securityRevision ||
            original.revision.credentials.some(
              (old) =>
                !challenge.revision.credentials.some(
                  (current) =>
                    current.credentialId === old.credentialId && current.revision === old.revision,
                ),
            )
          )
            return yield* OAuth.OAuthActionRequired.make({});

          // Preserve factor identity and time. Core checks five-minute freshness;
          // linking carries this one authorization through callback completion.
          return {
            source: {
              _tag: "Session" as const,
              sessionId: inspection.session.sessionId,
              authenticatedAt: inspection.session.assurance.authenticatedAt,
            },
            evidence: {
              ...original,
              revision: challenge.revision,
              flowId: Sessions.AuthenticationFlowId.make(challenge.flowId),
              bindingDigest: challenge.bindingDigest,
            },
            requirement,
          };
        },
        Effect.mapError((error) =>
          Schema.is(OAuth.OAuthActionRequired)(error) || Schema.is(Sessions.SessionInvalid)(error)
            ? OAuth.OAuthActionRequired.make({})
            : OAuth.OAuthUnavailable.make({}),
        ),
      ),
    });
  }),
).pipe(Layer.provide(SessionReader));
