import { Database } from 'bun:sqlite'
import { betterAuth } from 'better-auth'
import { magicLink } from 'better-auth/plugins'

export const auth = betterAuth({
	database: new Database('main.sqlite'),
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
