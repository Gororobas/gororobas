import { Option, Record, Schema } from 'effect'

export const SIDEBAR_STORAGE_KEY = 'foldkit-sidebar-state'

export const SidebarState = Schema.Struct({
  open: Schema.Record(Schema.String, Schema.Boolean),
})

export const SidebarStateJsonString = Schema.fromJsonString(SidebarState)

export const GroupKey = Schema.Literals([
  'blog',
  'introduction',
  'coreConcepts',
  'comparisons',
  'faq',
  'testing',
  'bestPractices',
  'patterns',
  'tooling',
  'foldkitUi',
  'ai',
  'examples',
  'apiReference',
])

export const SidebarGroups = Schema.Record(GroupKey, Schema.Boolean)

const isGroupOpenOnBoot = (
  maybeSidebarState: Option.Option<typeof SidebarState.Type>,
  maybeActiveSectionKey: Option.Option<typeof GroupKey.Type>,
  key: typeof GroupKey.Type,
): boolean => {
  const isActiveSection = Option.exists(
    maybeActiveSectionKey,
    activeSectionKey => activeSectionKey === key,
  )
  if (isActiveSection) {
    return true
  }

  return Option.match(maybeSidebarState, {
    onNone: () => false,
    onSome: ({ open }) => open[key] ?? false,
  })
}

export const initialSidebarGroups = (
  maybeSidebarState: Option.Option<typeof SidebarState.Type>,
  maybeActiveSectionKey: Option.Option<typeof GroupKey.Type>,
): typeof SidebarGroups.Type => {
  const sidebarGroups: globalThis.Record<typeof GroupKey.Type, boolean> =
    Record.fromIterableWith(GroupKey.literals, key => [
      key,
      isGroupOpenOnBoot(maybeSidebarState, maybeActiveSectionKey, key),
    ])

  return sidebarGroups
}
