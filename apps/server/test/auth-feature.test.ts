import { NodeServices } from "@effect/platform-node"
import { expect } from "@effect/vitest"
import { AuthenticationApi, Handle } from "@gororobas/domain"
import { describeFeature, Given, runSteps, Then, When } from "@gororobas/effect-bdd"
import { Effect, Layer, Schema } from "effect"
import { WorkflowEngine } from "effect/workflow"

import { ApiTestClient, startTestClockAtRealTime } from "./api-test-client.js"
import {
  PeopleBackground,
  PeopleFeatureTestLayer,
  PeopleTestDataTable,
  personNamed,
  provisionPeople,
} from "./feature-test-helpers.js"

const AuthenticationTestLayer = ApiTestClient.layer.pipe(
  Layer.provideMerge(PeopleFeatureTestLayer),
  Layer.provideMerge(WorkflowEngine.layerMemory),
  Layer.provideMerge(NodeServices.layer),
)

type Api = ApiTestClient["Service"]
type Browser = ReturnType<Api["newBrowser"]>
type PendingCode = Effect.Success<ReturnType<Api["requestCode"]>>

type AuthenticationContext = typeof PeopleBackground.Type & {
  api: Api
  browser?: Browser
  pending?: PendingCode
  response?: Response
  email?: string
}

const required = <A>(value: A | undefined, what: string): A => {
  if (value === undefined) throw new Error(`Missing ${what} in scenario context`)
  return value
}

/** Names from the people table resolve to their account email; anything else is an address. */
const emailFor = (context: AuthenticationContext, nameOrEmail: string) =>
  nameOrEmail.includes("@")
    ? Effect.succeed(nameOrEmail)
    : context.api.emailOf(personNamed(context.actors, nameOrEmail))

const givenPeople = () =>
  Given("the following people exist:", {
    params: PeopleTestDataTable,
    handler: (_, { table }) =>
      Effect.gen(function* () {
        yield* startTestClockAtRealTime
        const people = yield* provisionPeople(table)
        return { ...people, api: yield* ApiTestClient } satisfies AuthenticationContext
      }),
  })

const requestCode = (context: AuthenticationContext, nameOrEmail: string) =>
  Effect.gen(function* () {
    const email = yield* emailFor(context, nameOrEmail)
    const browser = context.api.newBrowser()
    const pending = yield* context.api.requestCode(browser, email)
    return { ...context, browser, pending, email }
  })

const NameOrEmail = Schema.Struct({ person: Schema.String })

const requestsCode = () =>
  When("{string:person} requests a sign-in code", {
    params: NameOrEmail,
    handler: (context: AuthenticationContext, { person }) => requestCode(context, person),
  })

const hasRequestedCode = () =>
  Given("{string:person} has requested a sign-in code", {
    params: NameOrEmail,
    handler: (context: AuthenticationContext, { person }) => requestCode(context, person),
  })

const emailSentStep = (subject: RegExp) => ({
  params: NameOrEmail,
  handler: (context: AuthenticationContext, { person }: typeof NameOrEmail.Type) =>
    Effect.gen(function* () {
      const pending = required(context.pending, "pending code")
      expect(pending.message.to).toBe(yield* emailFor(context, person))
      expect(pending.message.subject).toContain(pending.code)
      expect(pending.message.subject).toMatch(subject)
      return context
    }),
})

const welcomeEmailSent = () =>
  Then("a welcome email with the code is sent to {string:person}", emailSentStep(/criar sua conta/))

const signInEmailSent = () =>
  Then("a sign-in email with the code is sent to {string:person}", emailSentStep(/para entrar/))

const enterCode =
  (browser: (context: AuthenticationContext) => Browser, code?: string) =>
  (context: AuthenticationContext) =>
    Effect.gen(function* () {
      const response = yield* context.api.enterCode({
        browser: browser(context),
        pending: required(context.pending, "pending code"),
        code,
      })

      return { ...context, response }
    })

const entersCode = () =>
  When("they enter the code in the same browser", {
    handler: enterCode((context) => required(context.browser, "browser")),
  })

const entersCodeElsewhere = () =>
  When("they enter the code in another browser", {
    handler: (context: AuthenticationContext) => {
      // Later steps check the session of the browser that tried.
      const elsewhere = context.api.newBrowser()
      return enterCode(() => elsewhere)({ ...context, browser: elsewhere })
    },
  })

const entersWrongCode = () =>
  When("they enter a wrong code", {
    handler: (context: AuthenticationContext) =>
      enterCode(
        (current) => required(current.browser, "browser"),
        required(context.pending, "pending code").code === "000000" ? "111111" : "000000",
      )(context),
  })

const sessionOf = (context: AuthenticationContext) =>
  required(context.browser, "browser").call(AuthenticationApi.actions.getSession)

const notSignedIn = () =>
  Then("they are not signed in", {
    handler: (context: AuthenticationContext) =>
      Effect.gen(function* () {
        expect(yield* sessionOf(context)).toBeNull()
        return context
      }),
  })

const signedInWithoutProfile = () =>
  Then("they are signed in without a profile", {
    handler: (context: AuthenticationContext) =>
      Effect.gen(function* () {
        expect(yield* sessionOf(context)).not.toBeNull()
        const client = yield* context.api.clientWith(required(context.browser, "browser"))
        expect(yield* client.people.getMyProfile()).toBeNull()
        return context
      }),
  })

const completesOnboarding = () =>
  When("they complete onboarding as {string:name}", {
    params: Schema.Struct({ name: Schema.String }),
    handler: (context: AuthenticationContext, { name }) =>
      Effect.gen(function* () {
        const client = yield* context.api.clientWith(required(context.browser, "browser"))
        yield* client.people.completeOnboarding({ payload: { name } })
        return context
      }),
  })

const signedInAsNewcomer = () =>
  Then("they are signed in as a NEWCOMER with the handle {string:handle}", {
    params: Schema.Struct({ handle: Handle }),
    handler: (context: AuthenticationContext, { handle }) =>
      Effect.gen(function* () {
        const client = yield* context.api.clientWith(required(context.browser, "browser"))
        const profile = yield* client.people.getMyProfile()
        expect(profile?.handle).toBe(handle)
        // Newcomers can't create organizations yet.
        const denied = yield* client.organizations
          .createOrganization({ payload: { name: "Coletivo", handle, type: "COLLECTIVE" } })
          .pipe(Effect.flip)
        expect(denied).toMatchObject({ _tag: "UnauthorizedError" })
        return context
      }),
  })

const signedInAs = () =>
  Then("they are signed in as {string:name}", {
    params: Schema.Struct({ name: Schema.String }),
    handler: (context: AuthenticationContext, { name }) =>
      Effect.gen(function* () {
        const session = yield* sessionOf(context)
        expect(session?.subjectId).toBe(personNamed(context.actors, name))
        const client = yield* context.api.clientWith(required(context.browser, "browser"))
        expect((yield* client.people.getMyProfile())?.name).toBe(name)
        return context
      }),
  })

const hasSignedIn = () =>
  Given("{string:person} has signed in", {
    params: NameOrEmail,
    handler: (context: AuthenticationContext, { person }) =>
      Effect.gen(function* () {
        const requested = yield* requestCode(context, person)
        const browser = required(requested.browser, "browser")

        yield* browser.call(AuthenticationApi.actions.completeEmailSignIn, {
          ...required(requested.pending, "pending code").flow,
          reference: required(requested.pending, "pending code").reference,
          secret: required(requested.pending, "pending code").code,
        })

        return requested
      }),
  })

const signsOut = () =>
  When("they sign out", {
    handler: (context: AuthenticationContext) =>
      required(context.browser, "browser")
        .call(AuthenticationApi.actions.signOut)
        .pipe(Effect.as(context)),
  })

await Effect.runPromise(
  describeFeature("./auth.feature", ({ Background, Scenario }) => {
    Background({ layer: AuthenticationTestLayer, steps: () => runSteps(givenPeople()) })

    Scenario("Someone new signs up and completes onboarding", {
      layer: AuthenticationTestLayer,
      steps: () =>
        runSteps(
          requestsCode(),
          welcomeEmailSent(),
          entersCode(),
          signedInWithoutProfile(),
          completesOnboarding(),
          signedInAsNewcomer(),
        ),
    })

    Scenario("A person with an account signs back in", {
      layer: AuthenticationTestLayer,
      steps: () => runSteps(requestsCode(), signInEmailSent(), entersCode(), signedInAs()),
    })

    Scenario("A wrong code doesn't sign anyone in", {
      layer: AuthenticationTestLayer,
      steps: () =>
        runSteps(hasRequestedCode(), entersWrongCode(), notSignedIn(), entersCode(), signedInAs()),
    })

    Scenario("Codes only work in the browser that requested them", {
      layer: AuthenticationTestLayer,
      steps: () => runSteps(hasRequestedCode(), entersCodeElsewhere(), notSignedIn()),
    })

    Scenario("Signing out ends the session", {
      layer: AuthenticationTestLayer,
      steps: () => runSteps(hasSignedIn(), signsOut(), notSignedIn()),
    })
  }).pipe(Effect.provide(NodeServices.layer)),
)
