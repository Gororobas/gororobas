import { betterAuth } from "better-auth"
import { magicLink } from "better-auth/plugins"
import { Database } from "bun:sqlite"
import { v7 } from "uuid"

import type { AppRuntime } from "../app-runtime.js"

export const createAuth = (runtime: AppRuntime, baseUrl?: string, secret?: string) =>
  betterAuth({
    // @TODO can we use the Effect SQL DB here instead? `alex-golubev/better-auth-effect-adapter` is stuck in Effect v3
    database: new Database("gororobas.db"),
    // database: effectSqlAdapter({
    //   runtime,
    //   dialect: "sqlite",
    // }),
    secret: secret ?? "default-dev-secret-do-not-use-in-production",
    baseURL: baseUrl ?? "http://localhost:3000",
    advanced: {
      database: {
        generateId: () => v7(),
        joins: true,
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
