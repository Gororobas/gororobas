import { Style } from "@pleat/core"
import { type Html, type HtmlBuilder } from "foldkit/html"

import { styledAttributes } from "../pleat-attributes"
import { space } from "../theme"

export interface ViewConfig {
  readonly ariaLabel: string
  readonly heading: ReadonlyArray<Html>
  readonly content: ReadonlyArray<Html>
}

const sectionStyle = Style.make({ display: "grid", rowGap: space[3] })
const headingRowStyle = Style.make({ display: "flex", alignItems: "center", gap: space[2] })

export const view = <Message>(
  { ariaLabel, heading, content }: ViewConfig,
  h: HtmlBuilder<Message>,
): Html =>
  h.section(styledAttributes([h.AriaLabel(ariaLabel)], sectionStyle), [
    h.div(styledAttributes([], headingRowStyle), heading),
    ...content,
  ])
