import type { Html, HtmlBuilder } from 'foldkit/html'

import { Style } from '@pleat/core'
import { css } from '@pleat/foldkit'

import { codeBlock } from '../code.ts'
import * as Design from '../design.ts'
import type { Message } from '../message.ts'
import recipeSource from '../snippet/recipe.ts?raw'
import serverSource from '../snippet/server.ts?raw'
import stylesSource from '../snippet/styles.ts?raw'
import tokensSource from '../snippet/tokens.ts?raw'
import varSource from '../snippet/var.ts?raw'
import viewSource from '../snippet/view.ts?raw'
import { bullets, onThisPage, paragraph, rich, section } from './prose.ts'

const { space } = Design.tokens

const article = Style.make({
  display: 'flex',
  flexDirection: 'column',
  gap: space[8],
  minWidth: 0,
})

const intro = Style.merge(
  Design.prose,
  Style.make({ gap: space[4], paddingBlockEnd: space[6] }),
)

export const pageIntro = <Message>(
  h: HtmlBuilder<Message>,
  eyebrow: string,
  title: string,
  lede: string,
): Html =>
  h.header(
    [...css(intro)],
    [
      h.span([...css(Design.eyebrow)], [eyebrow]),
      h.h1([...css(Design.display)], [title]),
      h.p([...css(Design.lede)], rich(h, lede)),
    ],
  )

export const articleStyle = article

const CONTENTS: ReadonlyArray<readonly [id: string, title: string]> = [
  ['install', 'Install'],
  ['tokens', 'Tokens and themes'],
  ['styles', 'Styles'],
  ['views', 'Use styles in views'],
  ['recipes', 'Variants with recipes'],
  ['variables', 'Continuous values'],
  ['server', 'Server rendering and static pages'],
  ['tailwind', 'Alongside Tailwind'],
]

export const guideView = (h: HtmlBuilder<Message>): Html =>
  h.article(
    [...css(article)],
    [
      onThisPage(h, CONTENTS),
      pageIntro(
        h,
        'Guide',
        'Style a Foldkit app',
        'Install two packages, define tokens, write styles, and use them in views. Server rendering and static generation need one line in the server entry.',
      ),
      section(h, 'install', 'Install', [
        codeBlock(h, 'pnpm add @pleat/core @pleat/foldkit'),
        paragraph(
          h,
          '`@pleat/core` has the algebra and depends only on Effect. `@pleat/foldkit` connects it to Foldkit views and to Foldkit’s server rendering. Both expect Effect v4; there is no build plugin to configure.',
        ),
      ]),
      section(h, 'tokens', 'Tokens and themes', [
        paragraph(
          h,
          'Tokens are named custom properties with a kind (`color`, `length`, `fontFamily`…). A theme gives every token a value, checked against its kind. Applying a theme to a selector sets the properties there, so switching themes is an attribute in your view and costs no re-render of styles.',
        ),
        codeBlock(h, tokensSource, 'tokens.ts'),
        paragraph(
          h,
          'Put the theme choice in your Model and render it as `data-theme` on your root element. This site does exactly that with the switch in the header.',
        ),
      ]),
      section(h, 'styles', 'Styles', [
        paragraph(
          h,
          'A style is a value. `Style.make` takes declarations, `Style.when` adds declarations under a condition, and `Style.merge` applies one style after another. Define styles where the module loads, not inside views: that is when their rules are created.',
        ),
        codeBlock(h, stylesSource, 'styles.ts'),
        bullets(h, [
          'Conditions include `When.hover`, `When.focusVisible`, `When.active`, `When.dark`, `When.minWidth(...)`, `When.container(...)`, and the states `@foldkit/ui` sets: `When.open`, `When.selected`, `When.disabled`, `When.highlighted`, `When.checked`, `When.invalid`.',
          'When two conditions hold at once and set the same property, the stronger one wins: environment < ancestors < element state < interaction < disabled and invalid. `When.all(a, b)` outranks both `a` and `b`. The [algebra page](/algebra#conditions) has the full order.',
          'Rules live in the `pleat` cascade layer, so anything you write outside a layer, Tailwind included, wins over Pleat.',
        ]),
      ]),
      section(h, 'views', 'Use styles in views', [
        paragraph(
          h,
          'Spread `css(...)` into an element’s attributes. It merges every style you pass into one `Class` attribute and every variable binding into one `Style` attribute. Pass everything to one call: Foldkit keeps only the last `Class` an element is given.',
        ),
        codeBlock(h, viewSource, 'save.ts'),
        paragraph(
          h,
          '`css` caches its result per style, so a view that renders the same styles again allocates nothing for them. The first time a style is used in a browser, its rules are inserted at their sorted position in a constructed stylesheet.',
        ),
      ]),
      section(h, 'recipes', 'Variants with recipes', [
        paragraph(
          h,
          'A recipe is a finite family of styles. Its variant props are typed by an Effect Schema, so they read like the rest of your Model: capitalized literals, booleans named `is…`. Options named `true` and `false` make a boolean dimension.',
        ),
        codeBlock(h, recipeSource, 'button.ts'),
        paragraph(
          h,
          'Every option’s style exists before the recipe is first called. Calling it picks one combination and memoizes the merged style, so equal props return the same object. `Recipe.combinations` lists them all, for galleries and tests.',
        ),
      ]),
      section(h, 'variables', 'Continuous values', [
        paragraph(
          h,
          'Values that change continuously with the Model, like a percentage or a drag offset, are not variants. Give them a typed `Var`: rules refer to it statically, and each render binds a value in one inline custom property.',
        ),
        codeBlock(h, varSource, 'progress.ts'),
      ]),
      section(h, 'server', 'Server rendering and static pages', [
        paragraph(
          h,
          'Export Pleat’s `renderDocument` from your server entry in place of Foldkit’s. Each page then carries a `<style data-pleat>` with the rules it uses, and the browser adds others as views use them. Class names are hashes of the declarations, so the server and the client compute the same ones and hydration matches.',
        ),
        codeBlock(h, serverSource, 'entry.server.ts'),
        paragraph(
          h,
          'For a static site, nothing else changes: Foldkit’s prerender calls the same `renderDocument` for every path. This site is built that way and deployed to Cloudflare with Alchemy’s `Cloudflare.Website.StaticSite`.',
        ),
      ]),
      section(h, 'tailwind', 'Alongside Tailwind', [
        paragraph(
          h,
          'Foldkit’s starter uses Tailwind, and you can keep it while you move over. Pass Tailwind classes through `className(...)` in the same `css()` call so the element still gets one `Class` attribute. Unlayered Tailwind utilities win over Pleat’s layered rules, which makes them a safe escape hatch.',
        ),
        codeBlock(h, "h.div([...css(card, className('prose lg:prose-lg'))], children)"),
      ]),
    ],
  )
