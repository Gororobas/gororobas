import { Style } from "@pleat/core"
import type { ChildAttribute, Html, HtmlBuilder, TextareaAttribute } from "foldkit/html"

import { styledAttributes } from "../pleat-attributes"
import { textControlStyle } from "./view"

const textareaStyle = Style.make({ resize: "vertical", minBlockSize: "5rem" })

export interface AppTextareaConfig<Message> {
  /** The textarea's attributes, such as the ones `@foldkit/ui`'s Textarea gives `toView`. */
  readonly attributes: ReadonlyArray<TextareaAttribute<Message> | ChildAttribute>
  readonly styles?: ReadonlyArray<Style.Style>
}

/** A multi-line text control that grows vertically when dragged. */
export const view = <Message>(config: AppTextareaConfig<Message>, h: HtmlBuilder<Message>): Html =>
  h.textarea(
    styledAttributes(config.attributes, textControlStyle, textareaStyle, ...(config.styles ?? [])),
  )
