import {
  AuthenticationApi,
  MagicLinkIdentity,
  OAuthBeginPayload,
  OAuthCompletePayload,
} from "@gororobas/domain/authentication/auth-contract"
import { Client, EmailDelivery, Proofs } from "@yielded/auth"
import { Clock, Context, Effect, Layer, Predicate, Redacted, Ref, Result, Schema } from "effect"
import { Command, Update } from "foldkit"
import { HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { defineView } from "foldkit/submodel"

export const AuthenticationClient = Client.make(AuthenticationApi, {
  baseUrl: window.location.origin,
})

const savedMagicLink = Schema.Struct({
  identity: MagicLinkIdentity,
  reference: Proofs.ProofReference,
  expiresAt: Schema.Number,
})

const savedOAuth = Schema.Struct({ ...OAuthBeginPayload.fields, expiresAt: Schema.Number })
const magicLinkStorageKey = "gororobas.magic-link"
const oauthStorageKey = "gororobas.oauth"
const readSaved = <S extends Schema.ConstraintDecoder<unknown, never>>(key: string, schema: S) =>
  Effect.try(() => localStorage.getItem(key)).pipe(
    Effect.flatMap((value) => Schema.decodeEffect(Schema.fromJsonString(schema))(value ?? "null")),
  )

// Bearer proofs stay outside the serializable model and devtools history.
class AuthenticationConfirmation extends Context.Service<
  AuthenticationConfirmation,
  {
    readonly restore: Effect.Effect<boolean, unknown>
    readonly complete: Effect.Effect<void, unknown>
  }
>()("AuthenticationConfirmation") {}

const confirmationLayer = Layer.effect(
  AuthenticationConfirmation,
  Effect.gen(function* () {
    const { auth } = yield* AuthenticationClient
    const pendingConfirmation = yield* Ref.make<Effect.Effect<void, unknown> | undefined>(undefined)

    return {
      restore: Effect.gen(function* () {
        const fragment = window.location.pathname === "/login" ? window.location.hash : ""
        if (!fragment) return (yield* Ref.get(pendingConfirmation)) !== undefined
        history.replaceState(history.state, "", window.location.pathname + window.location.search)
        yield* Ref.set(pendingConfirmation, undefined)

        if (fragment.startsWith("#oauth=")) {
          const response = yield* Effect.try(() => decodeURIComponent(fragment.slice(7))).pipe(
            Effect.flatMap(
              Schema.decodeEffect(
                Schema.fromJsonString(
                  Schema.Struct({
                    provider: OAuthCompletePayload.fields.provider,
                    state: OAuthCompletePayload.fields.state,
                    code: OAuthCompletePayload.fields.code,
                  }),
                ),
              ),
            ),
          )

          const saved = yield* readSaved(oauthStorageKey, savedOAuth)

          if (
            saved.expiresAt <= (yield* Clock.currentTimeMillis) ||
            saved.provider !== response.provider
          ) {
            return yield* Effect.fail("invalid-flow")
          }

          yield* Ref.set(
            pendingConfirmation,
            auth
              .completeOAuth({
                ...response,
                code: Redacted.value(response.code),
                flowId: saved.flowId,
              })
              .pipe(
                Effect.flatMap((result) =>
                  Predicate.isTagged(result, "Authenticated")
                    ? Effect.void
                    : Effect.fail("incomplete"),
                ),
                Effect.tap(() => Effect.sync(() => localStorage.removeItem(oauthStorageKey))),
              ),
          )
        } else {
          const proof = yield* EmailDelivery.parseLinkFragment(Redacted.make(fragment))
          const saved = yield* readSaved(magicLinkStorageKey, savedMagicLink)

          if (
            saved.expiresAt <= (yield* Clock.currentTimeMillis) ||
            saved.reference.proofId !== proof.reference.proofId ||
            saved.reference.purpose !== proof.reference.purpose
          ) {
            return yield* Effect.fail("invalid-flow")
          }

          yield* Ref.set(
            pendingConfirmation,
            auth
              .completeMagicLink({
                ...saved.identity,
                reference: proof.reference,
                secret: Redacted.value(proof.secret),
              })
              .pipe(
                Effect.flatMap((result) =>
                  Predicate.isTagged(result, "Authenticated")
                    ? Effect.void
                    : Effect.fail("incomplete"),
                ),
                Effect.tap(() => Effect.sync(() => localStorage.removeItem(magicLinkStorageKey))),
              ),
          )
        }

        return true
      }),
      complete: Ref.getAndSet(pendingConfirmation, undefined).pipe(
        Effect.flatMap((operation) => operation ?? Effect.fail("invalid-flow")),
      ),
    }
  }),
)

export const resources = confirmationLayer.pipe(
  Layer.provideMerge(AuthenticationClient.layerFetch),
  Layer.orDie,
)

export const Model = Schema.Struct({
  name: Schema.String,
  email: Schema.String,
  isSignedIn: Schema.Boolean,
  isBusy: Schema.Boolean,
  isConfirming: Schema.Boolean,
  status: Schema.String,
})

export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ChangedName: { value: Schema.String },
  ChangedEmail: { value: Schema.String },
  RequestedMagicLink: {},
  RequestedOAuth: { provider: OAuthBeginPayload.fields.provider },
  ConfirmedLogin: {},
  RequestedSignOut: {},
  RestoredSession: { isSignedIn: Schema.Boolean, isConfirming: Schema.Boolean },
  SentMagicLink: {},
  CompletedLogin: {},
  CompletedSignOut: {},
  FailedAuthentication: { error: Schema.String },
})

export type Message = typeof Message.Type

const failed = () =>
  Message.FailedAuthentication({
    error: "Sign-in could not be completed. Request a fresh link in this browser.",
  })

export const RestoreSession = Command.define("RestoreSession", {
  messages: [Message.RestoredSession, Message.FailedAuthentication],
  execute: Effect.gen(function* () {
    const confirmation = yield* AuthenticationConfirmation
    const isConfirming = yield* confirmation.restore
    const { auth } = yield* AuthenticationClient
    const session = yield* auth.getSession()
    return Message.RestoredSession({ isSignedIn: session !== null, isConfirming })
  }).pipe(
    Effect.result,
    Effect.map(Result.match({ onSuccess: (value) => value, onFailure: () => failed() })),
  ),
})

export const RequestMagicLink = Command.define("RequestMagicLink", {
  args: { name: Schema.String, email: Schema.String },
  messages: [Message.SentMagicLink, Message.FailedAuthentication],
  execute: ({ name, email }) =>
    Effect.gen(function* () {
      const identity = yield* Schema.decodeEffect(MagicLinkIdentity)({
        flowId: crypto.randomUUID(),
        name: name.trim(),
        email: email.trim().toLowerCase(),
      })

      const { auth } = yield* AuthenticationClient
      yield* auth.beginMagicLink({ flowId: identity.flowId })

      const receipt = yield* auth.requestMagicLink({
        ...identity,
        requestId: Proofs.ProofRequestId.make(crypto.randomUUID()),
        language: navigator.language || "en",
      })

      const now = yield* Clock.currentTimeMillis

      yield* Effect.try(() =>
        localStorage.setItem(
          magicLinkStorageKey,
          Schema.encodeSync(Schema.fromJsonString(savedMagicLink))({
            identity,
            reference: receipt.reference,
            expiresAt: now + 300_000,
          }),
        ),
      )

      return Message.SentMagicLink()
    }).pipe(
      Effect.result,
      Effect.map(Result.match({ onSuccess: (value) => value, onFailure: () => failed() })),
    ),
})

const RequestOAuth = Command.define("RequestOAuth", {
  args: { provider: OAuthBeginPayload.fields.provider },
  messages: [Message.FailedAuthentication],
  execute: ({ provider }) =>
    Effect.gen(function* () {
      const input = OAuthBeginPayload.make({
        provider,
        flowId: OAuthBeginPayload.fields.flowId.make(crypto.randomUUID()),
      })
      const { auth } = yield* AuthenticationClient
      const result = yield* auth.beginOAuth(input)

      const now = yield* Clock.currentTimeMillis

      yield* Effect.try(() => {
        localStorage.setItem(
          oauthStorageKey,
          Schema.encodeSync(Schema.fromJsonString(savedOAuth))({
            ...input,
            expiresAt: now + 600_000,
          }),
        )

        window.location.assign(result.authorizationUrl)
      })

      return failed()
    }).pipe(
      Effect.result,
      Effect.map(
        Result.match({
          onSuccess: (value) => value,
          onFailure: () =>
            Message.FailedAuthentication({
              error: "This provider could not start sign-in. Try an email link.",
            }),
        }),
      ),
    ),
})

const CompleteLogin = Command.define("CompleteLogin", {
  messages: [Message.CompletedLogin, Message.FailedAuthentication],
  execute: Effect.flatMap(AuthenticationConfirmation, (confirmation) => confirmation.complete).pipe(
    Effect.as(Message.CompletedLogin()),
    Effect.result,
    Effect.map(Result.match({ onSuccess: (value) => value, onFailure: () => failed() })),
  ),
})

const SignOut = Command.define("SignOut", {
  messages: [Message.CompletedSignOut, Message.FailedAuthentication],
  execute: Effect.flatMap(AuthenticationClient, ({ auth }) => auth.signOut()).pipe(
    Effect.as(Message.CompletedSignOut()),
    Effect.result,
    Effect.map(
      Result.match({
        onSuccess: (value) => value,
        onFailure: () => Message.FailedAuthentication({ error: "Could not sign out. Try again." }),
      }),
    ),
  ),
})

export const init: Model = {
  name: "",
  email: "",
  isSignedIn: false,
  isBusy: true,
  isConfirming: false,
  status: "Checking session…",
}

export const update = (
  model: Model,
  message: Message,
): Update.Return<Model, Message, Layer.Success<typeof resources>> =>
  Message.match(message, {
    ChangedName: ({ value }) => ({ model: { ...model, name: value } }),
    ChangedEmail: ({ value }) => ({ model: { ...model, email: value } }),
    RequestedMagicLink: () =>
      model.isBusy
        ? { model }
        : {
            model: { ...model, isBusy: true, status: "Sending link…" },
            commands: [RequestMagicLink({ name: model.name, email: model.email })],
          },
    RequestedOAuth: ({ provider }) =>
      model.isBusy
        ? { model }
        : { model: { ...model, isBusy: true }, commands: [RequestOAuth({ provider })] },
    ConfirmedLogin: () =>
      model.isBusy || !model.isConfirming
        ? { model }
        : { model: { ...model, isBusy: true }, commands: [CompleteLogin()] },
    RequestedSignOut: () =>
      model.isBusy ? { model } : { model: { ...model, isBusy: true }, commands: [SignOut()] },
    RestoredSession: ({ isSignedIn, isConfirming }) => ({
      model: {
        ...model,
        isSignedIn,
        isConfirming,
        isBusy: false,
        status: isConfirming
          ? "Confirm to finish signing in."
          : isSignedIn
            ? "You are signed in."
            : "Sign in with an email link.",
      },
    }),
    SentMagicLink: () => ({
      model: {
        ...model,
        isBusy: false,
        status:
          "Check your email and open the link in this browser. Your account is created after confirmation.",
      },
    }),
    CompletedLogin: () => ({
      model: {
        ...model,
        isBusy: false,
        isConfirming: false,
        isSignedIn: true,
        status: "You are signed in.",
      },
    }),
    CompletedSignOut: () => ({
      model: { ...model, isBusy: false, isSignedIn: false, status: "You are signed out." },
    }),
    FailedAuthentication: ({ error }) => ({
      model: { ...model, isBusy: false, isConfirming: false, status: error },
    }),
  })

export const view = defineView<Model, Message>((model: Model, h: HtmlBuilder<Message>) =>
  h.main(
    [],
    [
      h.h1([], ["Sign in to Gororobas"]),
      model.isConfirming
        ? h.button(
            [h.Disabled(model.isBusy), h.OnClick(Message.ConfirmedLogin())],
            ["Confirm sign-in"],
          )
        : model.isSignedIn
          ? h.button(
              [h.Disabled(model.isBusy), h.OnClick(Message.RequestedSignOut())],
              ["Sign out"],
            )
          : h.form(
              [h.OnSubmit(Message.RequestedMagicLink())],
              [
                h.label(
                  [],
                  [
                    "Name ",
                    h.input([
                      h.Type("text"),
                      h.Name("name"),
                      h.Required(true),
                      h.Attribute("maxlength", "128"),
                      h.Attribute("autocomplete", "name"),
                      h.Value(model.name),
                      h.OnInput((value) => Message.ChangedName({ value })),
                    ]),
                  ],
                ),
                h.label(
                  [],
                  [
                    "Email ",
                    h.input([
                      h.Type("email"),
                      h.Name("email"),
                      h.Required(true),
                      h.Attribute("maxlength", "320"),
                      h.Attribute("autocomplete", "email"),
                      h.Value(model.email),
                      h.OnInput((value) => Message.ChangedEmail({ value })),
                    ]),
                  ],
                ),
                h.button([h.Type("submit"), h.Disabled(model.isBusy)], ["Send magic link"]),
              ],
            ),
      ...(!model.isConfirming
        ? OAuthBeginPayload.fields.provider.literals.map((provider) =>
            h.button(
              [h.Disabled(model.isBusy), h.OnClick(Message.RequestedOAuth({ provider }))],
              [`Continue with ${provider}`],
            ),
          )
        : []),
      h.p([h.Role("status"), h.Attribute("aria-live", "polite")], [model.status]),
    ],
  ),
)
