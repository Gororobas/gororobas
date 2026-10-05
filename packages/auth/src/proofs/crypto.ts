import { Context, Crypto, Effect, Layer, Redacted, Result, Schema } from "effect";
import { Base64Url } from "effect/encoding";

import { TokenDigest } from "../Schema";
import { SubtleCrypto } from "../WebCrypto";
import { ProofConfigurationError, ProofUnavailable } from "./errors";
import { ProofBinding, type ProofId, type ProofPurpose } from "./models";
import type { ProofDigest } from "./ProofPersistence";

export const ProofSecretPolicy = Schema.Union([
  Schema.TaggedStruct("Token", {}),
  Schema.TaggedStruct("NumericCode", {
    digits: Schema.Int.check(Schema.isBetween({ minimum: 6, maximum: 10 })),
  }),
]);

export type ProofSecretPolicy = typeof ProofSecretPolicy.Type;

export interface ProofKeyring {
  readonly activeKeyId: string;
  readonly keys: ReadonlyArray<{
    readonly id: string;
    readonly material: Redacted.Redacted<string>;
  }>;
}

const KeyId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{1,64}$/));

const Keyring = Schema.Struct({
  activeKeyId: KeyId,
  keys: Schema.Array(Schema.Struct({ id: KeyId, material: Schema.Redacted(Schema.String) })).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(8),
  ),
});

/** Shared numeric-code verification keys. Keep old IDs until their proofs expire. */
export class ProofKeys extends Context.Service<ProofKeys, ProofKeyring>()("effect-auth/ProofKeys") {
  static readonly layer = (keyring: ProofKeyring) =>
    Layer.effect(
      ProofKeys,
      Schema.decodeEffect(Keyring)(keyring).pipe(
        Effect.mapError(() => ProofConfigurationError.make({ reason: "keyring" })),
      ),
    );
}

type KeyRequirement<Secret extends ProofSecretPolicy> =
  Extract<Secret, { readonly _tag: "NumericCode" }> extends never ? never : ProofKeys;

/** The policy discriminant determines the service requirement; token proofs need no keyring. */
export const proofKeysFor = <Secret extends ProofSecretPolicy>(secret: Secret) =>
  (secret._tag === "Token" ? Effect.succeed(undefined) : ProofKeys) as Effect.Effect<
    ProofKeyring | undefined,
    never,
    KeyRequirement<Secret>
  >;

const OpaqueSecret = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/));
const encoder = new TextEncoder();

/** Versioned fixed tuples: no dynamic object key ordering or delimiter ambiguity. */
const BindingTuple = Schema.Tuple([
  Schema.String,
  Schema.String,
  Schema.String,
  Schema.String,
  Schema.String,
  Schema.Array(Schema.Tuple([Schema.String, Schema.String])),
  Schema.String,
  Schema.String,
]);

const DigestInput = Schema.fromJsonString(
  Schema.Tuple([
    Schema.Literal("effect-auth/proof/v1"),
    Schema.String,
    Schema.String,
    Schema.String,
    BindingTuple,
    Schema.String,
    Schema.String,
  ]),
);

const FingerprintInput = Schema.fromJsonString(
  Schema.Tuple([
    Schema.Literal("effect-auth/proof-request/v1"),
    Schema.String,
    Schema.String,
    BindingTuple,
    Schema.String,
    Schema.String,
    Schema.String,
    Schema.String,
    Schema.String,
  ]),
);

const bindingTuple = (binding: ProofBinding): typeof BindingTuple.Type => {
  const revision = binding._tag === "Identifier" ? undefined : binding.revision;

  return [
    binding._tag,
    binding.identifier.namespace,
    binding.identifier.value,
    revision?.subjectId ?? "",
    revision?.securityRevision ?? "",
    [...(revision?.credentials ?? [])]
      .map((item) => [item.credentialId, item.revision] as const)
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
    binding.flowId,
    binding.contextDigest,
  ];
};

export const validateProofBinding = Effect.fn("validateProofBinding")(function* (
  input: ProofBinding,
) {
  const binding = yield* Schema.decodeEffect(ProofBinding)(input).pipe(
    Effect.mapError(() => ProofUnavailable.make({})),
  );

  if (binding._tag !== "Identifier") {
    const ids = new Set<string>();

    for (const credential of binding.revision.credentials) {
      if (ids.has(credential.credentialId)) return yield* ProofUnavailable.make({});
      ids.add(credential.credentialId);
    }
  }
  const identifier = Object.freeze(binding.identifier);

  return binding._tag === "Identifier"
    ? Object.freeze({ ...binding, identifier })
    : Object.freeze({
        ...binding,
        identifier,
        revision: Object.freeze({
          ...binding.revision,
          credentials: Object.freeze(
            [...binding.revision.credentials]
              .sort((a, b) =>
                a.credentialId < b.credentialId ? -1 : a.credentialId > b.credentialId ? 1 : 0,
              )
              .map((value) => Object.freeze({ ...value })),
          ),
        }),
      });
});

export const makeProofCrypto = Effect.fn("makeProofCrypto")(function* (
  moduleId: string,
  purpose: ProofPurpose,
  input: ProofSecretPolicy,
  configuredKeys?: ProofKeyring,
) {
  const policy = yield* Schema.decodeEffect(ProofSecretPolicy)(input).pipe(
    Effect.mapError(() => ProofConfigurationError.make({ reason: "policy" })),
  );

  const crypto = yield* Crypto.Crypto;
  const subtle = yield* SubtleCrypto;
  const keys = new Map<string, CryptoKey>();
  let activeKeyId = "token";

  if (policy._tag === "NumericCode") {
    if (configuredKeys === undefined)
      return yield* ProofConfigurationError.make({ reason: "keyring" });

    const keyring = yield* Schema.decodeEffect(Keyring)(configuredKeys).pipe(
      Effect.mapError(() => ProofConfigurationError.make({ reason: "keyring" })),
    );

    for (const entry of keyring.keys) {
      const material = Result.getOrUndefined(Base64Url.decode(Redacted.value(entry.material)));

      if (
        entry.id === "token" ||
        keys.has(entry.id) ||
        material === undefined ||
        material.length < 32
      )
        return yield* ProofConfigurationError.make({ reason: "keyring" });

      const key = yield* Effect.tryPromise({
        try: () =>
          subtle.importKey(
            "raw",
            material as BufferSource,
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"],
          ),
        catch: () => ProofConfigurationError.make({ reason: "keyring" }),
      });

      keys.set(entry.id, key);
    }
    activeKeyId = keyring.activeKeyId;
    if (!keys.has(activeKeyId)) return yield* ProofConfigurationError.make({ reason: "keyring" });
  }

  const generateOpaque = Effect.fn("ProofCrypto.generateOpaque")(function* () {
    return Redacted.make(
      Base64Url.encode(
        yield* crypto.randomBytes(32).pipe(Effect.mapError(() => ProofUnavailable.make({}))),
      ),
    );
  });

  const generate = Effect.fn("ProofCrypto.generate")(function* () {
    if (policy._tag === "Token") return yield* generateOpaque();
    let code = "";

    // Rejection sampling preserves leading zeroes and avoids modulo bias.
    for (let batch = 0; batch < 8 && code.length < policy.digits; batch++)
      for (const byte of yield* crypto
        .randomBytes(policy.digits * 2)
        .pipe(Effect.mapError(() => ProofUnavailable.make({}))))
        if (byte < 250 && code.length < policy.digits) code += String(byte % 10);
    if (code.length !== policy.digits) return yield* ProofUnavailable.make({});

    return Redacted.make(code);
  });

  const digest = Effect.fn("ProofCrypto.digest")(function* (
    proofId: ProofId,
    binding: ProofBinding,
    secret: Redacted.Redacted<string>,
    keyId: string,
  ): Effect.fn.Return<ProofDigest | undefined, ProofUnavailable> {
    binding = yield* validateProofBinding(binding);
    const value = Redacted.value(secret);

    const secretSchema =
      policy._tag === "Token"
        ? OpaqueSecret
        : Schema.String.check(Schema.isPattern(new RegExp(`^[0-9]{${policy.digits}}$`)));

    if (
      !Schema.is(secretSchema)(value) ||
      (policy._tag === "Token" ? keyId !== "token" : !keys.has(keyId))
    )
      return undefined;

    const message = yield* Schema.encodeEffect(DigestInput)([
      "effect-auth/proof/v1",
      moduleId,
      purpose,
      proofId,
      bindingTuple(binding),
      keyId,
      value,
    ]).pipe(Effect.mapError(() => ProofUnavailable.make({})));

    if (encoder.encode(message).byteLength > 16384) return yield* ProofUnavailable.make({});

    const bytes =
      policy._tag === "Token"
        ? yield* crypto
            .digest("SHA-256", encoder.encode(message))
            .pipe(Effect.mapError(() => ProofUnavailable.make({})))
        : new Uint8Array(
            yield* Effect.tryPromise({
              try: () => subtle.sign("HMAC", keys.get(keyId)!, encoder.encode(message)),
              catch: () => ProofUnavailable.make({}),
            }),
          );

    return { keyId, digest: TokenDigest.make(Base64Url.encode(bytes)) };
  });

  const continuationDigest = Effect.fn("ProofCrypto.continuationDigest")(function* (
    id: string,
    binding: ProofBinding,
    secret: Redacted.Redacted<string>,
  ) {
    binding = yield* validateProofBinding(binding);
    if (!Schema.is(OpaqueSecret)(Redacted.value(secret))) return undefined;

    const message = yield* Schema.encodeEffect(DigestInput)([
      "effect-auth/proof/v1",
      moduleId,
      purpose,
      id,
      bindingTuple(binding),
      "continuation",
      Redacted.value(secret),
    ]).pipe(Effect.mapError(() => ProofUnavailable.make({})));

    if (encoder.encode(message).byteLength > 16384) return yield* ProofUnavailable.make({});

    return TokenDigest.make(
      Base64Url.encode(
        yield* crypto
          .digest("SHA-256", encoder.encode(message))
          .pipe(Effect.mapError(() => ProofUnavailable.make({}))),
      ),
    );
  });

  const fingerprint = Effect.fn("ProofCrypto.fingerprint")(function* (
    binding: ProofBinding,
    delivery: {
      readonly channel: string;
      readonly vendor: string;
      readonly template: string;
      readonly locale: string;
    },
    supersedes?: ProofId,
  ) {
    binding = yield* validateProofBinding(binding);

    const message = yield* Schema.encodeEffect(FingerprintInput)([
      "effect-auth/proof-request/v1",
      moduleId,
      purpose,
      bindingTuple(binding),
      delivery.channel,
      delivery.vendor,
      delivery.template,
      delivery.locale,
      supersedes ?? "",
    ]).pipe(Effect.mapError(() => ProofUnavailable.make({})));

    if (encoder.encode(message).byteLength > 16384) return yield* ProofUnavailable.make({});

    return TokenDigest.make(
      Base64Url.encode(
        yield* crypto
          .digest("SHA-256", encoder.encode(message))
          .pipe(Effect.mapError(() => ProofUnavailable.make({}))),
      ),
    );
  });

  return Object.freeze({
    activeKeyId,
    format: policy._tag === "Token" ? ("token" as const) : ("numeric-code" as const),
    generate,
    generateOpaque,
    digest,
    continuationDigest,
    fingerprint,
  });
});
