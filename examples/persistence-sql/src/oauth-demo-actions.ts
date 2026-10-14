import { OAuth, Sessions } from "@yielded/auth";
import { Context, Crypto, DateTime, Effect, Layer, Redacted, Schema } from "effect";
import { Base64Url } from "effect/encoding";
import { SqlClient } from "effect/sql";

import { requirement } from "../../shared/oauth/storage";
import { ownerId } from "./oauth-lifecycle-model";

const factorId = "demo-action-code";

/** This CLI replaces code delivery with a private return value. The verifier is
 * real application policy: random, expiring, single-use codes bound to one action,
 * command and current subject revision. It is not a production delivery channel. */
export class DemoActionCodes extends Context.Service<
  DemoActionCodes,
  {
    readonly issue: (
      action: OAuth.OAuthActionChallenge["action"],
      commandId: string,
    ) => Effect.Effect<Redacted.Redacted<string>, OAuth.OAuthUnavailable>;
  }
>()("demo/ActionCodes") {}

export const DemoActionsLive = Layer.effectContext(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const crypto = yield* Crypto.Crypto;

    yield* sql`CREATE TABLE IF NOT EXISTS demo_oauth_action_code (
    digest TEXT PRIMARY KEY, action TEXT NOT NULL, command_id TEXT NOT NULL,
    security_revision TEXT NOT NULL, expires_at BIGINT NOT NULL, consumed_context TEXT)`;
    yield* sql`INSERT INTO oauth_authority_credential ("subjectId", "credentialId", revision, status)
    VALUES (${ownerId}, ${factorId}, 'initial', 'active') ON CONFLICT DO NOTHING`;

    const digest = (secret: Redacted.Redacted<string>) =>
      crypto
        .digest("SHA-256", new TextEncoder().encode(Redacted.value(secret)))
        .pipe(Effect.map(Base64Url.encode));

    const issue: DemoActionCodes["Service"]["issue"] = Effect.fn("DemoActionCodes.issue")(
      function* (action, commandId) {
        const [current] =
          yield* sql`SELECT "securityRevision" FROM oauth_subject WHERE id = ${ownerId} AND status = 'active'`;

        if (current === undefined) return yield* OAuth.OAuthUnavailable.make({});

        const revision = yield* Schema.decodeUnknownEffect(Sessions.SecurityRevision)(
          current.securityRevision,
        );

        const secret = Redacted.make(Base64Url.encode(yield* crypto.randomBytes(32)));
        const hash = yield* digest(secret);
        const expires = DateTime.toEpochMillis(yield* DateTime.now) + 60_000;

        yield* sql`INSERT INTO demo_oauth_action_code (digest, action, command_id, security_revision, expires_at)
        VALUES (${hash}, ${action}, ${commandId}, ${revision}, ${expires})`;

        return secret;
      },
      Effect.mapError(() => OAuth.OAuthUnavailable.make({})),
    );

    const verify: OAuth.OAuthActionEvidence["Service"]["verify"] = Effect.fn(
      "DemoActionCodes.verify",
    )(
      function* ({ invocation, challenge, proof }) {
        const factor = challenge.revision.credentials.find(
          (item) => item.credentialId === factorId,
        );

        if (
          proof === undefined ||
          invocation._tag !== "Authenticated" ||
          invocation.subjectId !== ownerId ||
          challenge.revision.subjectId !== ownerId ||
          factor?.revision !== "initial"
        )
          return yield* OAuth.OAuthActionRequired.make({});
        const hash = yield* digest(proof);
        const now = yield* DateTime.now;

        const context = yield* Schema.encodeEffect(
          Schema.fromJsonString(OAuth.OAuthActionChallenge),
        )(challenge);

        const consumed = yield* sql`UPDATE demo_oauth_action_code SET consumed_context = ${context}
        WHERE digest = ${hash} AND action = ${challenge.action} AND command_id = ${challenge.flowId}
          AND security_revision = ${challenge.revision.securityRevision} AND expires_at > ${DateTime.toEpochMillis(now)}
          AND consumed_context IS NULL
          AND EXISTS (SELECT 1 FROM oauth_subject WHERE id = ${ownerId} AND status = 'active'
            AND "securityRevision" = ${challenge.revision.securityRevision})
          AND EXISTS (SELECT 1 FROM oauth_authority_credential WHERE "subjectId" = ${ownerId}
            AND "credentialId" = ${factorId} AND revision = 'initial' AND status = 'active')
        RETURNING digest`;

        if (consumed.length !== 1) return yield* OAuth.OAuthActionRequired.make({});

        return {
          source: { _tag: "Proof" as const },
          requirement,
          evidence: Sessions.AuthenticationEvidence.make({
            revision: challenge.revision,
            flowId: Sessions.AuthenticationFlowId.make(challenge.flowId),
            bindingDigest: challenge.bindingDigest,
            proofs: [
              {
                method: "demo-action-code",
                credentialId: factorId,
                factors: ["possession"],
                userVerified: false,
                phishingResistant: false,
                verifiedAt: now,
              },
            ],
          }),
        };
      },
      Effect.catchTags({
        PlatformError: () => OAuth.OAuthUnavailable.make({}),
        SqlError: () => OAuth.OAuthUnavailable.make({}),
        SchemaError: () => OAuth.OAuthUnavailable.make({}),
      }),
    );

    return Context.make(DemoActionCodes, { issue }).pipe(
      Context.add(OAuth.OAuthActionEvidence, { verify }),
    );
  }),
);
