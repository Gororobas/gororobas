import type { HtmlBuilder } from 'foldkit/html'

export const sectionHeading = <ParentMessage>(
  title: string,
  h: HtmlBuilder<ParentMessage>,
) => h.h2([h.Class('text-lg font-semibold')], [title])
