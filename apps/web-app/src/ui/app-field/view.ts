import { Style } from "@pleat/core"
import { Array as EffectArray, Option } from "effect"
import type { Attribute, ChildAttribute, Html, HtmlBuilder } from "foldkit/html"

import { AppText } from "../app-text"
import { styledAttributes } from "../pleat-attributes"
import { space } from "../theme"

const fieldStyle = Style.make({ display: "grid", rowGap: space[2] })

type Attributes<Message> = ReadonlyArray<Attribute<Message> | ChildAttribute>

export interface AppFieldConfig<Message> {
  readonly label: string
  /** The label's attributes, such as the ones `@foldkit/ui`'s Input gives `toView`. */
  readonly labelAttributes: Attributes<Message>
  /** The control: an AppInput, an AppTextarea, or any other form control. */
  readonly control: Html
  readonly description?: string
  /** The description's attributes. When there is no description, they go on the error, so
   *  the control's `aria-describedby` points at it. */
  readonly descriptionAttributes?: Attributes<Message>
  readonly error?: Option.Option<string>
  readonly styles?: ReadonlyArray<Style.Style>
}

/** A labeled form control with an optional hint and error. */
export const view = <Message>(config: AppFieldConfig<Message>, h: HtmlBuilder<Message>): Html => {
  const descriptionAttributes = config.descriptionAttributes ?? []

  return h.div(styledAttributes([], fieldStyle, ...(config.styles ?? [])), [
    AppText.view(
      {
        element: "label",
        appearance: "footnote",
        weight: "medium",
        attributes: config.labelAttributes,
        children: [config.label],
      },
      h,
    ),
    config.control,
    ...(config.description === undefined
      ? []
      : [
          AppText.view(
            {
              element: "p",
              appearance: "footnote",
              isMuted: true,
              attributes: descriptionAttributes,
              children: [config.description],
            },
            h,
          ),
        ]),
    ...EffectArray.fromOption(
      Option.map(config.error ?? Option.none(), (error) =>
        AppText.view(
          {
            element: "p",
            appearance: "footnote",
            tone: "destructive",
            attributes: [
              ...(config.description === undefined ? descriptionAttributes : []),
              h.Role("alert"),
            ],
            children: [error],
          },
          h,
        ),
      ),
    ),
  ])
}
