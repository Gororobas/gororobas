import { Effect, pipe, Request, RequestResolver } from 'effect'
import type { ReferenceOption } from '@/types'
import { getMentionsDataAction } from './getMentionsData.action'

export type FreshMentionData = ReferenceOption & { handle: string }

class GetMentionByIdError {
  readonly _tag = 'GetMentionByIdError'

  constructor(readonly error: unknown) {}
}

class GetMentionByIdNotFoundError {
  readonly _tag = 'GetMentionByIdNotFoundError'

  constructor(readonly id: string) {}
}

interface GetMentionById extends Request.Request<
  FreshMentionData,
  GetMentionByIdError | GetMentionByIdNotFoundError
> {
  readonly _tag: 'GetMentionById'
  readonly id: string
}

const GetMentionById = Request.tagged<GetMentionById>('GetMentionById')

const GetMentionByIdResolver = RequestResolver.makeBatched(
  (requests: ReadonlyArray<GetMentionById>) => {
    return pipe(
      Effect.tryPromise({
        try: () =>
          getMentionsDataAction(
            Array.from(new Set(requests.map(({ id }) => id))),
          ),
        catch: (error) => new GetMentionByIdError(error),
      }),
      Effect.filterOrFail(
        (mentions) => mentions !== null,
        () => new GetMentionByIdError('error-in-server-action'),
      ),
      Effect.andThen((mentions) =>
        Effect.forEach(requests, (request) => {
          const mention = mentions.find((m) => m.value === request.id)
          return mention
            ? Request.completeEffect(request, Effect.succeed(mention))
            : Request.completeEffect(
                request,
                Effect.fail(new GetMentionByIdNotFoundError(request.id)),
              )
        }),
      ),
      Effect.catchAll((error) =>
        Effect.forEach(requests, (request) =>
          Request.completeEffect(request, Effect.fail(error)),
        ),
      ),
    )
  },
)

export const getMentionById = (id: string) =>
  pipe(
    Effect.request(GetMentionById({ id }), GetMentionByIdResolver),
    Effect.map((mention) => ({ mention })),
    Effect.catchAll((error) => Effect.succeed({ error: error._tag })),
  )

export type GetMentionByIdResult = Effect.Effect.Success<
  ReturnType<typeof getMentionById>
>

export const getMentionsById = (ids: string[]) =>
  Effect.forEach(ids, getMentionById, { batching: true })
