import { OAuthScope, OAuthServer } from "@yielded/auth";
import * as Effect from "effect/Effect";
import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiClient from "effect/http-api/HttpApiClient";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import type * as HttpApiError from "effect/http-api/HttpApiError";
import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import type * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { expectTypeOf } from "vite-plus/test";

// Compile-only contract for literal scope inference. Runtime proofs
// cannot detect a typo accepted by the TypeScript API.
export const literalScopes = Effect.suspend(() => {
  const read = OAuthScope.make("documents:read");
  const write = OAuthScope.make("documents:write");
  const scopes = [read, write];

  expectTypeOf(read).toEqualTypeOf<OAuthScope.OAuthScope<"documents:read">>();
  // @ts-expect-error A plain string is not a branded scope.
  const unbranded: typeof read = "documents:read";

  void unbranded;

  const resource = OAuthServer.make("typed-resource", {
    scopes,
  });

  const identity = OAuthServer.makeOpenId("typed-identity", {
    scopes,
  });

  const defaults = OAuthServer.makeOpenId("typed-defaults");

  // @ts-expect-error Scope declarations must be branded.
  OAuthServer.make("unbranded-scopes", { scopes: ["read"] });
  // @ts-expect-error OpenID declarations must also be branded.
  OAuthServer.makeOpenId("unbranded-openid", { scopes: ["read"] });

  expectTypeOf<typeof resource.Scope.Type>().toEqualTypeOf<
    OAuthScope.OAuthScope<"documents:read" | "documents:write">
  >();
  expectTypeOf<typeof identity.Scope.Type>().toEqualTypeOf<
    OAuthScope.OAuthScope<"openid" | "profile" | "email" | "documents:read" | "documents:write">
  >();
  expectTypeOf<typeof defaults.Scope.Type>().toEqualTypeOf<
    OAuthScope.OAuthScope<"openid" | "profile" | "email">
  >();
  expectTypeOf<(typeof identity.Access.Type.scopes)[number]>().toEqualTypeOf<
    OAuthScope.OAuthScope<"openid" | "profile" | "email" | "documents:read" | "documents:write">
  >();

  resource.middleware([read]);
  // @ts-expect-error A supported spelling still needs the OAuthScope brand.
  resource.middleware(["documents:read"]);
  identity.middleware([OAuthScope.make("openid"), read]);
  // @ts-expect-error The resource did not declare this scope.
  resource.middleware([OAuthScope.make("documents:raed")]);
  // @ts-expect-error OpenID adds its standard scopes, not arbitrary strings.
  identity.middleware([OAuthScope.make("documents:raed")]);
  // @ts-expect-error The default OpenID server has no application scopes.
  defaults.middleware([read]);

  identity.Authorization.of({
    // @ts-expect-error Authorization cannot grant an undeclared scope.
    authorize: () => Effect.succeed({ scopes: [OAuthScope.make("documents:raed")] }),
  });

  identity.Identity.of({
    current: Effect.as(Effect.void, undefined),
    active: () => Effect.succeed(true),
    profile: ({ scopes }) => {
      expectTypeOf(scopes[0]).toEqualTypeOf<
        OAuthScope.OAuthScope<"openid" | "profile" | "email" | "documents:read" | "documents:write">
      >();

      return Effect.succeed({});
    },
  });

  identity.Authorization.of({
    authorize: ({ scopes }) => {
      expectTypeOf(scopes[0]).toEqualTypeOf<
        OAuthScope.OAuthScope<"openid" | "profile" | "email" | "documents:read" | "documents:write">
      >();

      return Effect.succeed({ scopes });
    },
  });

  return Effect.gen(function* () {
    const resourceService = yield* resource.Service;
    const access = yield* resourceService.verify(Redacted.make("credential"));

    expectTypeOf(access.scopes[0]).toEqualTypeOf<
      OAuthScope.OAuthScope<"documents:read" | "documents:write">
    >();

    const identityService = yield* identity.Service;
    const identityAccess = yield* identityService.verify(Redacted.make("credential"));

    expectTypeOf(identityAccess.scopes[0]).toEqualTypeOf<
      OAuthScope.OAuthScope<"openid" | "profile" | "email" | "documents:read" | "documents:write">
    >();
    const current = yield* identity.CurrentAccess;

    if (current !== undefined)
      expectTypeOf(current.scopes[0]).toEqualTypeOf<
        OAuthScope.OAuthScope<"openid" | "profile" | "email" | "documents:read" | "documents:write">
      >();

    const configured = yield* OAuthServer.makeAccessTokenVerifier({
      issuer: "https://identity.example.com",
      resource: "https://resource.example.com",
      publicKeys: [],
      scopes: [read, OAuthScope.make("openid")],
    });

    const configuredAccess = yield* configured.verify(Redacted.make("credential"));

    expectTypeOf(configuredAccess.scopes[0]).toEqualTypeOf<
      OAuthScope.OAuthScope<"documents:read" | "openid">
    >();

    const unconfigured = yield* OAuthServer.makeAccessTokenVerifier({
      issuer: "https://identity.example.com",
      resource: "https://resource.example.com",
      publicKeys: [],
    });

    const unconfiguredAccess = yield* unconfigured.verify(Redacted.make("credential"));

    expectTypeOf(unconfiguredAccess.scopes[0]).toEqualTypeOf<OAuthScope.OAuthScope>();
  });
});

export const serviceScopes = () => {
  const narrow = OAuthServer.makeOpenId("same-id", { scopes: [OAuthScope.make("read")] });

  const broad = OAuthServer.makeOpenId("same-id", {
    scopes: [OAuthScope.make("read"), OAuthScope.make("write")],
  });

  return (layers: {
    readonly server: Layer.Layer<typeof broad.Service.Identifier>;
    readonly authorization: Layer.Layer<typeof broad.Authorization.Identifier>;
    readonly identity: Layer.Layer<typeof broad.Identity.Identifier>;
  }) => {
    const server = Effect.provide(narrow.Service, layers.server);
    const authorization = Effect.provide(narrow.Authorization, layers.authorization);
    const identity = Effect.provide(narrow.Identity, layers.identity);

    expectTypeOf<Effect.Services<typeof server>>().toEqualTypeOf<
      typeof narrow.Service.Identifier
    >();
    expectTypeOf<Effect.Services<typeof authorization>>().toEqualTypeOf<
      typeof narrow.Authorization.Identifier
    >();
    expectTypeOf<Effect.Services<typeof identity>>().toEqualTypeOf<
      typeof narrow.Identity.Identifier
    >();
  };
};

// HttpApi requirements keep the brand on groups and endpoints, and generated
// clients type the security failures without a middleware implementation.
export const httpApiScopes = Effect.suspend(() => {
  const read = OAuthScope.make("documents:read");
  const write = OAuthScope.make("documents:write");
  const resource = OAuthServer.make("typed-api", { scopes: [read, write] });
  const described = { name: read, description: "Read your documents" };

  HttpApiEndpoint.get("both", "/").annotate(OAuthScope.Required, { allOf: [described, write] });
  HttpApiGroup.make("either").annotate(OAuthScope.Required, { anyOf: [read, write] });
  // @ts-expect-error Endpoint requirements need branded scopes.
  HttpApiEndpoint.get("plain", "/").annotate(OAuthScope.Required, { allOf: ["documents:read"] });
  // @ts-expect-error Group requirements need branded scopes too.
  HttpApiGroup.make("plain").annotate(OAuthScope.Required, { anyOf: ["documents:read"] });
  // @ts-expect-error A requirement names its meaning; a bare list is ambiguous.
  HttpApiEndpoint.get("bare", "/").annotate(OAuthScope.Required, [read]);
  // @ts-expect-error No access can satisfy an empty anyOf.
  HttpApiGroup.make("empty").annotate(OAuthScope.Required, { anyOf: [] });
  // @ts-expect-error Literal checks are available with satisfies.
  void ({ allOf: [OAuthScope.make("documents:raed")] } satisfies OAuthScope.Requirement<
    typeof read | typeof write
  >);

  const Api = HttpApi.make("typed-api").add(
    HttpApiGroup.make("documents")
      .add(HttpApiEndpoint.get("list", "/documents", { success: Schema.Array(Schema.String) }))
      .annotate(OAuthScope.Required, { allOf: [described] })
      .middleware(OAuthScope.RequireAccess),
  );

  expectTypeOf(resource.securityLayer(Api)).toEqualTypeOf<
    Layer.Layer<
      OAuthScope.RequireAccess,
      OAuthServer.ConfigurationError,
      typeof resource.Service.Identifier
    >
  >();

  return Effect.gen(function* () {
    const client = yield* HttpApiClient.make(Api, { baseUrl: "https://api.example.com" });

    expectTypeOf<
      HttpApiError.Unauthorized | HttpApiError.Forbidden | HttpApiError.ServiceUnavailable
    >().toExtend<Effect.Error<ReturnType<typeof client.documents.list>>>();
  });
});
