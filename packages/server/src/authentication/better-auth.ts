import { betterAuth } from "better-auth"
import { effectSqlAdapter } from "better-auth-effect"
import { magicLink } from "better-auth/plugins"
import { v7 } from "uuid"

import type { AppRuntime } from "../app-runtime.js"

export const createAuth = (runtime: AppRuntime, baseUrl?: string, secret?: string) =>
  betterAuth({
    database: effectSqlAdapter({
      runtime,
      dialect: "sqlite",
    }),
    secret:
      secret ?? process.env.BETTER_AUTH_SECRET ?? "default-dev-secret-do-not-use-in-production",
    baseURL: baseUrl ?? "http://localhost:3000",
    advanced: {
      database: {
        generateId: () => v7(),
      },
    },
    user: {
      modelName: "accounts",
      fields: {
        createdAt: "created_at",
        emailVerified: "is_email_verified",
        updatedAt: "updated_at",
      },
    },
    account: {
      modelName: "oauth_accounts",
      fields: {
        accessToken: "access_token",
        accessTokenExpiresAt: "access_token_expires_at",
        accountId: "oauth_account_id",
        createdAt: "created_at",
        idToken: "id_token",
        providerId: "provider_id",
        refreshToken: "refresh_token",
        refreshTokenExpiresAt: "refresh_token_expires_at",
        updatedAt: "updated_at",
        userId: "account_id",
      },
    },
    session: {
      fields: {
        createdAt: "created_at",
        expiresAt: "expires_at",
        ipAddress: "ip_address",
        updatedAt: "updated_at",
        userAgent: "user_agent",
        userId: "account_id",
      },
      modelName: "sessions",
    },
    verification: {
      fields: {
        createdAt: "created_at",
        expiresAt: "expires_at",
        updatedAt: "updated_at",
      },
      modelName: "verifications",
    },
    experimental: {
      joins: true,
    },
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: { clientId: "@TODO", clientSecret: "@TODO" },
      microsoft: { clientId: "@TODO", clientSecret: "@TODO" },
    },
    plugins: [
      magicLink({
        disableSignUp: false,
        sendMagicLink: async () => {
          // @TODO send email to user
        },
      }),
    ],
  })

export type Auth = ReturnType<typeof createAuth>
