import { Database } from 'bun:sqlite'
import { betterAuth } from 'better-auth'
import { magicLink } from 'better-auth/plugins'
import { v7 } from 'uuid'

export const auth = betterAuth({
	database: new Database('main.sqlite'),
	advanced: {
		// The entire app is using uuidv7s. Let's make sure better-auth does the same
		database: {
			generateId: () => v7(),
		},
	},
	// Mapping camelCase to snake_case columns and using consistent plural table names
	user: {
		modelName: 'users',
		fields: {
			emailVerified: 'is_email_verified',
			createdAt: 'created_at',
			updatedAt: 'updated_at',
		},
	},
	account: {
		modelName: 'accounts',
		fields: {
			userId: 'user_id',
			accountId: 'account_id',
			providerId: 'provider_id',
			createdAt: 'created_at',
			updatedAt: 'updated_at',
			accessToken: 'access_token',
			accessTokenExpiresAt: 'access_token_expires_at',
			refreshToken: 'refresh_token',
			refreshTokenExpiresAt: 'refresh_token_expires_at',
			idToken: 'id_token',
		},
	},
	session: {
		modelName: 'sessions',
		fields: {
			userId: 'user_id',
			ipAddress: 'ip_address',
			userAgent: 'user_agent',
			expiresAt: 'expires_at',
			createdAt: 'created_at',
			updatedAt: 'updated_at',
		},
	},
	verification: {
		modelName: 'verifications',
		fields: {
			expiresAt: 'expires_at',
			createdAt: 'created_at',
			updatedAt: 'updated_at',
		},
	},
	experimental: {
		joins: true,
	},
	emailAndPassword: { enabled: false },
	socialProviders: {
		google: { clientId: '@TODO', clientSecret: '@TODO' },
		microsoft: { clientId: '@TODO', clientSecret: '@TODO' },
	},
	plugins: [
		magicLink({
			sendMagicLink: async ({ email, token, url }, ctx) => {
				// send email to user
			},
		}),
	],
	// secondaryStorage: {
	// 	get: async (key) => {
	// 		return await redis.get(key)
	// 	},
	// 	set: async (key, value, ttl) => {
	// 		if (ttl) await redis.set(key, value, 'EX', ttl)
	// 		else await redis.set(key, value)
	// 	},
	// 	delete: async (key) => {
	// 		await redis.del(key)
	// 	},
	// },
})
