import { Effect, Option, Schema } from 'effect'
import { Command, type Runtime, Update } from 'foldkit'
import type { Document, HtmlBuilder } from 'foldkit/html'
import { UrlRequest, load, pushUrl } from 'foldkit/navigation'
import { modifyFields } from 'foldkit/struct'
import { toString as urlToString } from 'foldkit/url'

import { brandPresetSource } from './brandPresets.ts'
import * as FoldkitUi from './demo/foldkitUi.ts'
import { type BrandPreset, Message, Model, type Preset } from './message.ts'
import { presetSource } from './presets.ts'
import { AppRoute, urlToAppRoute } from './route.ts'
import { algebraView } from './view/algebra.ts'
import { foldkitUiView } from './view/foldkitUi.ts'
import { generativeView } from './view/generative.ts'
import { guideView } from './view/guide.ts'
import { homeView } from './view/home.ts'
import { layoutView } from './view/layout.ts'
import { notFoundView } from './view/notFound.ts'
import { referenceView } from './view/reference.ts'
import { themingView } from './view/theming.ts'

export { Message, Model }

// INIT

const INITIAL_PRESET: Preset = 'Valid'
const INITIAL_BRAND_PRESET: BrandPreset = 'Valid'

export const init: Runtime.RoutingApplicationInit<Model, Message> = url => ({
  model: {
    route: urlToAppRoute(url),
    theme: 'System',
    isMenuOpen: false,
    playground: { tone: 'Primary', size: 'Medium', isPending: false },
    preset: Option.some(INITIAL_PRESET),
    specSource: presetSource(INITIAL_PRESET),
    theming: {
      scope: { mode: 'Light', brand: 'Harbor', density: 'Comfortable' },
      brandPreset: Option.some(INITIAL_BRAND_PRESET),
      brandSource: brandPresetSource(INITIAL_BRAND_PRESET),
    },
    foldkitUi: FoldkitUi.init(),
  },
})

// COMMAND

const NavigateInternal = Command.define('NavigateInternal', {
  args: { url: Schema.String },
  messages: [Message.CompletedNavigateInternal],
  execute: ({ url }) =>
    pushUrl(url).pipe(
      Effect.tap(() => Effect.sync(() => window.scrollTo({ top: 0 }))),
      Effect.as(Message.CompletedNavigateInternal()),
    ),
})

const LoadExternal = Command.define('LoadExternal', {
  args: { href: Schema.String },
  messages: [Message.CompletedLoadExternal],
  execute: ({ href }) => load(href).pipe(Effect.as(Message.CompletedLoadExternal())),
})

// UPDATE

type UpdateReturn = Update.Return<Model, Message>

const foldFoldkitUi = Update.foldChild({
  update: FoldkitUi.update,
  read: (model: Model) => Option.some(model.foldkitUi),
  write: (model, foldkitUi) => modifyFields(model, { foldkitUi: () => foldkitUi }),
  toParentMessage: message => Message.GotFoldkitUiMessage({ message }),
})

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ClickedLink: ({ request }) =>
      UrlRequest.match<UpdateReturn>(request, {
        Internal: ({ url }) => ({
          model,
          commands: [NavigateInternal({ url: urlToString(url) })],
        }),
        External: ({ href }) => ({ model, commands: [LoadExternal({ href })] }),
      }),
    UpdatedUrl: ({ url }) => ({
      model: modifyFields(model, {
        route: () => urlToAppRoute(url),
        isMenuOpen: () => false,
      }),
    }),
    CompletedNavigateInternal: () => ({ model }),
    CompletedLoadExternal: () => ({ model }),
    ClickedTheme: ({ theme }) => ({ model: modifyFields(model, { theme: () => theme }) }),
    ClickedMenuToggle: () => ({
      model: modifyFields(model, { isMenuOpen: isMenuOpen => !isMenuOpen }),
    }),
    SelectedTone: ({ tone }) => ({
      model: modifyFields(model, {
        playground: modifyFields({ tone: () => tone }),
      }),
    }),
    SelectedSize: ({ size }) => ({
      model: modifyFields(model, {
        playground: modifyFields({ size: () => size }),
      }),
    }),
    UpdatedPending: ({ isPending }) => ({
      model: modifyFields(model, {
        playground: modifyFields({ isPending: () => isPending }),
      }),
    }),
    UpdatedSpec: ({ source }) => ({
      model: modifyFields(model, {
        specSource: () => source,
        preset: () => Option.none(),
      }),
    }),
    ClickedPreset: ({ preset }) => ({
      model: modifyFields(model, {
        specSource: () => presetSource(preset),
        preset: () => Option.some(preset),
      }),
    }),
    SelectedMode: ({ mode }) => ({
      model: modifyFields(model, {
        theming: modifyFields({
          scope: modifyFields({ mode: () => mode }),
        }),
      }),
    }),
    SelectedBrand: ({ brand }) => ({
      model: modifyFields(model, {
        theming: modifyFields({
          scope: modifyFields({ brand: () => brand }),
        }),
      }),
    }),
    SelectedDensity: ({ density }) => ({
      model: modifyFields(model, {
        theming: modifyFields({
          scope: modifyFields({ density: () => density }),
        }),
      }),
    }),
    UpdatedBrandSource: ({ source }) => ({
      model: modifyFields(model, {
        theming: modifyFields({
          brandSource: () => source,
          brandPreset: () => Option.none(),
        }),
      }),
    }),
    ClickedBrandPreset: ({ preset }) => ({
      model: modifyFields(model, {
        theming: modifyFields({
          brandSource: () => brandPresetSource(preset),
          brandPreset: () => Option.some(preset),
        }),
      }),
    }),
    GotFoldkitUiMessage: ({ message }) => foldFoldkitUi(model, message),
  })

// VIEW

const TITLE_SUFFIX = 'Pleat'

const routeTitle = (route: AppRoute): string =>
  AppRoute.match(route, {
    Home: () => 'Pleat | Algebraic styles for Foldkit',
    Guide: () => `Guide | ${TITLE_SUFFIX}`,
    Algebra: () => `The algebra | ${TITLE_SUFFIX}`,
    Generative: () => `Generative interfaces | ${TITLE_SUFFIX}`,
    Theming: () => `Theming | ${TITLE_SUFFIX}`,
    FoldkitUi: () => `Foldkit UI | ${TITLE_SUFFIX}`,
    Reference: () => `Reference | ${TITLE_SUFFIX}`,
    NotFound: () => `Not found | ${TITLE_SUFFIX}`,
  })

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: routeTitle(model.route),
  body: layoutView(
    model,
    h,
    AppRoute.match(model.route, {
      Home: () => homeView(model, h),
      Guide: () => guideView(h),
      Algebra: () => algebraView(h),
      Generative: () => generativeView(model, h),
      Theming: () => themingView(model, h),
      FoldkitUi: () =>
        h.submodel({
          slotId: 'foldkit-ui',
          model: model.foldkitUi,
          view: foldkitUiView,
          toParentMessage: message => Message.GotFoldkitUiMessage({ message }),
        }),
      Reference: () => referenceView(h),
      NotFound: () => notFoundView(h),
    }),
  ),
})
