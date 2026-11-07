import "./ui/theme/base-styles"
import { Sheet } from "@pleat/core"
import { Effect, Option } from "effect"
import { Program, Runtime } from "foldkit"
import { type Url, fromString as urlFromString } from "foldkit/url"

import { ApplicationBlock, layer } from "./app/block"
import { Flags } from "./app/definition"
import { urlToLocatedRoute } from "./app/route"
import { DEFAULT_LANGUAGE, detectLanguage } from "./lib/language"
import { LanguagePreferenceStore } from "./lib/language-preference"
import { Translations } from "./lib/translations"
import { ApplicationLayer } from "./services"

Sheet.mount()

/**
 * The first render already speaks the person's language: its catalog loads before init, and a path
 * without a language is redirected by init to the detected one. Flags never fail: a catalog that
 * can't load leaves the app in the default language, with a notice saying so.
 */
const flags = Effect.gen(function* () {
  const maybeLanguageInPath = Option.flatMap(
    urlFromString(window.location.href),
    (url) => urlToLocatedRoute(url).maybeLanguage,
  )

  const language = yield* Option.match(maybeLanguageInPath, {
    onSome: Effect.succeed,
    onNone: () =>
      Effect.map(
        LanguagePreferenceStore.use((store) => store.read),
        (maybePreference) => detectLanguage(maybePreference, navigator.languages),
      ),
  })

  // The default language's catalog is bundled, so a failed load still boots, in that language.
  return yield* Translations.use((translations) => translations.load(language)).pipe(
    Effect.as(Flags.make({ language, maybeUnavailableLanguage: Option.none() })),
    Effect.orElseSucceed(() =>
      Flags.make({ language: DEFAULT_LANGUAGE, maybeUnavailableLanguage: Option.some(language) }),
    ),
  )
})

const program = Program.make({
  block: ApplicationBlock,
  layer,
  Flags,
  container: document.getElementById("root"),
  routing: {
    onUrlRequest: ApplicationBlock.Message.ClickedLink,
    // Login fragments contain bearer proofs; keep them out of the message history.
    onUrlChange: (url: Url) =>
      // oxlint-disable-next-line foldkit/no-child-message-construction-in-root -- The root's own routing Message, built here to drop the fragment before it is recorded.
      ApplicationBlock.Message.ChangedUrl({ url: { ...url, hash: Option.none() } }),
  },
  devTools: { dispatch: true },
})

Runtime.run(program.provide(ApplicationLayer), { flags })

// Development modules are intentionally never cached.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  Effect.runFork(
    Effect.tryPromise(() => navigator.serviceWorker.register("/service-worker.js")).pipe(
      Effect.catch(() => Effect.logWarning("Offline app shell could not be installed")),
    ),
  )
}
