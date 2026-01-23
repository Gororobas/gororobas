// Currently just a sketch of how authorization + data selection could work

import type { QueriedPostData } from "@/schema"
import { Effect, Option } from "effect"
import Policies from './policies'

export const projectPostForCard = (post: QueriedPostData) =>
  Effect.gen(function* () {
    return {
      ...post,
      // Not true data, just showing behavior of using policies + Option for dynamic data access
      contributors: yield* Policies.check(Policies.posts.canViewHistory(post)) ? Option.some(post.translation_source) : Option.none(),
    }
  })

// Service composition example
// export const getPostByHandle = (postHandle: string) =>
//   Effect.gen(function* () {
//     const post = yield* ...
//     yield* Policies.posts.canView(post)
//     return yield* projectPostForCard(post)
//   })
