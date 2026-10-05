import { type Effect, Predicate, Redacted, Schema } from "effect";

export const AuthRevealKind = Schema.Literals(["totp-enrollment", "recovery-codes"]);
export type AuthRevealKind = typeof AuthRevealKind.Type;

const utf8 = new TextEncoder();

const boundedText = (maximum: number) =>
  Schema.NonEmptyString.check(
    Schema.makeFilter(
      (value) =>
        value.length <= maximum &&
        !/[\uD800-\uDFFF]/u.test(value) &&
        utf8.encode(value).byteLength <= maximum,
    ),
  );

const enrollment = Schema.Struct({
  uri: boundedText(4096).check(
    Schema.isPattern(/^otpauth:\/\/totp\//),
    // oxlint-disable-next-line no-control-regex -- Private enrollment URIs must reject control characters.
    Schema.isPattern(/^[^\u0000-\u001f\u007f-\u009f]*$/),
  ),
  manualKey: Schema.String.check(Schema.isPattern(/^[A-Z2-7]{32}$/)),
});

const recoveryCode = Schema.String.check(
  Schema.isPattern(/^rc1-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/),
);

const recovery = Schema.Array(recoveryCode).check(
  Schema.isBetweenLength(10, 10),
  Schema.makeFilter((codes) => new Set(codes).size === codes.length),
);

const fields = {
  revealId: boundedText(256),
  expiresAtMillis: Schema.Int.check(
    Schema.isBetween({ minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER }),
  ),
};

/** Private display data. Never use this schema as an operation's ordinary success. */
export const AuthRevealCommand = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("totp-enrollment"),
    ...fields,
    payload: Schema.Redacted(enrollment, { disallowJsonEncode: true }),
  }),
  Schema.Struct({
    kind: Schema.Literal("recovery-codes"),
    ...fields,
    payload: Schema.Redacted(recovery, { disallowJsonEncode: true }),
  }),
]);

export type AuthRevealCommand = typeof AuthRevealCommand.Type;

/** Request-local memory acceptance. Invoked without a receiver; not physical delivery. */
export interface AuthRevealCommandCollector {
  readonly supportedKinds: ReadonlyArray<AuthRevealKind>;
  readonly accept: (commands: ReadonlyArray<AuthRevealCommand>) => Effect.Effect<void>;
}

const decodeKinds = Schema.decodeSync(Schema.Array(AuthRevealKind));
// oxlint-disable-next-line no-restricted-properties -- Provider output is captured as unknown before validating this closed private boundary.
const decodeCommand = Schema.decodeUnknownSync(AuthRevealCommand);
const invalid = () => new globalThis.Error("Auth operation failed");

/** Package-private: do not expose the snapshot mechanics through the public barrel. */
export const snapshotRevealKinds = (input: ReadonlyArray<AuthRevealKind>) => {
  if (!Array.isArray(input)) throw invalid();
  const length = input.length;

  if (!Number.isInteger(length) || length < 0 || length > 2) throw invalid();
  const captured = [];

  for (let index = 0; index < length; index++) captured.push(input[index]);
  const kinds = decodeKinds(captured);

  if (new Set(kinds).size !== kinds.length) throw invalid();

  return Object.freeze([...kinds]);
};

/** Fully detach before a consumer's success Iso projection can suspend. */
export const snapshotRevealCommands = (
  input: ReadonlyArray<AuthRevealCommand> | undefined,
  declared: ReadonlyArray<AuthRevealKind>,
): ReadonlyArray<AuthRevealCommand> => {
  if (input === undefined) return Object.freeze([]);
  if (!Array.isArray(input)) throw invalid();
  const length = input.length;

  if (
    !Number.isInteger(length) ||
    length < 0 ||
    length > 2 ||
    (declared.length === 0 && length > 0)
  )
    throw invalid();
  const kinds = new Set<AuthRevealKind>();
  const ids = new Set<string>();
  const commands: AuthRevealCommand[] = [];

  for (let index = 0; index < length; index++) {
    const command = input[index];
    const kind = command.kind;
    const revealId = command.revealId;
    const expiresAtMillis = command.expiresAtMillis;
    // Capture each caller-owned primitive once. Redacted's schema validates but
    // preserves its wrapper, so validating the original would not detach it.
    let payload: unknown;

    if (kind === "totp-enrollment") {
      const value = Redacted.value(command.payload);

      if (!Predicate.isObject(value)) throw invalid();
      payload = Object.freeze({ uri: value.uri, manualKey: value.manualKey });
    } else if (kind === "recovery-codes") {
      const source = Redacted.value(command.payload);

      if (!Array.isArray(source) || source.length !== 10) throw invalid();
      const codes: unknown[] = [];

      for (let code = 0; code < 10; code++) codes.push(source[code]);
      payload = Object.freeze(codes);
    } else {
      throw invalid();
    }

    const value = decodeCommand({
      kind,
      revealId,
      expiresAtMillis,
      payload: Redacted.make(payload, { label: "Auth reveal" }),
    });

    if (!declared.includes(value.kind) || kinds.has(value.kind) || ids.has(value.revealId))
      throw invalid();
    kinds.add(value.kind);
    ids.add(value.revealId);
    commands.push(Object.freeze(value));
  }

  return Object.freeze(commands);
};
