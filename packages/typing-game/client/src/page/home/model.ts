import { Match, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

export const HomeAction = Schema.Literals([
  'CreateRoom',
  'JoinRoom',
  'ChangeUsername',
])

export const HOME_ACTIONS: ReadonlyArray<typeof HomeAction.Type> = [
  'CreateRoom',
  'JoinRoom',
  'ChangeUsername',
] as const

export const homeActionToLabel = Match.type<typeof HomeAction.Type>().pipe(
  Match.when('CreateRoom', () => 'Create room'),
  Match.when('JoinRoom', () => 'Join room'),
  Match.when('ChangeUsername', () => 'Change username'),
  Match.exhaustive,
)

export const HomeStep = defineTaggedUnion({
  EnterUsername: { username: Schema.String },
  SelectAction: { username: Schema.String, selectedAction: HomeAction },
  EnterRoomId: { username: Schema.String, roomId: Schema.String },
})

export const Model = Schema.Struct({
  homeStep: HomeStep,
  formError: Schema.Option(Schema.String),
})

export const capturesKeyboard = (model: typeof Model.Type): boolean =>
  Match.value(model.homeStep).pipe(
    Match.tag('SelectAction', () => true),
    Match.orElse(() => false),
  )
