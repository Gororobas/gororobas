import { And, describeFeature, Given, runSteps, Then, When } from "@gororobas/effect-bdd"
import { Effect, Schema } from "effect"

import { makeTestLayer, NotImplementedError } from "./bdd.js"

type World = Record<string, never>

const pass = <Ctx>(ctx: Ctx) => Effect.succeed(ctx)
const fail = <Ctx>(_ctx: Ctx) => Effect.fail(NotImplementedError)

describeFeature("./packages/server/test/wiki-revisions.feature", ({ Rule }) => {
  Rule(
    "Only people with community access can propose revisions",
    ({ Background, ScenarioOutline }) => {
      Background({
        steps: () =>
          runSteps(
            Given("the following people exist:", {
              handler: pass,
              params: Schema.Struct({
                table: Schema.Array(
                  Schema.Struct({
                    accessLevel: Schema.String,
                    name: Schema.String,
                  }),
                ),
              }),
            }),
          ),
      })

      ScenarioOutline("Person with community access can propose a revision", {
        layer: makeTestLayer(),
        steps: () =>
          runSteps(
            Given("a {word:entity} {string:title} exists", {
              handler: pass,
              params: Schema.Struct({ entity: Schema.String, title: Schema.String }),
            }),
            When("{string:name} proposes an edit to {word:entity} {string:title}", {
              handler: pass,
              params: Schema.Struct({
                entity: Schema.String,
                name: Schema.String,
                title: Schema.String,
              }),
            }),
            Then(
              "a revision is created with {string:evaluation} evaluation, created by {string:name}",
              {
                handler: fail,
                params: Schema.Struct({ evaluation: Schema.String, name: Schema.String }),
              },
            ),
            And("the {word:entity} {string:title} remains unchanged", {
              handler: pass,
              params: Schema.Struct({ entity: Schema.String, title: Schema.String }),
            }),
          ),
      })

      ScenarioOutline("Person awaiting access cannot propose a revision", {
        layer: makeTestLayer(),
        steps: () =>
          runSteps(
            Given("a {word:entity} {string:title} exists", {
              handler: pass,
              params: Schema.Struct({ entity: Schema.String, title: Schema.String }),
            }),
            When("{string:name} tries to propose an edit to {word:entity} {string:title}", {
              handler: pass,
              params: Schema.Struct({
                entity: Schema.String,
                name: Schema.String,
                title: Schema.String,
              }),
            }),
            Then("access is denied", {
              handler: fail,
            }),
          ),
      })

      ScenarioOutline("Blocked person cannot propose a revision", {
        layer: makeTestLayer(),
        steps: () =>
          runSteps(
            Given("a {word:entity} {string:title} exists", {
              handler: pass,
              params: Schema.Struct({ entity: Schema.String, title: Schema.String }),
            }),
            When("{string:name} tries to propose an edit to {word:entity} {string:title}", {
              handler: pass,
              params: Schema.Struct({
                entity: Schema.String,
                name: Schema.String,
                title: Schema.String,
              }),
            }),
            Then("access is denied", {
              handler: fail,
            }),
          ),
      })

      ScenarioOutline("Visitors cannot propose a revision", {
        layer: makeTestLayer(),
        steps: () =>
          runSteps(
            Given("a {word:entity} {string:title} exists", {
              handler: pass,
              params: Schema.Struct({ entity: Schema.String, title: Schema.String }),
            }),
            When("visitors try to propose an edit to {word:entity} {string:title}", {
              handler: pass,
              params: Schema.Struct({ entity: Schema.String, title: Schema.String }),
            }),
            Then("access is denied", {
              handler: fail,
            }),
          ),
      })
    },
  )

  Rule("Revisions must be evaluated by moderators or admins", ({ Background, ScenarioOutline }) => {
    Background({
      steps: () =>
        runSteps(
          Given("the following people exist:", {
            handler: pass,
            params: Schema.Struct({
              table: Schema.Array(
                Schema.Struct({
                  accessLevel: Schema.String,
                  name: Schema.String,
                }),
              ),
            }),
          }),
        ),
    })

    ScenarioOutline("Trusted participant cannot evaluate a revision", {
      layer: makeTestLayer(),
      steps: () =>
        runSteps(
          Given("a {word:entity} {string:title} exists", {
            handler: pass,
            params: Schema.Struct({ entity: Schema.String, title: Schema.String }),
          }),
          And("{string:name} has proposed a revision to {word:entity} {string:title}", {
            handler: pass,
            params: Schema.Struct({
              entity: Schema.String,
              name: Schema.String,
              title: Schema.String,
            }),
          }),
          When("{string:name} tries to approve the revision", {
            handler: pass,
            params: Schema.Struct({ name: Schema.String }),
          }),
          Then("access is denied", {
            handler: fail,
          }),
        ),
    })

    ScenarioOutline("Moderator approves a revision", {
      layer: makeTestLayer(),
      steps: () =>
        runSteps(
          Given("a {word:entity} {string:title} exists", {
            handler: pass,
            params: Schema.Struct({ entity: Schema.String, title: Schema.String }),
          }),
          And("{string:name} has proposed a revision to {word:entity} {string:title}", {
            handler: pass,
            params: Schema.Struct({
              entity: Schema.String,
              name: Schema.String,
              title: Schema.String,
            }),
          }),
          When("{string:name} approves the revision", {
            handler: pass,
            params: Schema.Struct({ name: Schema.String }),
          }),
          Then("the revision evaluation becomes {string:evaluation}", {
            handler: fail,
            params: Schema.Struct({ evaluation: Schema.String }),
          }),
          And("the revision shows evaluated by {string:name}", {
            handler: pass,
            params: Schema.Struct({ name: Schema.String }),
          }),
          And("the {word:entity} {string:title} reflects the approved edit", {
            handler: pass,
            params: Schema.Struct({ entity: Schema.String, title: Schema.String }),
          }),
        ),
    })

    ScenarioOutline("Admin approves a revision", {
      layer: makeTestLayer(),
      steps: () =>
        runSteps(
          Given("a {word:entity} {string:title} exists", {
            handler: pass,
            params: Schema.Struct({ entity: Schema.String, title: Schema.String }),
          }),
          And("{string:name} has proposed a revision to {word:entity} {string:title}", {
            handler: pass,
            params: Schema.Struct({
              entity: Schema.String,
              name: Schema.String,
              title: Schema.String,
            }),
          }),
          When("{string:name} approves the revision", {
            handler: pass,
            params: Schema.Struct({ name: Schema.String }),
          }),
          Then("the revision evaluation becomes {string:evaluation}", {
            handler: fail,
            params: Schema.Struct({ evaluation: Schema.String }),
          }),
          And("the revision shows evaluated by {string:name}", {
            handler: pass,
            params: Schema.Struct({ name: Schema.String }),
          }),
          And("the {word:entity} {string:title} reflects the approved edit", {
            handler: pass,
            params: Schema.Struct({ entity: Schema.String, title: Schema.String }),
          }),
        ),
    })

    ScenarioOutline("Moderator rejects a revision", {
      layer: makeTestLayer(),
      steps: () =>
        runSteps(
          Given("a {word:entity} {string:title} exists", {
            handler: pass,
            params: Schema.Struct({ entity: Schema.String, title: Schema.String }),
          }),
          And("{string:name} has proposed a revision to {word:entity} {string:title}", {
            handler: pass,
            params: Schema.Struct({
              entity: Schema.String,
              name: Schema.String,
              title: Schema.String,
            }),
          }),
          When("{string:name} rejects the revision", {
            handler: pass,
            params: Schema.Struct({ name: Schema.String }),
          }),
          Then("the revision evaluation becomes {string:evaluation}", {
            handler: fail,
            params: Schema.Struct({ evaluation: Schema.String }),
          }),
          And("the {word:entity} {string:title} remains unchanged", {
            handler: pass,
            params: Schema.Struct({ entity: Schema.String, title: Schema.String }),
          }),
        ),
    })
  })

  Rule("Evaluators can self-approve their own revisions", ({ Background, ScenarioOutline }) => {
    Background({
      steps: () =>
        runSteps(
          Given("the following people exist:", {
            handler: pass,
            params: Schema.Struct({
              table: Schema.Array(
                Schema.Struct({
                  accessLevel: Schema.String,
                  name: Schema.String,
                }),
              ),
            }),
          }),
        ),
    })

    ScenarioOutline("Moderator can approve their own revision", {
      layer: makeTestLayer(),
      steps: () =>
        runSteps(
          Given("a {word:entity} {string:title} exists", {
            handler: pass,
            params: Schema.Struct({ entity: Schema.String, title: Schema.String }),
          }),
          And("{string:name} has proposed a revision to {word:entity} {string:title}", {
            handler: pass,
            params: Schema.Struct({
              entity: Schema.String,
              name: Schema.String,
              title: Schema.String,
            }),
          }),
          When("{string:name} approves the revision", {
            handler: pass,
            params: Schema.Struct({ name: Schema.String }),
          }),
          Then("the revision evaluation becomes {string:evaluation}", {
            handler: fail,
            params: Schema.Struct({ evaluation: Schema.String }),
          }),
          And("the revision shows {string:name} as both editor and evaluator", {
            handler: pass,
            params: Schema.Struct({ name: Schema.String }),
          }),
          And("the {word:entity} {string:title} reflects the approved edit", {
            handler: pass,
            params: Schema.Struct({ entity: Schema.String, title: Schema.String }),
          }),
        ),
    })

    ScenarioOutline("Admin can approve their own revision", {
      layer: makeTestLayer(),
      steps: () =>
        runSteps(
          Given("a {word:entity} {string:title} exists", {
            handler: pass,
            params: Schema.Struct({ entity: Schema.String, title: Schema.String }),
          }),
          And("{string:name} has proposed a revision to {word:entity} {string:title}", {
            handler: pass,
            params: Schema.Struct({
              entity: Schema.String,
              name: Schema.String,
              title: Schema.String,
            }),
          }),
          When("{string:name} approves the revision", {
            handler: pass,
            params: Schema.Struct({ name: Schema.String }),
          }),
          Then("the revision evaluation becomes {string:evaluation}", {
            handler: fail,
            params: Schema.Struct({ evaluation: Schema.String }),
          }),
          And("the revision shows {string:name} as both editor and evaluator", {
            handler: pass,
            params: Schema.Struct({ name: Schema.String }),
          }),
          And("the {word:entity} {string:title} reflects the approved edit", {
            handler: pass,
            params: Schema.Struct({ entity: Schema.String, title: Schema.String }),
          }),
        ),
    })
  })

  Rule("Rejected revisions remain visible in history", ({ Background, ScenarioOutline }) => {
    Background({
      steps: () =>
        runSteps(
          Given("the following people exist:", {
            handler: pass,
            params: Schema.Struct({
              table: Schema.Array(
                Schema.Struct({
                  accessLevel: Schema.String,
                  name: Schema.String,
                }),
              ),
            }),
          }),
        ),
    })

    ScenarioOutline("Rejected revision remains visible in revision history", {
      layer: makeTestLayer(),
      steps: () =>
        runSteps(
          Given("a {word:entity} {string:title} exists", {
            handler: pass,
            params: Schema.Struct({ entity: Schema.String, title: Schema.String }),
          }),
          And("{string:name} has proposed a revision to {word:entity} {string:title}", {
            handler: pass,
            params: Schema.Struct({
              entity: Schema.String,
              name: Schema.String,
              title: Schema.String,
            }),
          }),
          And("{string:name} has rejected the revision", {
            handler: pass,
            params: Schema.Struct({ name: Schema.String }),
          }),
          When("viewing {word:entity} {string:title} revision history", {
            handler: pass,
            params: Schema.Struct({ entity: Schema.String, title: Schema.String }),
          }),
          Then("the rejected revision is visible with its rejection status", {
            handler: fail,
          }),
        ),
    })
  })
})

const _unused: World = {}
