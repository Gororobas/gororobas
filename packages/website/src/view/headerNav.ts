import { Match, Schema } from 'effect'
import { Html } from 'foldkit/html'

import { Nav } from '@foldkit/ui'

import type { ApplicationViewBuilder } from '../composition'
import {
  type ApplicationRoute,
  blogRouter,
  coreArchitectureRouter,
  isBlogRoute,
  isDocsSectionRoute,
} from '../route'

const HeaderSection = Schema.Literals(['Docs', 'Blog'])

const headerSections: ReadonlyArray<typeof HeaderSection.Type> =
  HeaderSection.literals

const isSectionCurrent = (
  route: typeof ApplicationRoute.Type,
  section: typeof HeaderSection.Type,
): boolean =>
  Match.value(section).pipe(
    Match.when('Docs', () => isDocsSectionRoute(route)),
    Match.when('Blog', () => isBlogRoute(route)),
    Match.exhaustive,
  )

const sectionToHref = (section: typeof HeaderSection.Type): string =>
  Match.value(section).pipe(
    Match.when('Docs', () => coreArchitectureRouter()),
    Match.when('Blog', () => blogRouter()),
    Match.exhaustive,
  )

const linkClassName =
  'text-sm font-normal text-gray-700 dark:text-gray-300 transition hover:text-gray-900 dark:hover:text-gray-200 data-[current]:font-medium data-[current]:text-accent-700 data-[current]:dark:text-accent-400 data-[current]:hover:text-accent-700 data-[current]:dark:hover:text-accent-400'

export const view = (
  route: typeof ApplicationRoute.Type,
  className: string,
  h: ApplicationViewBuilder,
): Html =>
  Nav.view<typeof HeaderSection.Type>({
    items: headerSections,
    ariaLabel: 'Primary',
    toHref: sectionToHref,
    isItemCurrent: section => isSectionCurrent(route, section),
    toView: ({ nav, items }) =>
      h.nav(
        [...nav, h.Class(className)],
        items.map(item =>
          h.a([...item.link, h.Class(linkClassName)], [item.value]),
        ),
      ),
  })
