import { assert, expect, it as test } from "@effect/vitest"
import { Clock, Effect, Predicate, Redacted } from "effect"
// oxlint-disable-next-line effect/avoid-node-imports, custom-lint-rules/no-node-apis -- Generate and sign OAuth provider JWT fixtures; Effect Crypto does not expose asymmetric signing.
import { generateKeyPairSync, sign } from "node:crypto"
import * as OpenIdClient from "openid-client"

import { makeOAuthProtocol } from "./oauth-protocol.js"
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
})
const { privateKey: wrongPrivateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
})
const issuer = "https://provider.example"
const providers = ["apple", "google", "microsoft"] as const

providers.forEach((provider) => {
  test.live.each(["valid", "wrong-nonce", "wrong-issuer", "wrong-signature"])(
    `${provider} OIDC validates %s using signed ID tokens`,
    Effect.fn(function* (scenario) {
      const now = Math.floor((yield* Clock.currentTimeMillis) / 1000)

      const header = Buffer.from(
        JSON.stringify({
          alg: "RS256",
          kid: "test-key",
        }),
      ).toString("base64url")

      const payload = Buffer.from(
        JSON.stringify({
          iss: scenario === "wrong-issuer" ? "https://attacker.example" : issuer,
          aud: "test-client",
          sub: "external-subject",
          iat: now,
          exp: now + 300,
          nonce: scenario === "wrong-nonce" ? "wrong-nonce" : "expected-nonce",
          email: "person@example.com",
          email_verified: provider === "apple" ? "true" : true,
          name: "Provider Person",
        }),
      ).toString("base64url")

      const signature = sign(
        "RSA-SHA256",
        Buffer.from(`${header}.${payload}`),
        scenario === "wrong-signature" ? wrongPrivateKey : privateKey,
      ).toString("base64url")

      const tokenBodies: string[] = []

      const client = new OpenIdClient.Configuration(
        {
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks`,
          id_token_signing_alg_values_supported: ["RS256"],
        },
        "test-client",
        {
          id_token_signed_response_alg: "RS256",
        },
        OpenIdClient.ClientSecretPost("test-secret"),
      )

      client[OpenIdClient.customFetch] = async (input, init) => {
        if (String(input) === `${issuer}/jwks`) {
          return Response.json({
            keys: [
              {
                ...publicKey.export({
                  format: "jwk",
                }),
                kid: "test-key",
                alg: "RS256",
                use: "sig",
              },
            ],
          })
        }

        expect(String(input)).toBe(`${issuer}/token`)
        assert(Predicate.isString(init.body) || init.body instanceof URLSearchParams)
        tokenBodies.push(init.body.toString())

        return Response.json({
          token_type: "Bearer",
          access_token: "upstream-access-token",
          id_token: `${header}.${payload}.${signature}`,
        })
      }

      OpenIdClient.enableNonRepudiationChecks(client)
      const protocol = makeOAuthProtocol("https://app.example", { [provider]: client })

      const input = {
        provider,
        state: "expected-state",
        nonce: "expected-nonce",
        pkceVerifier: "a".repeat(64),
      }

      const url = new URL(yield* protocol.authorize(input))
      expect(url.searchParams.get("nonce")).toBe(input.nonce)
      expect(url.searchParams.get("redirect_uri")).toBe(
        `https://app.example/api/auth/${provider}/callback`,
      )
      expect(url.searchParams.get("code_challenge_method")).toBe(
        provider === "apple" ? null : "S256",
      )
      expect(url.searchParams.get("response_mode")).toBe(provider === "apple" ? "form_post" : null)

      const result = yield* protocol
        .exchange({
          ...input,
          code: Redacted.make("authorization-code"),
        })
        .pipe(
          Effect.match({
            onSuccess: (identity) => identity,
            onFailure: (error) => ({
              reason: error.reason,
            }),
          }),
        )

      expect(result).toEqual(
        scenario === "valid"
          ? {
              issuer,
              subject: "external-subject",
              email: "person@example.com",
              isEmailVerified: true,
              name: "Provider Person",
            }
          : {
              reason: "invalid-flow",
            },
      )

      expect(new URLSearchParams(tokenBodies[0]).get("code_verifier")).toBe(
        provider === "apple" ? null : input.pkceVerifier,
      )
    }),
  )
})
