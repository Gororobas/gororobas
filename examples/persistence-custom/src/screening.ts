import { Password, WebCrypto } from "@yielded/auth";
import { Crypto, Effect, Layer, Redacted, Schema } from "effect";
import { Hex } from "effect/encoding";
import { HttpClient } from "effect/http";

const Suffixes = Schema.Array(Schema.String.check(Schema.isPattern(/^[A-F0-9]{35}:[0-9]+$/)));

// Only the first five SHA-1 hex characters leave the server. The password,
// remaining hash, and account hints are never sent to Pwned Passwords or tracing.
export const ScreeningLive = Layer.effect(
  Password.CompromisedPasswords,
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);

    return Password.CompromisedPasswords.of({
      check: Effect.fn("Customers.screenPassword")(
        function* (password, context) {
          const value = Redacted.value(password);
          const lower = value.toLowerCase();

          if (
            [context.accountName, context.serviceName].some(
              (hint) =>
                hint !== undefined && hint.length >= 3 && lower.includes(hint.toLowerCase()),
            )
          )
            return { _tag: "Rejected", reason: "contextual" } as const;

          const hash = Hex.encode(
            yield* crypto.digest("SHA-1", new TextEncoder().encode(value)),
          ).toUpperCase();

          const response = yield* client.get(
            `https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`,
            {
              headers: { "Add-Padding": "true", "User-Agent": "yielded-auth-example" },
            },
          );

          const text = yield* response.text;
          const lines = yield* Schema.decodeUnknownEffect(Suffixes)(text.trim().split(/\r?\n/));

          const found = lines.some((line) => {
            const [suffix, count] = line.split(":");

            return suffix === hash.slice(5) && Number(count) > 0;
          });

          return found
            ? ({ _tag: "Rejected", reason: "compromised" } as const)
            : ({ _tag: "Allowed" } as const);
        },
        Effect.timeout("8 seconds"),
        Effect.provideService(HttpClient.TracerDisabledWhen, () => true),
        Effect.mapError(() => Password.PasswordCheckUnavailable.make({})),
      ),
    });
  }),
).pipe(Layer.provide(WebCrypto.layerWebCrypto));
