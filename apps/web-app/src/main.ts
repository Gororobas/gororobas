import { Effect, Layer, Option, Predicate, Schema } from "effect"
import { Command, Runtime, Subscription, Update } from "foldkit"
import { Document, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { UrlRequest, load, pushUrl } from "foldkit/navigation"
import { Url, toString as urlToString } from "foldkit/url"

import * as ApiClient from "./api-client"
import * as Authentication from "./authentication"
import * as ProfileSearch from "./profile-search"
import * as PublicationSearch from "./publication-search"
import * as Routes from "./route"
import * as WikiSearch from "./wiki-search"

export const Model = Schema.Struct({
  route: Routes.AppRoute,
  authentication: Authentication.Model,
  wikiSearch: WikiSearch.Model,
  profileSearch: ProfileSearch.Model,
  publicationSearch: PublicationSearch.Model,
})

export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
  CompletedNavigation: {},
  GotAuthenticationMessage: { message: Authentication.Message },
  GotWikiSearchMessage: { message: WikiSearch.Message },
  GotProfileSearchMessage: { message: ProfileSearch.Message },
  GotPublicationSearchMessage: { message: PublicationSearch.Message },
})

export type Message = typeof Message.Type

const Navigate = Command.define("Navigate", {
  args: { url: Schema.String, external: Schema.Boolean },
  messages: [Message.CompletedNavigation],
  execute: ({ url, external }) =>
    (external ? load(url) : pushUrl(url)).pipe(Effect.as(Message.CompletedNavigation())),
})

const foldAuthentication = Update.foldChild({
  update: Authentication.update,
  read: (model: Model) => Option.some(model.authentication),
  write: (model, authentication) => ({ ...model, authentication }),
  toParentMessage: (message) => Message.GotAuthenticationMessage({ message }),
})

const foldWikiSearch = Update.foldChild({
  update: WikiSearch.update,
  read: (model: Model) => Option.some(model.wikiSearch),
  write: (model, wikiSearch) => ({ ...model, wikiSearch }),
  toParentMessage: (message) => Message.GotWikiSearchMessage({ message }),
})

const foldProfileSearch = Update.foldChild({
  update: ProfileSearch.update,
  read: (model: Model) => Option.some(model.profileSearch),
  write: (model, profileSearch) => ({ ...model, profileSearch }),
  toParentMessage: (message) => Message.GotProfileSearchMessage({ message }),
})

const foldPublicationSearch = Update.foldChild({
  update: PublicationSearch.update,
  read: (model: Model) => Option.some(model.publicationSearch),
  write: (model, publicationSearch) => ({ ...model, publicationSearch }),
  toParentMessage: (message) => Message.GotPublicationSearchMessage({ message }),
})

export const update = (
  model: Model,
  message: Message,
): Update.Return<Model, Message, Layer.Success<typeof resources>> =>
  Message.match(message, {
    ClickedLink: ({ request }) =>
      UrlRequest.match(request, {
        Internal: ({ url }) => ({
          model,
          commands: [Navigate({ url: urlToString(url), external: false })],
        }),
        External: ({ href }) => ({ model, commands: [Navigate({ url: href, external: true })] }),
      }),
    ChangedUrl: ({ url }) => {
      const route = Routes.urlToAppRoute(url)

      return {
        model: { ...model, route },
        commands: Predicate.isTagged(route, "Login")
          ? [
              Command.mapMessage(Authentication.RestoreSession(), (message) =>
                Message.GotAuthenticationMessage({ message }),
              ),
            ]
          : [],
      }
    },
    CompletedNavigation: () => ({ model }),
    GotAuthenticationMessage: ({ message }) => foldAuthentication(model, message),
    GotWikiSearchMessage: ({ message }) => foldWikiSearch(model, message),
    GotProfileSearchMessage: ({ message }) => foldProfileSearch(model, message),
    GotPublicationSearchMessage: ({ message }) => foldPublicationSearch(model, message),
  })

export const init: Runtime.RoutingApplicationInit<
  Model,
  Message,
  void,
  Layer.Success<typeof resources>
> = (url) => ({
  model: {
    route: Routes.urlToAppRoute(url),
    authentication: Authentication.init,
    wikiSearch: WikiSearch.init().model,
    profileSearch: ProfileSearch.init().model,
    publicationSearch: PublicationSearch.init().model,
  },
  commands: [
    Command.mapMessage(Authentication.RestoreSession(), (message) =>
      Message.GotAuthenticationMessage({ message }),
    ),
  ],
})

export const resources = Layer.mergeAll(ApiClient.resources, Authentication.resources)

export const subscriptions = Subscription.aggregate(
  Subscription.lift(WikiSearch.subscriptions)<Model, Message>({
    read: (model) => Option.some(model.wikiSearch),
    when: (model) => model.route._tag === "WikiSearch",
    toParentMessage: (message) => Message.GotWikiSearchMessage({ message }),
  }),
  Subscription.lift(ProfileSearch.subscriptions)<Model, Message>({
    read: (model) => Option.some(model.profileSearch),
    when: (model) => model.route._tag === "ProfileSearch",
    toParentMessage: (message) => Message.GotProfileSearchMessage({ message }),
  }),
  Subscription.lift(PublicationSearch.subscriptions)<Model, Message>({
    read: (model) => Option.some(model.publicationSearch),
    when: (model) => model.route._tag === "PublicationSearch",
    toParentMessage: (message) => Message.GotPublicationSearchMessage({ message }),
  }),
)

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: Predicate.isTagged(model.route, "Login") ? "Sign in · Gororobas" : "Gororobas",
  body: h.div(
    [],
    [
      h.nav(
        [],
        [
          h.a([h.Href(Routes.wikiSearchRouter())], ["Wiki articles"]),
          " · ",
          h.a([h.Href(Routes.profileSearchRouter())], ["Profiles"]),
          " · ",
          h.a([h.Href(Routes.publicationSearchRouter())], ["Publications"]),
          " · ",
          h.a(
            [h.Href(Routes.loginRouter())],
            [Authentication.isSignedIn(model.authentication) ? "Account" : "Log in"],
          ),
        ],
      ),
      Routes.AppRoute.match(model.route, {
        WikiSearch: () =>
          h.submodel({
            slotId: "wiki-search",
            model: model.wikiSearch,
            view: WikiSearch.submodelView,
            toParentMessage: (message) => Message.GotWikiSearchMessage({ message }),
          }),
        ProfileSearch: () =>
          h.submodel({
            slotId: "profile-search",
            model: model.profileSearch,
            view: ProfileSearch.submodelView,
            toParentMessage: (message) => Message.GotProfileSearchMessage({ message }),
          }),
        PublicationSearch: () =>
          h.submodel({
            slotId: "publication-search",
            model: model.publicationSearch,
            view: PublicationSearch.submodelView,
            toParentMessage: (message) => Message.GotPublicationSearchMessage({ message }),
          }),
        Login: () =>
          h.submodel({
            slotId: "authentication",
            model: model.authentication,
            view: Authentication.view,
            toParentMessage: (message) => Message.GotAuthenticationMessage({ message }),
          }),
        NotFound: () => h.main([], [h.h1([], ["Page not found"])]),
      }),
    ],
  ),
})
