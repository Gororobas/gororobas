import { Style } from "@pleat/core"
import { Option } from "effect"
import type { Html, HtmlBuilder } from "foldkit/html"

import { Chip } from "../chip"
import { styledAttributes } from "../pleat-attributes"
import { cardBleedStyle } from "../section-card"
import { space } from "../theme"

const chipRowStyle = Style.make({
  display: "flex",
  gap: space[2],
  overflowX: "auto",
  scrollbarWidth: "none",
  paddingBlock: space[1],
})

export type FilterChipsConfig<Value, Message> = Readonly<{
  label: string
  /** The chip that clears the filter, such as "All". */
  allLabel: string
  options: ReadonlyArray<readonly [Value, string]>
  selected: Option.Option<Value>
  toMessage: (value: Option.Option<Value>) => Message
}>

/** Chips that narrow a list in place: "All" first, then one per value. */
export const view = <Value, Message>(
  config: FilterChipsConfig<Value, Message>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    styledAttributes([h.Role("group"), h.AriaLabel(config.label)], chipRowStyle, cardBleedStyle),
    [
      Chip.view(
        {
          label: config.allLabel,
          appearance: Option.isNone(config.selected) ? "selectedOption" : "option",
          isPressed: Option.isNone(config.selected),
          onClick: config.toMessage(Option.none()),
        },
        h,
      ),
      ...config.options.map(([value, label]) =>
        Chip.view(
          {
            label,
            appearance: Option.contains(config.selected, value) ? "selectedOption" : "option",
            isPressed: Option.contains(config.selected, value),
            onClick: config.toMessage(Option.some(value)),
          },
          h,
        ),
      ),
    ],
  )
