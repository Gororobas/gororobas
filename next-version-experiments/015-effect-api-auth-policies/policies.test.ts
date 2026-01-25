// test/policies.integration.test.ts
import { describe, it } from '@effect/vitest'
import { Arbitrary, Effect, Exit, Layer } from 'effect'
import {
	assertPropertyEffect,
	propertyWithPrecondition,
} from './effect-property-tests'
import Policies from './policies'
import { AccountSession, type Session, SessionContext } from './session'

const makeTestLayer = (session: Session) =>
	Layer.succeed(SessionContext, session)

describe('Organization Policies', () => {
	it.effect('members can leave organizations they belong to', () =>
		propertyWithPrecondition(
			Arbitrary.make(AccountSession),
			// Precondition: session has at least one membership
			(session) => session.memberships.length > 0,
			// Property: member can leave their org
			(session) =>
				Effect.gen(function* () {
					const orgId = session.memberships[0].organization_id

					const result = yield* Policies.organizations
						.canLeave(orgId)
						.pipe(Effect.provide(makeTestLayer(session)), Effect.exit)

					console.log(result)

					return Exit.isSuccess(result)
				}),
			{ numRuns: 100 },
		),
	)

	it.effect('access level transitions are symmetric', () =>
		assertPropertyEffect(Arbitrary.make(AccountSession), (session) =>
			Effect.gen(function* () {
				// Property: if you can go from A to B, the reverse should use the same permission level
				const canPromoteToMod = yield* Policies.people
					.canModifyAccessLevel({ from: 'TRUSTED', to: 'MODERATOR' })
					.pipe(Effect.provide(makeTestLayer(session)), Effect.exit)

				const canDemoteFromMod = yield* Policies.people
					.canModifyAccessLevel({ from: 'MODERATOR', to: 'TRUSTED' })
					.pipe(Effect.provide(makeTestLayer(session)), Effect.exit)

				// Both should require the same permission (manage-moderators)
				return (
					Exit.isSuccess(canPromoteToMod) === Exit.isSuccess(canDemoteFromMod)
				)
			}),
		),
	)
})
