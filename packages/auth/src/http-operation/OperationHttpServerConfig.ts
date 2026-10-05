import { Context, Effect, Layer, Schema } from "effect";
import { Cookies } from "effect/http";

import { origin } from "../internal/origin";
import type { CredentialSlot } from "../operations/credentials";
import { headerName } from "./configuration-schema";
import { OperationHttpConfigurationError } from "./errors";
import { credentialSlots, type OperationCookie, type OperationHttpConfiguration } from "./models";

export class OperationHttpServerConfig extends Context.Service<
  OperationHttpServerConfig,
  OperationHttpConfiguration
>()("effect-auth/OperationHttpServerConfig") {}

const cookie = Schema.Struct({
  name: Schema.NonEmptyString,
  path: Schema.String.check(Schema.isStartingWith("/")),
  secure: Schema.Boolean,
  sameSite: Schema.Literals(["lax", "strict", "none"]),
  domain: Schema.optionalKey(Schema.String),
});

/** Invalid settings expose only a bounded component name, never their values. */
export const configurationLayer = (input: OperationHttpConfiguration) =>
  Layer.effect(
    OperationHttpServerConfig,
    Effect.gen(function* () {
      yield* Schema.decodeUnknownEffect(Schema.NonEmptyArray(origin))(input.trustedOrigins).pipe(
        Effect.mapError(() => OperationHttpConfigurationError.make({ reason: "origin" })),
      );
      if (typeof input.publicOrigin === "string")
        yield* Schema.decodeEffect(origin)(input.publicOrigin).pipe(
          Effect.mapError(() => OperationHttpConfigurationError.make({ reason: "origin" })),
        );
      yield* Schema.decodeEffect(
        Schema.Struct({
          csrfHeader: headerName,
          csrfValue: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
        }),
      )(input).pipe(
        Effect.mapError(() => OperationHttpConfigurationError.make({ reason: "csrf" })),
      );
      yield* Schema.decodeEffect(
        Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1048576 })),
      )(input.maximumBodyBytes).pipe(
        Effect.mapError(() => OperationHttpConfigurationError.make({ reason: "body-limit" })),
      );
      yield* Schema.decodeEffect(
        Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 16384 })),
      )(input.maximumUrlBytes).pipe(
        Effect.mapError(() => OperationHttpConfigurationError.make({ reason: "url-limit" })),
      );

      const cookies = yield* Schema.decodeEffect(
        Schema.Record(Schema.Literals(credentialSlots), cookie),
      )(input.cookies).pipe(
        Effect.mapError(() => OperationHttpConfigurationError.make({ reason: "cookies" })),
      );

      const names = new Set<string>();

      for (const slot of credentialSlots) {
        const value = cookies[slot];

        if (
          names.has(value.name) ||
          (value.sameSite === "none" && !value.secure) ||
          (value.name.startsWith("__Secure-") && !value.secure) ||
          (value.name.startsWith("__Host-") &&
            (!value.secure || value.path !== "/" || value.domain !== undefined)) ||
          Cookies.makeCookie(value.name, "probe", { ...value, httpOnly: true })._tag === "Failure"
        )
          return yield* OperationHttpConfigurationError.make({ reason: "cookies" });
        names.add(value.name);
        Object.freeze(value);
      }
      if (input.native !== undefined) {
        const native = input.native;

        const request = [
          native.modeHeader,
          ...credentialSlots.map((slot) => native.requestHeaders[slot]),
        ];

        const response = credentialSlots.map((slot) => native.responseHeaders[slot]);

        if (
          [...request, ...response].some((name) => !Schema.is(headerName)(name)) ||
          new Set(request).size !== request.length ||
          new Set(response).size !== response.length ||
          request.some((name) => ["origin", "cookie", "host", input.csrfHeader].includes(name)) ||
          response.some((name) => ["set-cookie", "location", "content-type"].includes(name))
        )
          return yield* OperationHttpConfigurationError.make({ reason: "native-headers" });
      }

      return Object.freeze({
        ...input,
        cookies: Object.freeze(cookies),
        trustedOrigins: Object.freeze([...input.trustedOrigins]),
        ...(input.native === undefined
          ? {}
          : {
              native: Object.freeze({
                ...input.native,
                requestHeaders: Object.freeze({ ...input.native.requestHeaders }),
                responseHeaders: Object.freeze({ ...input.native.responseHeaders }),
              }),
            }),
      });
    }),
  );

export const cookieConfiguration = (input: {
  readonly prefix: string;
  readonly secure: boolean;
  readonly path?: string;
  readonly sameSite?: OperationCookie["sameSite"];
}): OperationHttpConfiguration["cookies"] =>
  Object.fromEntries(
    credentialSlots.map((slot) => [
      slot,
      {
        name: `${input.prefix}${slot}`,
        path: input.path ?? "/",
        secure: input.secure,
        sameSite: input.sameSite ?? "lax",
      },
    ]),
  ) as unknown as OperationHttpConfiguration["cookies"];

export const headerConfiguration = (prefix: string): Readonly<Record<CredentialSlot, string>> =>
  Object.fromEntries(credentialSlots.map((slot) => [slot, `${prefix}${slot}`])) as Readonly<
    Record<CredentialSlot, string>
  >;
