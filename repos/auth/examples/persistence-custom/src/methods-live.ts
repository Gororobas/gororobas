import { Hooks, Identity, Password, Schema as AuthSchema, Sessions } from "@yielded/auth";
import { reportAuthFailure } from "@yielded/auth/Persistence";
import { Cause, Crypto, DateTime, Effect, Layer, Option, Redacted, Schema } from "effect";
import { Base64Url } from "effect/encoding";

import { AppAuth } from "./auth";
import { Username } from "./contract";
import { AccountMethods } from "./methods";

/** Custom public registration and sign-in, with every dependency visible in this Layer. */
export const AccountMethodsLive = Layer.effect(
  AccountMethods,
  Effect.gen(function* () {
    const passwords = yield* AppAuth.strategies.password.Passwords;
    const registration = yield* AppAuth.strategies.password.RegistrationAuthority;
    const persistence = yield* Password.PasswordPersistence;
    const hasher = yield* Password.PasswordHashing;
    const limiter = yield* Password.PasswordAttemptLimiter;
    const authority = yield* Sessions.AuthenticationAuthority;
    const claims = yield* AppAuth.strategies.password.SessionClaims;
    const completion = yield* AppAuth.sessions.AuthenticationCompletion;
    const crypto = yield* Crypto.Crypto;
    const moduleId = AppAuth.strategies.password.persistence.moduleId;
    const attempts = Password.defaultPasswordMethodPolicy.attempts;

    return AccountMethods.of({
      register: Effect.fn("AccountMethods.register")(
        function* (request) {
          // Reuse the library's password policy and planning; account creation remains our authority.
          const plan = yield* passwords.planRegister(request);

          const receipt = yield* plan.commit.pipe(
            Effect.provideService(AppAuth.strategies.password.RegistrationAuthority, registration),
          );

          return yield* receipt.read.pipe(
            Effect.mapError(() => Password.PasswordUnavailable.make({})),
          );
        },
        Effect.catchTag("HookDenied", () => Password.PasswordRejected.make({})),
      ),
      signIn: Effect.fn("AccountMethods.signIn")(function* (input) {
        if (yield* Hooks.hasCommitScope) return yield* Password.PasswordMethodUnsupported.make({});
        const email = Schema.decodeOption(AuthSchema.Email)(input.login);

        const identifier = Identity.LoginIdentifier.make(
          email._tag === "Some"
            ? { namespace: "email", value: email.value }
            : {
                namespace: "username",
                value: yield* Schema.decodeEffect(Username)(input.login).pipe(
                  Effect.mapError(() => Password.PasswordRejected.make({})),
                ),
              },
        );

        const flowId = Sessions.AuthenticationFlowId.make(
          yield* crypto
            .randomUUIDv4()
            .pipe(Effect.mapError(() => Password.PasswordUnavailable.make({}))),
        );

        const admission = yield* Effect.gen(function* () {
          yield* limiter.check({
            moduleId,
            action: "sign-in",
            scope: "action",
            key: "sign-in",
            budget: attempts.action,
          });
          yield* limiter.check({
            moduleId,
            action: "sign-in",
            scope: "identifier",
            // Email keys match built-in sign-in; aliases also share the subject bucket.
            key: JSON.stringify([identifier.namespace, identifier.value]),
            budget: attempts.identifier,
          });

          const candidate = yield* persistence.findCredential({ moduleId, identifier });

          if (Option.isSome(candidate))
            yield* limiter.check({
              moduleId,
              action: "sign-in",
              scope: "subject",
              key: candidate.value.revision.subjectId,
              budget: attempts.subject,
            });

          return candidate;
        }).pipe(
          Effect.catchCause((cause) =>
            cause.reasons.every(
              (reason) =>
                Cause.isFailReason(reason) && Schema.is(Password.PasswordRejected)(reason.error),
            )
              ? Effect.succeed(undefined)
              : Effect.failCause(cause),
          ),
        );

        if (admission === undefined) {
          yield* Effect.uninterruptibleMask((restore) =>
            restore(hasher.dummy(input.password)).pipe(
              Effect.catchCause((cause) =>
                reportAuthFailure("password-hashing", cause).pipe(
                  Effect.andThen(
                    Cause.hasInterrupts(cause)
                      ? Effect.failCause(
                          Cause.fromReasons<never>(cause.reasons.filter(Cause.isInterruptReason)),
                        )
                      : Effect.void,
                  ),
                ),
              ),
            ),
          );

          return yield* Password.PasswordRejected.make({});
        }

        const captured = Option.isNone(admission)
          ? undefined
          : yield* Schema.decodeEffect(Schema.toType(Password.PasswordCredentialSnapshot))(
              admission.value,
            ).pipe(Effect.mapError(() => Password.PasswordUnavailable.make({})));

        const checked = yield* Effect.gen(function* () {
          if (captured === undefined) {
            yield* hasher
              .dummy(input.password)
              .pipe(Effect.mapError(() => Password.PasswordUnavailable.make({})));

            return yield* Password.PasswordRejected.make({});
          }

          const capture = yield* authority
            .capture(captured.revision.subjectId, [captured.credentialId])
            .pipe(
              Effect.mapError((error) =>
                error._tag === "StaleAuthentication"
                  ? Password.PasswordRejected.make({})
                  : Password.PasswordUnavailable.make({}),
              ),
            );

          const original = Password.snapshotPasswordRevision(capture.revision);
          const requirement = yield* Password.snapshotPasswordRequirement(capture.requirement);

          if (
            original.securityRevision !== captured.revision.securityRevision ||
            !original.credentials.some(
              (item) =>
                item.credentialId === captured.credentialId &&
                item.revision === captured.credentialRevision,
            )
          ) {
            yield* hasher
              .dummy(input.password)
              .pipe(Effect.mapError(() => Password.PasswordUnavailable.make({})));

            return yield* Password.PasswordRejected.make({});
          }
          const raw = Redacted.value(input.password);

          const password =
            captured.normalization === "NFC" ? Redacted.make(raw.normalize("NFC")) : input.password;

          const result = yield* hasher.verify(password, captured.verifier).pipe(
            Effect.catchTag("PasswordVerifierInvalid", () =>
              hasher.dummy(password).pipe(Effect.andThen(Password.PasswordRejected.make({}))),
            ),
            Effect.mapError((error) =>
              Schema.is(Password.PasswordRejected)(error) ||
              Schema.is(Password.PasswordInputInvalid)(error)
                ? Password.PasswordRejected.make({})
                : Password.PasswordUnavailable.make({}),
            ),
          );

          if (!result.matches) return yield* Password.PasswordRejected.make({});
          const verifiedAt = yield* DateTime.now;

          if (result.needsRehash)
            yield* persistence.rehashIfCurrent({
              credential: captured,
              nextVerifier: yield* hasher
                .hash(password)
                .pipe(Effect.mapError(() => Password.PasswordUnavailable.make({}))),
            });

          const binding = yield* Schema.encodeEffect(
            Schema.fromJsonString(Schema.Array(Schema.String)),
          )(["customers/sign-in", moduleId, flowId, identifier.namespace, identifier.value]).pipe(
            Effect.mapError(() => Password.PasswordUnavailable.make({})),
          );

          const digest = yield* crypto
            .digest("SHA-256", new TextEncoder().encode(binding))
            .pipe(Effect.mapError(() => Password.PasswordUnavailable.make({})));

          const evidence: Sessions.AuthenticationEvidence = {
            revision: original,
            flowId,
            bindingDigest: AuthSchema.TokenDigest.make(Base64Url.encode(digest)),
            proofs: [
              {
                method: "password",
                credentialId: captured.credentialId,
                factors: ["knowledge"],
                userVerified: false,
                phishingResistant: false,
                verifiedAt,
              },
            ],
          };

          return { evidence, credential: captured, requirement };
        });

        const values = yield* claims.resolve({
          subjectId: checked.credential.revision.subjectId,
          credential: checked.credential,
        });

        return yield* completion
          .prepare({
            evidence: checked.evidence,
            requirement: checked.requirement,
            claims: values,
          })
          .pipe(
            Effect.flatMap((receipt) => receipt.read),
            Effect.mapError((error) =>
              Schema.is(Password.PasswordRejected)(error)
                ? error
                : Password.PasswordUnavailable.make({}),
            ),
          );
      }),
    });
  }),
).pipe(Layer.provide(Password.PasswordAttemptLimiter.layer));
