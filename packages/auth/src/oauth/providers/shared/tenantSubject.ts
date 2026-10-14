import { Effect, Schema } from "effect";

import { OAuthProtocolRejected } from "../../signInErrors";

const tenantId = Schema.String.check(
  Schema.isPattern(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/u,
  ),
);

const issuerClaim = Schema.Struct({
  iss: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2048)),
});

const tenantClaim = Schema.Struct({ tid: tenantId });

/** A multi-tenant token's iss differs from the configured authority. The durable
 * subject is always `tid:` plus the verified subject. Membership of the tenant
 * id inside that subject is not a namespace. */
export const subjectInTenant = Effect.fnUntraced(function* (
  configuredIssuer: string,
  claims: unknown,
  subject: string,
) {
  const issuer = yield* Schema.decodeUnknownEffect(issuerClaim)(claims).pipe(
    Effect.mapError(() => OAuthProtocolRejected.make({})),
  );

  if (issuer.iss === configuredIssuer) return subject;

  const tenant = yield* Schema.decodeUnknownEffect(tenantClaim)(claims).pipe(
    Effect.mapError(() => OAuthProtocolRejected.make({})),
  );

  const scoped = `${tenant.tid}:${subject}`;

  if (scoped.length > 1024) return yield* OAuthProtocolRejected.make({});

  return scoped;
});
