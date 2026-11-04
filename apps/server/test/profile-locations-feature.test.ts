import { NodeServices } from "@effect/platform-node"
import { expect } from "@effect/vitest"
import {
  createCrdtListItemId,
  gazetteerPlaceLabel,
  type GazetteerPlaceSummary,
  InformationVisibility,
  type PartialDate,
  type ProfileLocationData,
  Handle,
  type ProfileLocationPayload,
  type WikiArticleQueriedCardData,
  WikidataId,
  WikiPlaceArticle,
} from "@gororobas/domain"
import { And, describeFeature, Given, runSteps, Then, When } from "@gororobas/effect-bdd"
import { Array as EffectArray, Effect, Layer, Option, Order, Record, Result, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"
import { WorkflowEngine } from "effect/workflow"

import { WikiArticlesRepository } from "../src/wiki/repository.js"
import { ApiTestClient, startTestClockAtRealTime } from "./api-test-client.js"
import {
  PeopleBackground,
  PeopleFeatureTestLayer,
  PeopleTestDataTable,
  personNamed,
  provisionPeople,
} from "./feature-test-helpers.js"

const ProfileLocationsTestLayer = ApiTestClient.layer.pipe(
  Layer.provideMerge(PeopleFeatureTestLayer),
  Layer.provideMerge(WorkflowEngine.layerMemory),
  Layer.provideMerge(NodeServices.layer),
)

type Api = ApiTestClient["Service"]
type Client = Effect.Success<ReturnType<Api["signIn"]>>

type Browser = Effect.Success<ReturnType<Api["signInBrowser"]>>

type LocationsContext = typeof PeopleBackground.Type & {
  api: Api
  /** Each person signs in once per scenario: an email sign-in per step would slow scenarios down. */
  browsers: { [person: string]: Browser }
  found?: ReadonlyArray<GazetteerPlaceSummary> | undefined
  /** The tag of the error the last request failed with. */
  refusal?: string | undefined
}

const Person = Schema.Struct({ person: Schema.String })

const clientOf = ({
  context,
  person,
  headers,
}: Readonly<{
  context: LocationsContext
  person: string
  headers?: Record.ReadonlyRecord<string, string>
}>) =>
  Effect.gen(function* () {
    const browser =
      context.browsers[person] ??
      (yield* context.api.signInBrowser(
        yield* context.api.emailOf(personNamed(context.actors, person)),
      ))

    context.browsers[person] = browser
    return yield* context.api.clientWith(browser, headers)
  })

const locationsOf = (context: LocationsContext, person: string) =>
  Effect.flatMap(clientOf({ context, person }), (client) => client.profiles.listMyLocations())

const locationText = (location: ProfileLocationData) =>
  location.place._tag === "FreeText" ? location.place.text : location.place.placeName

const year = (value: number): PartialDate => ({ precision: "year", year: value, timezone: "UTC" })

/** Names of fixture gazetteer places become gazetteer places; anything else is free text. */
const placeInput = ({
  client,
  place,
  label,
}: Readonly<{ client: Client; place: string; label: Option.Option<string> }>) =>
  Effect.gen(function* () {
    const match = (yield* client.places.searchGazetteerPlaces({ query: { text: place } })).find(
      (candidate) => candidate.name === place,
    )

    return match === undefined
      ? ({ _tag: "FreeText", text: place } as const)
      : ({
          _tag: "GazetteerPlace",
          gazetteerPlaceId: match.id,
          label,
          elevation: Option.none(),
        } as const)
  })

const addLocation = (client: Client, payload: ProfileLocationPayload) =>
  client.profiles.addMyLocation({ payload })

const givenPeople = () =>
  Given("the following people exist:", {
    params: PeopleTestDataTable,
    handler: (_, { table }) =>
      Effect.gen(function* () {
        yield* startTestClockAtRealTime
        const people = yield* provisionPeople(table)
        return { ...people, api: yield* ApiTestClient, browsers: {} } satisfies LocationsContext
      }),
  })

const LocationsTable = Schema.Struct({
  person: Schema.String,
  table: Schema.Array(
    Schema.Struct({
      place: Schema.String,
      label: Schema.String,
      from: Schema.String,
      until: Schema.String,
      visibility: InformationVisibility,
    }),
  ),
})

const optionalYear = (cell: string) =>
  cell === "" ? Option.none() : Option.some(year(Number(cell)))

const hasTheseLocations = {
  params: LocationsTable,
  handler: (context: LocationsContext, { person, table }: typeof LocationsTable.Type) =>
    Effect.gen(function* () {
      const client = yield* clientOf({ context, person })

      yield* Effect.forEach(
        table,
        (row) =>
          Effect.gen(function* () {
            yield* addLocation(client, {
              place: yield* placeInput({
                client,
                place: row.place,
                label: row.label === "" ? Option.none() : Option.some(row.label),
              }),
              startDate: optionalYear(row.from),
              endDate: optionalYear(row.until),
              visibility: row.visibility,
            })
          }),
        { concurrency: 1, discard: true },
      )

      return context
    }),
}

const searchesPlaces = () =>
  When("{string:person} searches places for {string:text} from {string:country}", {
    params: Schema.Struct({ person: Schema.String, text: Schema.String, country: Schema.String }),
    handler: (context: LocationsContext, { person, text, country }) =>
      Effect.gen(function* () {
        const client = yield* clientOf({ context, person, headers: { "cf-ipcountry": country } })
        const found = yield* client.places.searchGazetteerPlaces({ query: { text } })
        return { ...context, found }
      }),
  })

const placesFound = () =>
  Then("the places found are {string:first} and {string:second}", {
    params: Schema.Struct({ first: Schema.String, second: Schema.String }),
    handler: (context: LocationsContext, { first, second }) =>
      Effect.sync(() => {
        expect((context.found ?? []).slice(0, 2).map(gazetteerPlaceLabel)).toEqual([first, second])
        return context
      }),
  })

const placeFoundMatchedAs = () =>
  Then("the place found is {string:label}, matched as {string:matchedName}", {
    params: Schema.Struct({ label: Schema.String, matchedName: Schema.String }),
    handler: (context: LocationsContext, { label, matchedName }) =>
      Effect.sync(() => {
        const [first] = context.found ?? []
        expect(first && gazetteerPlaceLabel(first)).toBe(label)
        expect(first?.matchedName).toBe(matchedName)
        return context
      }),
  })

const placeFound = () =>
  Then("the place found is {string:label}", {
    params: Schema.Struct({ label: Schema.String }),
    handler: (context: LocationsContext, { label }) =>
      Effect.sync(() => {
        expect((context.found ?? []).map(gazetteerPlaceLabel)).toEqual([label])
        return context
      }),
  })

const looksUpMunicipality = () =>
  When(
    "{string:person} looks up the municipality at latitude {float:latitude} and longitude {float:longitude}",
    {
      params: Schema.Struct({
        person: Schema.String,
        latitude: Schema.Finite,
        longitude: Schema.Finite,
      }),
      handler: (context: LocationsContext, { person, latitude, longitude }) =>
        Effect.gen(function* () {
          const client = yield* clientOf({ context, person })
          const result = yield* client.places
            .findMunicipalityContaining({ payload: { latitude, longitude } })
            .pipe(Effect.result)

          return Result.match(result, {
            onSuccess: (place): LocationsContext => ({
              ...context,
              found: [place],
              refusal: undefined,
            }),
            onFailure: (error): LocationsContext => ({
              ...context,
              found: [],
              refusal: error._tag,
            }),
          })
        }),
    },
  )

const noMunicipalityFound = () =>
  Then("no municipality is found", {
    handler: (context: LocationsContext) =>
      Effect.sync(() => {
        expect(context.refusal).toBe("GazetteerPlaceNotFoundError")
        return context
      }),
  })

const hasNoLocationsStep = {
  params: Person,
  handler: (context: LocationsContext, { person }: typeof Person.Type) =>
    Effect.gen(function* () {
      expect(yield* locationsOf(context, person)).toEqual([])
      return context
    }),
}

const noPlaceArticles = () =>
  And("there are no PLACE articles", {
    handler: (context: LocationsContext) =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const rows = yield* sql`SELECT id FROM wiki_article_projections WHERE kind = 'PLACE'`
        expect(rows).toEqual([])
        return context
      }),
  })

const placeArticles = SqlSchema.findAll({
  Request: Schema.Void,
  Result: Schema.Struct({ name: Schema.String, contributors: Schema.Finite }),
  execute: () =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT json_extract(t.common_names, '$[0].name') AS name,
          (SELECT COUNT(*) FROM wiki_article_revisions r
            WHERE r.wiki_article_id = a.id AND r.created_by_id IS NOT NULL) AS contributors
        FROM wiki_article_projections a
        JOIN wiki_article_translations t ON t.wiki_article_id = a.id AND t.language = 'pt'
        JOIN place_projections place ON place.wiki_article_id = a.id
        WHERE a.kind = 'PLACE'
        ORDER BY name
      `,
    ),
})

const placeArticlesWithoutContributors = () =>
  Then(
    "there are PLACE articles for {string:country}, {string:state} and {string:municipality}, without contributors",
    {
      params: Schema.Struct({
        country: Schema.String,
        state: Schema.String,
        municipality: Schema.String,
      }),
      handler: (context: LocationsContext, { country, state, municipality }) =>
        Effect.gen(function* () {
          const articles = yield* placeArticles()

          expect(articles).toEqual(
            EffectArray.sort([country, state, municipality], Order.String).map((name) => ({
              name,
              contributors: 0,
            })),
          )

          return context
        }),
    },
  )

const placeParent = SqlSchema.findOne({
  Request: Schema.String,
  Result: Schema.Struct({ parentName: Schema.NullOr(Schema.String) }),
  execute: (name) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT json_extract(parent.common_names, '$[0].name') AS parent_name
        FROM place_projections place
        JOIN wiki_article_translations t ON t.wiki_article_id = place.wiki_article_id
          AND t.language = 'pt'
        LEFT JOIN wiki_article_translations parent
          ON parent.wiki_article_id = place.parent_place_id AND parent.language = 'pt'
        WHERE json_extract(t.common_names, '$[0].name') = ${name}
      `,
    ),
})

const placeIsInside = () =>
  And("the place {string:place} is inside {string:parent}", {
    params: Schema.Struct({ place: Schema.String, parent: Schema.String }),
    handler: (context: LocationsContext, { place, parent }) =>
      Effect.gen(function* () {
        expect((yield* placeParent(place)).parentName).toBe(parent)
        return context
      }),
  })

const placeIsInsideNothing = () =>
  And("the place {string:place} is inside nothing", {
    params: Schema.Struct({ place: Schema.String }),
    handler: (context: LocationsContext, { place }) =>
      Effect.gen(function* () {
        expect((yield* placeParent(place)).parentName).toBeNull()
        return context
      }),
  })

const placeHandleNamed = SqlSchema.findOne({
  Request: Schema.String,
  Result: Schema.Struct({ handle: Handle }),
  execute: (name) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT h.handle FROM wiki_article_handles h
        JOIN wiki_article_translations t ON t.wiki_article_id = h.wiki_article_id
          AND t.language = h.language
        WHERE h.kind = 'PLACE' AND h.language = 'pt'
          AND json_extract(t.common_names, '$[0].name') = ${name}
      `,
    ),
})

const placePage = (context: LocationsContext, name: string) =>
  Effect.gen(function* () {
    const { handle } = yield* placeHandleNamed(name)
    const page = yield* (yield* context.api.visitor).wiki.getWikiArticleByHandleAndKind({
      params: { kind: "PLACE", handle },
      query: { language: "pt" },
    })
    expect(page.kind).toBe("PLACE")
    return page
  })

const cardNames = (cards: ReadonlyArray<WikiArticleQueriedCardData>) =>
  cards.flatMap((card) => EffectArray.take(card.commonNames, 1).map(({ name }) => name))

const pageShowsAncestors = () =>
  Then("the page of {string:place} shows it inside {string:parent} and {string:country}", {
    params: Schema.Struct({ place: Schema.String, parent: Schema.String, country: Schema.String }),
    handler: (context: LocationsContext, { place, parent, country }) =>
      Effect.gen(function* () {
        const page = yield* placePage(context, place)
        expect(page.kind === "PLACE" ? cardNames(page.ancestorPlaces) : []).toEqual([
          parent,
          country,
        ])
        return context
      }),
  })

const pageShowsChild = () =>
  And("the page of {string:place} shows {string:child} inside it", {
    params: Schema.Struct({ place: Schema.String, child: Schema.String }),
    handler: (context: LocationsContext, { place, child }) =>
      Effect.gen(function* () {
        const page = yield* placePage(context, place)
        expect(page.kind === "PLACE" ? cardNames(page.childPlaces) : []).toEqual([child])
        return context
      }),
  })

const mapSurroundings = (context: LocationsContext, place: string) =>
  Effect.gen(function* () {
    const page = yield* placePage(context, place)
    const map = page.kind === "PLACE" ? page.map : null
    expect(map).not.toBeNull()
    return Option.map(Option.fromNullishOr(map), (found) =>
      Option.map(found.surroundings, (outline) => outline.name),
    ).pipe(Option.flatten)
  })

const mapDrawsInside = () =>
  And("the map on the page of {string:place} draws it inside {string:surroundings}", {
    params: Schema.Struct({ place: Schema.String, surroundings: Schema.String }),
    handler: (context: LocationsContext, { place, surroundings }) =>
      Effect.gen(function* () {
        expect(yield* mapSurroundings(context, place)).toEqual(Option.some(surroundings))
        return context
      }),
  })

const mapDrawsInsideNothing = () =>
  And("the map on the page of {string:place} draws it inside nothing", {
    params: Schema.Struct({ place: Schema.String }),
    handler: (context: LocationsContext, { place }) =>
      Effect.gen(function* () {
        expect(yield* mapSurroundings(context, place)).toEqual(Option.none())
        return context
      }),
  })

const wrotePlaceArticle = () =>
  Given(
    "{string:person} wrote a PLACE article {string:name} about Wikidata's {string:wikidataId}",
    {
      params: Schema.Struct({
        person: Schema.String,
        name: Schema.String,
        wikidataId: WikidataId,
      }),
      handler: (context: LocationsContext, { person, name, wikidataId }) =>
        Effect.gen(function* () {
          const translation = {
            commonNames: [
              { id: createCrdtListItemId(), name, grammaticalGender: Option.none() },
            ] as const,
            content: Option.none(),
          }

          yield* (yield* WikiArticlesRepository).createWikiArticle({
            wikiArticle: WikiPlaceArticle.EditableArticle.make({
              kind: "PLACE",
              attributes: WikiPlaceArticle.EditableAttributes.make({
                placeKind: Option.some("MUNICIPALITY"),
                whosOnFirstId: Option.none(),
                wikidataId: Option.some(wikidataId),
                geonamesId: Option.none(),
                parentPlaceId: Option.none(),
              }),
              translations: { pt: translation, es: translation, en: translation },
            }),
            createdById: personNamed(context.actors, person),
            status: "PUBLISHED",
          })

          return context
        }),
    },
  )

const onlyPlaceArticleByOneContributor = () =>
  Then("the only PLACE article is {string:name}, by one contributor", {
    params: Schema.Struct({ name: Schema.String }),
    handler: (context: LocationsContext, { name }) =>
      Effect.gen(function* () {
        expect(yield* placeArticles()).toEqual([{ name, contributors: 1 }])
        return context
      }),
  })

const locationsAreStep = (names: ReadonlyArray<string>) => ({
  params: Schema.Struct({
    person: Schema.String,
    ...Record.fromEntries(names.map((name) => [name, Schema.String] as const)),
  }),
  handler: (
    context: LocationsContext,
    params: { readonly person: string } & Record.ReadonlyRecord<string, string>,
  ) =>
    Effect.gen(function* () {
      const locations = yield* locationsOf(context, params.person)
      expect(locations.map(locationText)).toEqual(names.map((name) => params[name]))
      return context
    }),
})

const profileSearchLocation = (context: LocationsContext, person: string) =>
  Effect.gen(function* () {
    const profiles = yield* (yield* context.api.visitor).profiles.searchProfiles({ query: {} })
    const profile = profiles.find(
      (candidate) => candidate.id === personNamed(context.actors, person),
    )
    expect(profile).toBeDefined()
    return profile?.location ?? null
  })

const profileSearchShowsIn = () =>
  Then("profile search shows {string:person} in {string:text}", {
    params: Schema.Struct({ person: Schema.String, text: Schema.String }),
    handler: (context: LocationsContext, { person, text }) =>
      Effect.gen(function* () {
        expect((yield* profileSearchLocation(context, person))?.text).toBe(text)
        return context
      }),
  })

const profileSearchShowsWithoutLocation = () =>
  Then("profile search shows {string:person} without a location", {
    params: Person,
    handler: (context: LocationsContext, { person }) =>
      Effect.gen(function* () {
        expect(yield* profileSearchLocation(context, person)).toBeNull()
        return context
      }),
  })

const addsPrivately = () =>
  When("{string:person} adds {string:text} privately, from {int:from}", {
    params: Schema.Struct({ person: Schema.String, text: Schema.String, from: Schema.Int }),
    handler: (context: LocationsContext, { person, text, from }) =>
      Effect.gen(function* () {
        yield* addLocation(yield* clientOf({ context, person }), {
          place: { _tag: "FreeText", text },
          startDate: Option.some(year(from)),
          endDate: Option.none(),
          visibility: "PRIVATE",
        })

        return context
      }),
  })

const addsWithDates = () =>
  When("{string:person} adds {string:text} from {int:from} until {int:until}", {
    params: Schema.Struct({
      person: Schema.String,
      text: Schema.String,
      from: Schema.Int,
      until: Schema.Int,
    }),
    handler: (context: LocationsContext, { person, text, from, until }) =>
      Effect.gen(function* () {
        const result = yield* addLocation(yield* clientOf({ context, person }), {
          place: { _tag: "FreeText", text },
          startDate: Option.some(year(from)),
          endDate: Option.some(year(until)),
          visibility: "PUBLIC",
        }).pipe(Effect.result)

        const next: LocationsContext = {
          ...context,
          refusal: Result.isFailure(result) ? result.failure._tag : undefined,
        }
        return next
      }),
  })

const refusedForDates = () =>
  Then("the location is refused for its dates", {
    handler: (context: LocationsContext) =>
      Effect.sync(() => {
        expect(context.refusal).toBe("InvalidProfileLocationDatesError")
        return context
      }),
  })

const locationIdOf = ({
  context,
  person,
  text,
}: Readonly<{ context: LocationsContext; person: string; text: string }>) =>
  Effect.map(locationsOf(context, person), (locations) => {
    const location = locations.find((candidate) => locationText(candidate) === text)
    if (location === undefined) throw new Error(`${person} has no location "${text}"`)
    return location.id
  })

const triesToRemoveOthers = () =>
  When("{string:person} tries to remove {string:owner}'s location {string:text}", {
    params: Schema.Struct({ person: Schema.String, owner: Schema.String, text: Schema.String }),
    handler: (context: LocationsContext, { person, owner, text }) =>
      Effect.gen(function* () {
        const id = yield* locationIdOf({ context, person: owner, text })
        const refusal = yield* (yield* clientOf({ context, person })).profiles
          .deleteMyLocation({ params: { id } })
          .pipe(Effect.flip)
        // Someone else's location is as missing as one that never existed.
        expect(refusal._tag).toBe("ProfileLocationNotFoundError")
        return context
      }),
  })

const removesOwn = () =>
  When("{string:person} removes their location {string:text}", {
    params: Schema.Struct({ person: Schema.String, text: Schema.String }),
    handler: (context: LocationsContext, { person, text }) =>
      Effect.gen(function* () {
        const id = yield* locationIdOf({ context, person: person, text })
        yield* (yield* clientOf({ context, person })).profiles.deleteMyLocation({
          params: { id },
        })
        return context
      }),
  })

await Effect.runPromise(
  describeFeature("./profile-locations.feature", ({ Background, Scenario }) => {
    Background({ layer: ProfileLocationsTestLayer, steps: () => runSteps(givenPeople()) })

    Scenario("Searching ranks places in the person's country first, without hiding the others", {
      layer: ProfileLocationsTestLayer,
      steps: () => runSteps(searchesPlaces(), placesFound(), searchesPlaces(), placesFound()),
    })

    Scenario("A town's name finds the municipality it's in", {
      layer: ProfileLocationsTestLayer,
      steps: () => runSteps(searchesPlaces(), placeFoundMatchedAs()),
    })

    Scenario("A device's position finds its municipality, and nothing is saved", {
      layer: ProfileLocationsTestLayer,
      steps: () =>
        runSteps(
          looksUpMunicipality(),
          placeFound(),
          And("{string:person} has no locations", hasNoLocationsStep),
          noPlaceArticles(),
          looksUpMunicipality(),
          noMunicipalityFound(),
        ),
    })

    Scenario(
      "Choosing a place creates articles for it and its ancestors once, attributed to no one",
      {
        layer: ProfileLocationsTestLayer,
        steps: () =>
          runSteps(
            Given("{string:person} has these locations:", hasTheseLocations),
            And("{string:person} has these locations:", hasTheseLocations),
            placeArticlesWithoutContributors(),
            placeIsInside(),
            placeIsInside(),
            placeIsInsideNothing(),
          ),
      },
    )

    Scenario("A place's page shows the places containing it and the places inside it", {
      layer: ProfileLocationsTestLayer,
      steps: () =>
        runSteps(
          Given("{string:person} has these locations:", hasTheseLocations),
          pageShowsAncestors(),
          pageShowsChild(),
          mapDrawsInside(),
          mapDrawsInsideNothing(),
        ),
    })

    Scenario("A place someone already wrote about isn't created again", {
      layer: ProfileLocationsTestLayer,
      steps: () =>
        runSteps(
          wrotePlaceArticle(),
          And("{string:person} has these locations:", hasTheseLocations),
          onlyPlaceArticleByOneContributor(),
        ),
    })

    Scenario("Entries go from where people are now to where they've been", {
      layer: ProfileLocationsTestLayer,
      steps: () =>
        runSteps(
          Given("{string:person} has these locations:", hasTheseLocations),
          Then(
            "{string:person}'s locations are {string:first}, {string:second} and {string:third}",
            locationsAreStep(["first", "second", "third"]),
          ),
        ),
    })

    Scenario("Cards show the latest location only while it's public", {
      layer: ProfileLocationsTestLayer,
      steps: () =>
        runSteps(
          Given("{string:person} has these locations:", hasTheseLocations),
          profileSearchShowsIn(),
          addsPrivately(),
          profileSearchShowsWithoutLocation(),
          And(
            "{string:person}'s locations are {string:first} and {string:second}",
            locationsAreStep(["first", "second"]),
          ),
        ),
    })

    Scenario("A location can't end before it starts", {
      layer: ProfileLocationsTestLayer,
      steps: () =>
        runSteps(
          addsWithDates(),
          refusedForDates(),
          And("{string:person} has no locations", hasNoLocationsStep),
        ),
    })

    Scenario("People remove locations from their timeline, and only their own", {
      layer: ProfileLocationsTestLayer,
      steps: () =>
        runSteps(
          Given("{string:person} has these locations:", hasTheseLocations),
          triesToRemoveOthers(),
          Then("{string:person}'s locations are {string:first}", locationsAreStep(["first"])),
          removesOwn(),
          Then("{string:person} has no locations", hasNoLocationsStep),
        ),
    })
  }).pipe(Effect.provide(NodeServices.layer)),
)
