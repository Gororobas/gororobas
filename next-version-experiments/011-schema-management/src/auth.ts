import { Database } from 'bun:sqlite'
import { betterAuth } from 'better-auth'

export const auth = betterAuth({
	database: new Database(':memory:'),
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
