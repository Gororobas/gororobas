import { EmailDelivery } from "@yielded/auth";
import { Config, Crypto, Effect, FileSystem, Layer, Path, Schema } from "effect";

import { DeliveryLive as CloudflareDeliveryLive } from "../../shared/account/delivery";
import { AppData, DataLive } from "./data";

// This private local mailbox is a delivery destination, never an HTTP response or log.
const LocalMessage = Schema.fromJsonString(
  Schema.Struct({
    to: EmailDelivery.EmailMessage.fields.to,
    subject: Schema.String,
    text: Schema.RedactedFromValue(Schema.String),
    html: Schema.optionalKey(Schema.RedactedFromValue(Schema.String)),
  }),
);

const LocalDeliveryLive = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = path.join(yield* AppData, "mail");
    const crypto = yield* Crypto.Crypto;

    yield* fs.makeDirectory(directory, { recursive: true, mode: 0o700 });

    return Layer.succeed(EmailDelivery.EmailDelivery, {
      send: Effect.fn("Starter.deliverLocalEmail")(
        function* (message) {
          const body = yield* Schema.encodeEffect(LocalMessage)(message);
          const id = yield* crypto.randomUUIDv4;

          yield* fs.writeFileString(path.join(directory, `${id}.json`), body, {
            flag: "wx",
            mode: 0o600,
          });
        },
        Effect.mapError(() => EmailDelivery.EmailAcceptanceUnknown.make({})),
      ),
    });
  }),
).pipe(Layer.provide(DataLive));

type Delivery = typeof LocalDeliveryLive | typeof CloudflareDeliveryLive;

export const DeliveryLive = Layer.unwrap(
  Config.schema(Schema.Literals(["local", "cloudflare"]), "AUTH_EMAIL_DELIVERY").pipe(
    Config.withDefault("local"),
    Effect.map(
      (
        mode,
      ): Layer.Layer<
        EmailDelivery.EmailDelivery,
        Layer.Error<Delivery>,
        Layer.Services<Delivery>
      > => (mode === "local" ? LocalDeliveryLive : CloudflareDeliveryLive),
    ),
  ),
);
