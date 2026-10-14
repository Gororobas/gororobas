import { Effect, Schema } from "effect";

import { httpsOrigin } from "./origin";

export const returnRoute = Schema.String.check(
  Schema.isMaxLength(2048),
  Schema.isPattern(/^\/(?!\/)[A-Za-z0-9/_-]*$/),
);

const absoluteReturnTarget = Schema.String.check(
  Schema.isMaxLength(2048),
  Schema.makeFilter((value) => {
    try {
      const url = new URL(value);

      return (
        Schema.is(httpsOrigin)(url.origin) &&
        Schema.is(returnRoute)(url.pathname) &&
        value === `${url.origin}${url.pathname}`
      );
    } catch {
      return false;
    }
  }),
);

/** Syntax only; the application return-target service owns exact admission. */
export const returnTarget = Schema.Union([returnRoute, absoluteReturnTarget]);

export const exactReturnTargets = (
  routes: ReadonlyArray<string>,
  trustedOrigins: ReadonlyArray<string>,
) =>
  Schema.decodeEffect(
    Schema.Struct({
      routes: Schema.Array(returnTarget).check(Schema.isMinLength(1), Schema.isMaxLength(128)),
      trustedOrigins: Schema.Array(httpsOrigin),
    }).check(
      Schema.makeFilter((value) =>
        value.routes.every(
          (target) =>
            target.startsWith("/") || value.trustedOrigins.includes(new URL(target).origin),
        ),
      ),
    ),
  )({ routes: [...routes], trustedOrigins: [...trustedOrigins] }).pipe(
    Effect.map((value) => new Set(value.routes)),
  );
