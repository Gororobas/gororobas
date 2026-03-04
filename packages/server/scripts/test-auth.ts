#!/usr/bin/env npx tsx
/**
 * Manual test script to verify better-auth + Effect integration.
 * Tests auth API operations and verifies data persistence in SQLite.
 *
 * Usage:
 *   npx tsx scripts/test-auth.ts
 */

import { serializeSignedCookie } from "better-call"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { AppRuntimeTest } from "../src/app-runtime.js"
import { createAuth } from "../src/authentication/better-auth.js"

const TEST_SECRET = "test-secret-for-auth-integration-tests"
const auth = createAuth(AppRuntimeTest, undefined, TEST_SECRET)

const signSessionCookie = async (token: string) => {
  const cookieString = await serializeSignedCookie("better-auth.session_token", token, TEST_SECRET)
  return cookieString.split("=")[1]
}

const TEST_EMAIL = "test@example.com"
const TEST_NAME = "Test User"

const program = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  console.log("=== PART 1: Basic Persistence Tests ===\n")

  console.log("1. Testing auth instance...")
  console.log("   - Has handler:", typeof auth.handler === "function")
  console.log("   - Has api:", typeof auth.api === "object")
  console.log("   ✓ Done\n")

  console.log("2. Available API methods...")
  console.log("   ", Object.keys(auth.api).join(", "))
  console.log("")

  console.log("3. Creating user via auth.api.signInMagicLink...")
  const magicLinkResult = yield* Effect.promise(() =>
    auth.api.signInMagicLink({
      body: {
        email: TEST_EMAIL,
        name: TEST_NAME,
      },
      headers: new Headers(),
    }),
  )
  console.log("   Magic link sent:", magicLinkResult)
  console.log("   ✓ Done\n")

  console.log("4. Fetching verification token from database...")
  const verification = yield* sql`
    SELECT id, identifier, value, expires_at
    FROM verifications
    ORDER BY created_at DESC
    LIMIT 1
  `
  if (verification.length === 0) {
    yield* Effect.fail(new Error("Verification token not found in database!"))
  }
  const token = verification[0].identifier as string
  console.log("   Token found:", token.substring(0, 20) + "...")
  console.log("   ✓ Done\n")

  console.log("5. Verifying magic link and completing sign-in...")
  const verifyResult = yield* Effect.promise(() =>
    auth.api.magicLinkVerify({
      query: { token },
      headers: new Headers(),
    }),
  )
  console.log("   User created:", {
    id: verifyResult.user.id,
    email: verifyResult.user.email,
    name: verifyResult.user.name,
    emailVerified: verifyResult.user.emailVerified,
  })
  console.log("   Session token:", verifyResult.token.substring(0, 20) + "...")
  console.log("   ✓ Done\n")

  console.log("6. Verifying user persisted in database...")
  const dbUser =
    yield* sql`SELECT id, email, name, is_email_verified FROM accounts WHERE email = ${TEST_EMAIL}`
  if (dbUser.length === 0) {
    yield* Effect.fail(new Error("User not found in database!"))
  }
  console.log("   Database record:", dbUser[0])
  console.log("   ✓ User persisted correctly\n")

  console.log("7. Verifying session exists in database...")
  const dbSession =
    yield* sql`SELECT id, token, account_id, expires_at FROM sessions WHERE account_id = ${verifyResult.user.id}`
  if (dbSession.length === 0) {
    yield* Effect.fail(new Error("Session not found in database!"))
  }
  console.log("   Session count:", dbSession.length)
  console.log("   ✓ Session persisted correctly\n")

  console.log("8. Testing getSession API...")
  const signedToken = yield* Effect.promise(() => signSessionCookie(verifyResult.token))
  const sessionResult = yield* Effect.promise(() =>
    auth.api.getSession({
      query: { disableCookieCache: true },
      headers: new Headers({
        cookie: `better-auth.session_token=${signedToken}`,
      }),
    }),
  )
  if (!sessionResult) {
    yield* Effect.fail(new Error("Session not found via API!"))
  }
  console.log("   Session retrieved:", {
    sessionId: sessionResult!.session.id,
    userId: sessionResult!.user.id,
    email: sessionResult!.user.email,
  })
  console.log("   ✓ getSession works\n")

  console.log("=== PART 2: Transaction Rollback Tests ===\n")

  // ========================================================================
  // ⚠️ COMMENTED TRANSACTION TESTING DUE TO DEADLOCK FREEZING TRANSACTIONS
  // https://github.com/alex-golubev/better-auth-effect-adapter/issues/4
  // ========================================================================

  // console.log("9. Testing transaction rollback with auth API...")
  // const txTestEmail = `tx_test_${Date.now()}@example.com`

  // const countBefore = yield* sql`SELECT COUNT(*) as count FROM accounts`
  // console.log("   Accounts before transaction:", countBefore[0].count)

  // const transactionResult = yield* sql
  //   .withTransaction(
  //     Effect.gen(function* () {
  //       console.log("This gets called, but the tryPromise below keeps hanging forever")

  //       console.log("Testing a read path - also locks")
  //       const sessionResult2 = yield* Effect.promise(() =>
  //         auth.api.getSession({
  //           query: { disableCookieCache: true },
  //           headers: new Headers({
  //             cookie: `better-auth.session_token=${signedToken}`,
  //           }),
  //         }),
  //       )
  //       console.log("NEVER REACHED", sessionResult2)

  //       yield* Effect.tryPromise({
  //         try: () =>
  //           auth.api.signInMagicLink({
  //             body: {
  //               email: txTestEmail,
  //               name: "TX Test User",
  //             },
  //             headers: new Headers(),
  //           }),
  //         catch: (error) => {
  //           console.log("ERROR", error) // we don't even get to an error
  //           return Effect.fail(new Error("didn't work"))
  //         },
  //       })
  //       console.log("@TODO not even this is being called, it's as if this effect never runs")
  //       const verification = yield* sql`
  //       SELECT id, identifier, value, expires_at
  //       FROM verifications
  //       ORDER BY created_at DESC
  //       LIMIT 1
  //     `
  //       const token = verification[0].identifier as string
  //       yield* Effect.promise(() =>
  //         auth.api.magicLinkVerify({
  //           query: { token },
  //           headers: new Headers(),
  //         }),
  //       )
  //       console.log("   Created user inside transaction")

  //       const countInside = yield* sql`SELECT COUNT(*) as count FROM accounts`
  //       console.log("   Accounts inside transaction:", countInside[0].count)

  //       yield* Effect.fail(new Error("Simulated failure to test rollback"))
  //     }),
  //   )
  //   .pipe(Effect.either)

  // if (transactionResult._tag === "Left") {
  //   console.log("   Transaction failed as expected:", (transactionResult.left as Error).message)
  // } else {
  //   yield* Effect.fail(new Error("Transaction should have failed!"))
  // }

  // const countAfter = yield* sql`SELECT COUNT(*) as count FROM accounts`
  // console.log("   Accounts after transaction rollback:", countAfter[0].count)

  // const txUserCheck = yield* sql`SELECT id FROM accounts WHERE email = ${txTestEmail}`
  // if (txUserCheck.length === 0) {
  //   console.log("   ✓ Transaction rolled back correctly - user not persisted\n")
  // } else {
  //   console.log("   ⚠ User still exists - rollback may not have worked\n")
  // }

  // console.log("10. Testing successful transaction commit...")
  // const commitTestEmail = `commit_test_${Date.now()}@example.com`

  // const commitResult = yield* sql
  //   .withTransaction(
  //     Effect.gen(function* () {
  //       yield* Effect.promise(() =>
  //         auth.api.signInMagicLink({
  //           body: {
  //             email: commitTestEmail,
  //             name: "Commit Test User",
  //           },
  //           headers: new Headers(),
  //         }),
  //       )

  //       const verification = yield* sql`
  //       SELECT value FROM verifications WHERE identifier = ${commitTestEmail} ORDER BY created_at DESC LIMIT 1
  //     `
  //       if (verification.length === 0) {
  //         return yield* Effect.fail(new Error("Verification not found"))
  //       }

  //       const verifyResult = yield* Effect.promise(() =>
  //         auth.api.magicLinkVerify({
  //           query: { token: verification[0].value as string },
  //           headers: new Headers(),
  //         }),
  //       )

  //       return verifyResult
  //     }),
  //   )
  //   .pipe(Effect.either)

  // if (commitResult._tag === "Right") {
  //   console.log("   Transaction committed successfully")
  //   console.log("   Created user:", commitResult.right.user.email)
  //   console.log("   ✓ Transaction commit works\n")
  // } else {
  //   console.log("   Transaction failed:", (commitResult.left as Error).message)
  //   console.log("   ⚠ Check transaction handling\n")
  // }

  console.log("11. Testing signOut API...")
  yield* Effect.promise(() =>
    auth.api.signOut({
      headers: new Headers({
        cookie: `better-auth.session_token=${signedToken}`,
      }),
    }),
  )
  console.log("   Signed out successfully")

  const sessionAfterSignOut =
    yield* sql`SELECT id FROM sessions WHERE token = ${verifyResult.token}`
  if (sessionAfterSignOut.length === 0) {
    console.log("   ✓ Session deleted from database\n")
  } else {
    console.log("   ⚠ Session still exists after signOut\n")
  }

  console.log("12. Final database state...")
  const allAccounts = yield* sql`SELECT id, email, name FROM accounts`
  console.log("   Total accounts:", allAccounts.length)
  for (const acc of allAccounts) {
    console.log(`   - ${acc.email} (${acc.name})`)
  }
  console.log("")

  const allSessions = yield* sql`SELECT id, account_id, expires_at FROM sessions`
  console.log("   Total sessions:", allSessions.length)
  for (const sess of allSessions) {
    console.log(`   - Session ${sess.id} for account ${sess.account_id}`)
  }
  console.log("")

  console.log("=== All tests passed! ===")
})

void program.pipe(AppRuntimeTest.runPromise)
