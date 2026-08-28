import { Effect, Array as EffectArray, FileSystem, Option, Path, Schema } from "effect"

import { GelClient } from "../gel-client.js"
import { GelUserWithProfile, UserDataForMigration } from "../schemas/gel/entities.js"
import { gelUserToPersonData } from "./gel-user-to-person.js"

const usersQuery = `
  select User {
    *,
    identity: {
      id,
      issuer,
      subject,
    },
    is_email_verified := not exists .identity[is ext::auth::LocalIdentity]
      or exists .identity[is ext::auth::LocalIdentity].<identity[is ext::auth::EmailFactor].verified_at,
    profile := assert_single(.<user[is UserProfile]) {
      id,
      name,
      bio,
      location,
      handle,
      photo: {
        id,
      },

      bookmarks_count := count(.<user_profile[is UserWishlist]),
      edit_suggestions_count := count(.<created_by[is EditSuggestion]),
      notes_count := count(.<created_by[is Note]),
      images_count := count(.<created_by[is Image] except .photo),
    },
  }
`

export const sourceGelUsers = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const gelClient = yield* GelClient
  const userResults = yield* gelClient
    .use((client) => client.query(usersQuery))
    .pipe(
      Effect.flatMap((users) =>
        Effect.all(
          users.map((user) => Schema.decodeUnknownEffect(GelUserWithProfile)(user)),
          { concurrency: "unbounded", mode: "result" },
        ),
      ),
    )

  yield* Option.match(EffectArray.head(EffectArray.getFailures(userResults)), {
    onNone: () => Effect.void,
    onSome: (failure) => Effect.logError("Failed parsing a user and profile: ", failure.message),
  })

  const usersDirectory = path.join(import.meta.dirname, "..", "..", "debug", "users")
  yield* fs.makeDirectory(usersDirectory, { recursive: true })

  const usersWithContent = EffectArray.getSuccesses(userResults).filter(
    (user) =>
      user.profile.bookmarks_count > 1 ||
      user.profile.edit_suggestions_count > 0 ||
      user.profile.notes_count > 0 ||
      user.profile.images_count > 0,
  )
  yield* Effect.forEach(
    usersWithContent,
    (user) =>
      Effect.gen(function* () {
        const data = yield* gelUserToPersonData(user)
        const encoded = yield* Schema.encodeEffect(
          Schema.fromJsonString(UserDataForMigration, { space: 2 }),
        )(data)
        yield* fs.writeFileString(path.join(usersDirectory, `${user.profile.handle}.json`), encoded)
      }),
    { concurrency: 1 },
  )
})
