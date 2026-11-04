import { InformationVisibility } from "@gororobas/domain/common/enums"
import type { WhosOnFirstId } from "@gororobas/domain/common/external-identifiers"
import {
  type GazetteerPlace,
  gazetteerPlaceLabel,
  type GazetteerPlaceSummary,
} from "@gororobas/domain/places/domain"
import { type ElevationInMeters, ProfileLocationData } from "@gororobas/domain/profiles/locations"
import { Style, When } from "@pleat/core"
import { Array as EffectArray, Option } from "effect"
import * as Length from "effect-units/Length"
import { AsyncData } from "foldkit"
import { childAttributes, type Html, type MessageOf } from "foldkit/html"

import { loginRouter, wikiArticleUrl } from "../../app/route"
import { formatPartialDate } from "../../lib/partial-dates"
import { informationVisibilityLabels } from "../../lib/vocabulary"
import { AppButton } from "../../ui/app-button"
import { AppField } from "../../ui/app-field"
import { AppInput } from "../../ui/app-input"
import { textControlStyle } from "../../ui/app-input/view"
import { AppText } from "../../ui/app-text"
import { chipStyle } from "../../ui/chip/view"
import * as Icons from "../../ui/icons"
import type { IconConfig } from "../../ui/icons"
import * as PlaceOutline from "../../ui/place-outline/view"
import { styledAttributes, styledClassName } from "../../ui/pleat-attributes"
import { SectionCard } from "../../ui/section-card"
import { focusRingDeclarations } from "../../ui/styles/focus-ring"
import {
  borderWidth,
  breakpoint,
  duration,
  fontSize,
  layer,
  measure,
  radius,
  space,
  toneColors,
  tones,
} from "../../ui/theme"
import { visuallyHiddenStyle } from "../../ui/visually-hidden"
import {
  CONFIRM_DELETE_BUTTON_ID,
  entryMenuButtonId,
  FREE_TEXT_INPUT_ID,
  ProfileLocationsEditorComposition,
  type ProfileLocationsEditorViewBuilder,
  PlaceComboboxBinding,
  placeFieldId,
} from "./composition"
import { DateField, Message } from "./message"
import type { Form, Model } from "./model"

type ViewMessage = MessageOf<ProfileLocationsEditorViewBuilder>

const LocationPlace = ProfileLocationData.fields.place

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const

const visibilityIcons: Readonly<Record<InformationVisibility, (config?: IconConfig) => Html>> = {
  PUBLIC: Icons.globe,
  COMMUNITY: Icons.usersGroup,
  PRIVATE: Icons.lock,
}

const visibilityDescriptions: Readonly<Record<InformationVisibility, string>> = {
  PUBLIC: "Qualquer pessoa. Se for o mais recente, aparece no seu perfil.",
  COMMUNITY: "Só pessoas da comunidade Gororobas.",
  PRIVATE: "Só você. Ajuda a Gororobas a te mostrar o que é relevante.",
}

const deviceLookupMessages: Readonly<Record<Form["deviceLookup"], string | null>> = {
  Idle: null,
  Locating: "Procurando o município onde você está…",
  Unavailable:
    "Não conseguimos a localização do aparelho. Confira se o navegador tem permissão, ou busque o lugar pelo nome.",
  OutsideGazetteer:
    "Ainda não temos o mapa dessa região. Busque o lugar pelo nome ou descreva onde você está.",
}

// LAYOUT

const pageStyle = Style.make({
  marginInline: "auto",
  inlineSize: "100%",
  maxInlineSize: measure.prose,
  paddingBlock: space[8],
  paddingInline: space[4],
})

const stackStyle = Style.make({ display: "grid", rowGap: space[3] })
const tightStackStyle = Style.make({ display: "grid", rowGap: space[1] })

const rowStyle = Style.make({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: space[2],
})

/** Where entries, the new-place form and the empty state sit: raised from the section. */
const surfaceStyle = Style.make({
  borderRadius: radius.lg,
  borderStyle: "solid",
  borderWidth: borderWidth.hairline,
  borderColor: tones.neutral.shade[200],
  backgroundColor: tones.neutral.shade[100],
})

const status = (text: string, h: ProfileLocationsEditorViewBuilder) =>
  AppText.view(
    {
      element: "p",
      appearance: "footnote",
      isMuted: true,
      attributes: [h.Role("status"), h.AriaLive("polite")],
      children: [text],
    },
    h,
  )

const alert = (text: string, h: ProfileLocationsEditorViewBuilder) =>
  AppText.view(
    {
      element: "p",
      appearance: "footnote",
      tone: "destructive",
      attributes: [h.Role("alert")],
      children: [text],
    },
    h,
  )

const muted = (text: string, h: ProfileLocationsEditorViewBuilder) =>
  AppText.view({ element: "p", appearance: "footnote", isMuted: true, children: [text] }, h)

const period = (location: ProfileLocationData): string | null => {
  const start = location.startDate === null ? null : formatPartialDate(location.startDate)
  const end = location.endDate === null ? null : formatPartialDate(location.endDate)
  if (start !== null && end !== null) return `${start} – ${end}`
  if (start !== null) return `Desde ${start}`
  if (end !== null) return `Até ${end}`
  return null
}

const formatElevation = (elevation: ElevationInMeters) =>
  `${Length.inMeters(elevation).toLocaleString("pt-BR")} m`

// TIMELINE

const RAIL_WIDTH = space[6]

const encodeSvg = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`

/** One period of the dashed trail; it repeats down the rail, so its ends meet in the middle. */
const TRAIL_MASK = encodeSvg(
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="48" viewBox="0 0 16 48"><path d="M8 0C14 8 14 16 8 24S2 40 8 48" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-dasharray="4 5"/></svg>`,
)

const trailColor = tones.primary.shade[700]

// NOTE: The trail is drawn by the list itself, behind the markers, so it runs unbroken whatever
// each entry's height. Its arrow points at the present: entries go from oldest to latest.
const timelineStyle = Style.make({
  position: "relative",
  display: "grid",
  rowGap: space[4],
  margin: 0,
  padding: 0,
  paddingBlockEnd: space[5],
  listStyle: "none",
}).pipe(
  Style.when(When.before, {
    content: '""',
    position: "absolute",
    insetBlockStart: space[8],
    insetBlockEnd: space[2],
    insetInlineStart: 0,
    inlineSize: RAIL_WIDTH,
    backgroundColor: trailColor,
    maskImage: TRAIL_MASK,
    maskRepeat: "repeat-y",
    maskPosition: "center top",
    maskSize: `${space[4]} ${space[10]}`,
  }),
  Style.when(When.after, {
    content: '""',
    position: "absolute",
    insetBlockEnd: space[2],
    insetInlineStart: `calc((${RAIL_WIDTH} - ${space[3]}) / 2)`,
    inlineSize: space[3],
    blockSize: space[3],
    borderInlineEnd: `${borderWidth.strong} solid ${trailColor}`,
    borderBlockEnd: `${borderWidth.strong} solid ${trailColor}`,
    transform: "rotate(45deg)",
  }),
)

const stopStyle = Style.make({
  display: "grid",
  gridTemplateColumns: `${RAIL_WIDTH} minmax(0, 1fr)`,
  columnGap: space[3],
})

const markerStyle = Style.make({
  position: "relative",
  alignSelf: "center",
  justifySelf: "center",
  inlineSize: space[4],
  blockSize: space[4],
  borderRadius: radius.full,
  border: `${borderWidth.strong} solid ${trailColor}`,
  // Hides the trail behind the ring.
  backgroundColor: toneColors.backgroundCard,
})

const currentMarkerStyle = Style.make({ backgroundColor: trailColor })

// NOTE: Small screens give the details the card's full width, under the outline and actions:
// chips don't wrap their text, and beside the outline they'd overflow.
const entryStyle = Style.make({
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr)",
  gridTemplateAreas: '"thumbnail actions" "body body"',
  alignItems: "start",
  columnGap: space[3],
  rowGap: space[3],
  padding: space[3],
  transitionProperty: "opacity",
  transitionDuration: duration.moderate,
}).pipe(
  Style.when(breakpoint.sm, {
    gridTemplateColumns: "auto minmax(0, 1fr) auto",
    gridTemplateAreas: '"thumbnail body actions"',
    columnGap: space[4],
  }),
)

const deletingEntryStyle = Style.make({ opacity: 0.55 })

const thumbnailSize = Style.make({ inlineSize: space[12] }).pipe(
  Style.when(breakpoint.sm, { inlineSize: `calc(${space[12]} + ${space[6]})` }),
)

const placeholderThumbnailStyle = Style.make({
  display: "grid",
  placeItems: "center",
  aspectRatio: "1",
  borderRadius: radius.md,
  backgroundColor: tones.neutral.shade[200],
  color: tones.primary.ramp[500],
})

const entryBodyStyle = Style.make({
  gridArea: "body",
  display: "grid",
  rowGap: space[2],
  alignContent: "center",
  minBlockSize: "100%",
})

const entryActionsStyle = Style.make({
  gridArea: "actions",
  justifySelf: "end",
  display: "flex",
  gap: space[2],
})

const entryThumbnailStyle = Style.make({ gridArea: "thumbnail" })

const iconButtonStyle = Style.make({
  backgroundColor: tones.neutral.shade[200],
  borderColor: tones.neutral.shade[300],
})

const confirmationStyle = Style.make({
  gridColumn: "1 / -1",
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space[3],
  paddingBlockStart: space[3],
  borderBlockStart: `${borderWidth.hairline} solid ${tones.neutral.shade[200]}`,
})

const metaChipStyle = Style.make({ gap: space[2] })

const metaChip = (
  {
    icon,
    label,
    background,
  }: Readonly<{
    icon: (config?: IconConfig) => Html
    label: string
    background: "neutral" | "primary" | "accent"
  }>,
  h: ProfileLocationsEditorViewBuilder,
) =>
  h.span(
    styledAttributes(
      [],
      chipStyle({ appearance: "tag" }),
      metaChipStyle,
      // Ramp steps, so the gold and sage chips keep dark text in both color modes.
      background === "neutral"
        ? Style.make({ backgroundColor: tones.neutral.shade[200], color: toneColors.foreground })
        : Style.make({
            backgroundColor: tones[background].ramp[background === "primary" ? 500 : 400],
            color: tones.neutral.ramp[950],
          }),
    ),
    [icon({ size: "sm" }), label],
  )

const visibilityBackground: Readonly<
  Record<InformationVisibility, "neutral" | "primary" | "accent">
> = { PUBLIC: "primary", COMMUNITY: "accent", PRIVATE: "neutral" }

// NOTE: A native popover opens and closes without a model for every entry, and closes on outside
// clicks and Escape. Where anchor positioning is supported it opens under its button; elsewhere it
// keeps the browser's centered placement.
const menuStyle = Style.make({
  minInlineSize: "12rem",
  padding: space[1],
  border: `${borderWidth.hairline} solid ${tones.neutral.shade[300]}`,
  borderRadius: radius.md,
  backgroundColor: toneColors.backgroundCard,
  color: toneColors.foreground,
}).pipe(
  Style.when(When.supports("(anchor-name: --menu)"), {
    inset: "auto",
    marginBlock: space[1],
    positionArea: "block-end span-inline-start",
    positionTryFallbacks: "flip-block, flip-inline",
  }),
)

const menuItemStyle = Style.make({
  display: "flex",
  alignItems: "center",
  gap: space[2],
  inlineSize: "100%",
  paddingBlock: space[2],
  paddingInline: space[3],
  border: 0,
  borderRadius: radius.sm,
  background: "none",
  color: "inherit",
  font: "inherit",
  fontSize: fontSize.footnote,
  textAlign: "start",
  textDecoration: "none",
  cursor: "pointer",
  outline: "none",
}).pipe(
  Style.when(When.hover, { backgroundColor: tones.neutral.shade[100] }),
  Style.when(When.focusVisible, { backgroundColor: tones.neutral.shade[100] }),
)

const destructiveMenuItemStyle = Style.make({ color: tones.destructive.emphasis })

const entryMenu = (
  {
    location,
    title,
  }: Readonly<{
    location: ProfileLocationData
    title: string
  }>,
  h: ProfileLocationsEditorViewBuilder,
): ReadonlyArray<Html> => {
  const id = `profile-locations-editor-menu-${location.id}`
  const anchor = `--${id}`

  return [
    AppButton.view(
      {
        mode: "outline",
        size: "sm",
        ariaLabel: `Mais ações para ${title}`,
        styles: [iconButtonStyle, Style.make({ anchorName: anchor })],
        attributes: [h.Id(entryMenuButtonId(location.id)), h.Attribute("popovertarget", id)],
        children: [Icons.dotsVertical({ size: "sm", styles: [Style.make({ rotate: "90deg" })] })],
      },
      h,
    ),
    h.div(
      styledAttributes(
        [h.Id(id), h.Attribute("popover", "auto")],
        menuStyle,
        Style.make({ positionAnchor: anchor }),
      ),
      [
        ...(LocationPlace.guards.KnownPlace(location.place)
          ? [
              h.a(
                styledAttributes(
                  [h.Href(wikiArticleUrl({ kind: "PLACE", handle: location.place.placeHandle }))],
                  menuItemStyle,
                ),
                [Icons.mapPoint({ size: "sm" }), "Ver página do lugar"],
              ),
            ]
          : []),
        h.button(
          styledAttributes(
            [
              h.Type("button"),
              // Closes the menu as the confirmation takes its place.
              h.Attribute("popovertarget", id),
              h.Attribute("popovertargetaction", "hide"),
              h.OnClick(Message.ClickedDeleteLocation({ id: location.id })),
            ],
            menuItemStyle,
            destructiveMenuItemStyle,
          ),
          [Icons.trash({ size: "sm" }), "Remover do itinerário"],
        ),
      ],
    ),
  ]
}

const thumbnail = (
  place: ProfileLocationData["place"],
  h: ProfileLocationsEditorViewBuilder,
): Html =>
  h.div(
    styledAttributes([], thumbnailSize, entryThumbnailStyle),
    LocationPlace.guards.KnownPlace(place) && place.gazetteerPlace !== null
      ? [
          PlaceOutline.view(
            {
              geometry: place.gazetteerPlace.geometry,
              boundingBox: place.gazetteerPlace.boundingBox,
              label: place.gazetteerPlace.name,
            },
            h,
          ),
        ]
      : [
          h.div(styledAttributes([h.AriaHidden(true)], placeholderThumbnailStyle), [
            (LocationPlace.guards.FreeText(place) ? Icons.signpost : Icons.mapPoint)({
              size: "lg",
              mode: "duotone",
            }),
          ]),
        ],
  )

const entryTitle = (place: ProfileLocationData["place"]) =>
  LocationPlace.match(place, {
    FreeText: ({ text }) => text,
    KnownPlace: ({ gazetteerPlace, placeName }) =>
      gazetteerPlace === null ? placeName : gazetteerPlaceLabel(gazetteerPlace),
  })

const entryView = (
  {
    location,
    isLatest,
    isDeleting,
    isConfirmingDelete,
  }: Readonly<{
    location: ProfileLocationData
    isLatest: boolean
    isDeleting: boolean
    isConfirmingDelete: boolean
  }>,
  h: ProfileLocationsEditorViewBuilder,
): Html => {
  const place = location.place
  const title = entryTitle(place)
  const maybePeriod = Option.fromNullishOr(period(location))
  const isOnProfile = isLatest && location.visibility === "PUBLIC"

  return h.article(
    styledAttributes(
      [h.AriaLabel(title), ...(isDeleting ? [h.AriaBusy(true)] : [])],
      surfaceStyle,
      entryStyle,
      ...(isDeleting ? [deletingEntryStyle] : []),
    ),
    [
      thumbnail(place, h),
      h.div(styledAttributes([], entryBodyStyle), [
        h.div(styledAttributes([], tightStackStyle), [
          AppText.view(
            {
              element: "h3",
              appearance: "regular",
              weight: "semibold",
              lineHeight: "tight",
              children: [title],
            },
            h,
          ),
          ...(LocationPlace.guards.KnownPlace(place) && place.label !== null
            ? [muted(place.label, h)]
            : []),
        ]),
        h.div(styledAttributes([], rowStyle), [
          ...Option.toArray(
            Option.map(maybePeriod, (label) =>
              metaChip({ icon: Icons.calendar, label, background: "neutral" }, h),
            ),
          ),
          metaChip(
            {
              icon: visibilityIcons[location.visibility],
              label: informationVisibilityLabels[location.visibility],
              background: visibilityBackground[location.visibility],
            },
            h,
          ),
          ...(isOnProfile
            ? [metaChip({ icon: Icons.user, label: "No seu perfil", background: "neutral" }, h)]
            : []),
        ]),
        ...(isLatest && !isOnProfile
          ? [muted("Seu perfil não mostra um lugar agora, porque o mais recente não é público.", h)]
          : []),
      ]),
      h.div(styledAttributes([], entryActionsStyle), [
        AppButton.view(
          {
            mode: "outline",
            size: "sm",
            ariaLabel: `Editar ${title}`,
            title: "Editar",
            isDisabled: isDeleting,
            styles: [iconButtonStyle],
            onClick: Message.ClickedEditLocation({ id: location.id }),
            children: [Icons.pen({ size: "sm" })],
          },
          h,
        ),
        ...entryMenu({ location, title }, h),
      ]),
      ...(isConfirmingDelete || isDeleting
        ? [
            h.div(styledAttributes([h.Role("group")], confirmationStyle), [
              AppText.view(
                {
                  element: "p",
                  appearance: "footnote",
                  weight: "medium",
                  children: ["Remover este lugar do seu itinerário?"],
                },
                h,
              ),
              h.div(styledAttributes([], rowStyle), [
                AppButton.view(
                  {
                    mode: "outline",
                    size: "sm",
                    isDisabled: isDeleting,
                    onClick: Message.CancelledDeleteLocation(),
                    children: ["Manter"],
                  },
                  h,
                ),
                AppButton.view(
                  {
                    size: "sm",
                    tone: "destructive",
                    isDisabled: isDeleting,
                    attributes: [h.Id(CONFIRM_DELETE_BUTTON_ID)],
                    onClick: Message.ConfirmedDeleteLocation({ id: location.id }),
                    children: [Icons.trash({ size: "sm" }), isDeleting ? "Removendo…" : "Remover"],
                  },
                  h,
                ),
              ]),
            ]),
          ]
        : []),
    ],
  )
}

const stop = (
  {
    key,
    isCurrent,
    content,
  }: Readonly<{
    key: string
    isCurrent: boolean
    content: Html
  }>,
  h: ProfileLocationsEditorViewBuilder,
): Html =>
  h.keyed("li")(key, styledAttributes([], stopStyle), [
    h.span(
      styledAttributes(
        [h.AriaHidden(true)],
        markerStyle,
        ...(isCurrent ? [currentMarkerStyle] : []),
      ),
    ),
    content,
  ])

const timeline = (model: Model, h: ProfileLocationsEditorViewBuilder): ReadonlyArray<Html> =>
  AsyncData.matchData(model.locations, {
    onEmpty: () => [status("Carregando seus lugares…", h)],
    onFailure: () => [
      alert("Não foi possível carregar seus lugares. Tente novamente em instantes.", h),
    ],
    onData: (locations) => timelineEntries({ model, locations }, h),
  })

const emptyStateStyle = Style.make({
  display: "grid",
  justifyItems: "center",
  rowGap: space[2],
  padding: space[6],
  textAlign: "center",
  borderStyle: "dashed",
})

const timelineEntries = (
  { model, locations }: Readonly<{ model: Model; locations: ReadonlyArray<ProfileLocationData> }>,
  h: ProfileLocationsEditorViewBuilder,
): ReadonlyArray<Html> => {
  const maybeEditingId = Option.flatMap(model.maybeForm, (form) => form.maybeEditingId)

  return [
    ...Option.toArray(Option.map(model.maybeListError, (error) => alert(error, h))),
    ...EffectArray.match(locations, {
      onEmpty: () =>
        Option.isSome(model.maybeForm)
          ? []
          : [
              h.div(styledAttributes([], surfaceStyle, emptyStateStyle), [
                Icons.signpost({ size: "lg", mode: "duotone", tone: "primary" }),
                AppText.view(
                  {
                    element: "p",
                    weight: "medium",
                    children: ["Seu itinerário ainda está vazio."],
                  },
                  h,
                ),
                muted("Conte onde você cultiva, onde já viveu ou por onde está passando.", h),
              ]),
            ],
      // Listed from latest to oldest; the trail reads from oldest to the present.
      onNonEmpty: (entries) => {
        const latestId = EffectArray.headNonEmpty(entries).id

        return [
          h.ol(
            styledAttributes(
              [h.AriaLabel("Seus lugares, do mais antigo ao mais recente")],
              timelineStyle,
            ),
            EffectArray.reverse(entries).map((location) =>
              stop(
                {
                  key: location.id,
                  isCurrent: location.id === latestId && location.endDate === null,
                  content: Option.match(
                    Option.filter(model.maybeForm, () =>
                      Option.contains(maybeEditingId, location.id),
                    ),
                    {
                      onNone: () =>
                        entryView(
                          {
                            location,
                            isLatest: location.id === latestId,
                            isDeleting: Option.contains(model.maybeDeletingId, location.id),
                            isConfirmingDelete: Option.contains(
                              model.maybeConfirmingDeleteId,
                              location.id,
                            ),
                          },
                          h,
                        ),
                      onSome: (form) => formView({ model, form }, h),
                    },
                  ),
                },
                h,
              ),
            ),
          ),
        ]
      },
    }),
  ]
}

// FORM

const formStyle = Style.make({
  display: "grid",
  rowGap: space[6],
  padding: space[4],
}).pipe(Style.when(breakpoint.sm, { padding: space[5] }))

const formHeaderStyle = Style.make({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space[3],
})

const fieldsetStyle = Style.make({
  display: "grid",
  rowGap: space[3],
  minInlineSize: 0,
  border: "none",
  margin: 0,
  padding: 0,
})

const legend = (text: string, h: ProfileLocationsEditorViewBuilder) =>
  h.legend(styledAttributes([], Style.make({ padding: 0, marginBlockEnd: space[3] })), [
    AppText.view(
      { element: "span", appearance: "regular", weight: "semibold", children: [text] },
      h,
    ),
  ])

const textInput = (
  config: Readonly<{
    id: string
    label: string
    value: string
    placeholder?: string
    description?: string
    maxLength?: number
    onInput: (value: string) => typeof Message.Type
  }>,
  h: ProfileLocationsEditorViewBuilder,
) =>
  AppField.view(
    {
      label: config.label,
      labelAttributes: [h.For(config.id)],
      ...(config.description === undefined ? {} : { description: config.description }),
      control: AppInput.view<ViewMessage>(
        {
          attributes: [
            h.Id(config.id),
            h.Value(config.value),
            h.OnInput(config.onInput),
            ...(config.placeholder === undefined ? [] : [h.Placeholder(config.placeholder)]),
            ...(config.maxLength === undefined
              ? []
              : [h.Attribute("maxlength", String(config.maxLength))]),
          ],
        },
        h,
      ),
    },
    h,
  )

// DATES

const dateRowStyle = Style.make({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 6rem",
  gap: space[2],
})

const datesStyle = Style.make({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
  gap: space[4],
})

const dateInputs = (
  config: Readonly<{
    label: string
    year: string
    month: string
    yearField: DateField
    monthField: DateField
  }>,
  h: ProfileLocationsEditorViewBuilder,
) =>
  h.div(styledAttributes([h.Role("group"), h.AriaLabel(config.label)], tightStackStyle), [
    AppText.view(
      { element: "span", appearance: "footnote", weight: "medium", children: [config.label] },
      h,
    ),
    h.div(styledAttributes([], dateRowStyle), [
      h.select(
        styledAttributes(
          [
            h.AriaLabel(`Mês (${config.label.toLowerCase()})`),
            h.OnChange((value) => Message.UpdatedDate({ field: config.monthField, value })),
          ],
          textControlStyle,
        ),
        [
          h.option([h.Value(""), h.Selected(config.month === "")], ["Mês (opcional)"]),
          ...MONTHS.map((month, index) =>
            h.option(
              [h.Value(String(index + 1)), h.Selected(config.month === String(index + 1))],
              [month],
            ),
          ),
        ],
      ),
      AppInput.view<ViewMessage>(
        {
          attributes: [
            h.AriaLabel(`Ano (${config.label.toLowerCase()})`),
            h.Value(config.year),
            h.Placeholder("Ano"),
            h.Attribute("inputmode", "numeric"),
            h.Attribute("maxlength", "4"),
            h.Attribute("autocomplete", "off"),
            h.OnInput((value) => Message.UpdatedDate({ field: config.yearField, value })),
          ],
        },
        h,
      ),
    ]),
  ])

const checkboxLabelStyle = Style.make({
  display: "inline-flex",
  alignItems: "center",
  gap: space[2],
  inlineSize: "fit-content",
  cursor: "pointer",
  fontSize: fontSize.footnote,
})

const checkboxStyle = Style.make({
  inlineSize: space[5],
  blockSize: space[5],
  margin: 0,
  accentColor: tones.primary.ramp[500],
  cursor: "pointer",
}).pipe(Style.when(When.focusVisible, focusRingDeclarations))

const datesFieldset = (form: Form, h: ProfileLocationsEditorViewBuilder) =>
  h.fieldset(styledAttributes([], fieldsetStyle), [
    legend("Quando", h),
    h.div(styledAttributes([], datesStyle), [
      dateInputs(
        {
          label: "Desde",
          year: form.startYear,
          month: form.startMonth,
          yearField: "startYear",
          monthField: "startMonth",
        },
        h,
      ),
      ...(form.isOngoing
        ? []
        : [
            dateInputs(
              {
                label: "Até",
                year: form.endYear,
                month: form.endMonth,
                yearField: "endYear",
                monthField: "endMonth",
              },
              h,
            ),
          ]),
    ]),
    AppText.view(
      {
        element: "label",
        appearance: "footnote",
        styles: [checkboxLabelStyle],
        children: [
          h.input(
            styledAttributes(
              [
                h.Type("checkbox"),
                h.Checked(form.isOngoing),
                h.OnClick(Message.ToggledOngoing({ isOngoing: !form.isOngoing })),
              ],
              checkboxStyle,
            ),
          ),
          "Ainda estou neste lugar",
        ],
      },
      h,
    ),
    muted("As datas são opcionais, e o ano basta.", h),
  ])

// VISIBILITY

const visibilityOptionsStyle = Style.make({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))",
  gap: space[2],
})

const visibilityOptionStyle = Style.make({
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr)",
  alignItems: "start",
  columnGap: space[2],
  rowGap: space[1],
  padding: space[3],
  borderRadius: radius.md,
  border: `${borderWidth.strong} solid ${tones.neutral.shade[200]}`,
  backgroundColor: toneColors.backgroundCard,
  cursor: "pointer",
  transitionProperty: "border-color, background-color",
  transitionDuration: duration.control,
}).pipe(
  Style.when(When.hover, { borderColor: tones.neutral.shade[400] }),
  Style.when(When.has(When.focusVisible), focusRingDeclarations),
)

const selectedVisibilityOptionStyle = Style.make({
  borderColor: tones.primary.shade[600],
  backgroundColor: tones.primary.shade[100],
}).pipe(Style.when(When.hover, { borderColor: tones.primary.shade[600] }))

const visibilityFieldset = (form: Form, h: ProfileLocationsEditorViewBuilder) =>
  h.fieldset(styledAttributes([], fieldsetStyle), [
    legend("Quem pode ver", h),
    h.div(
      styledAttributes([], visibilityOptionsStyle),
      InformationVisibility.literals.map((visibility) => {
        const isSelected = form.visibility === visibility

        return AppText.view(
          {
            element: "label",
            styles: [visibilityOptionStyle, ...(isSelected ? [selectedVisibilityOptionStyle] : [])],
            children: [
              h.input(
                styledAttributes(
                  [
                    h.Type("radio"),
                    h.Name("profile-locations-editor-visibility"),
                    h.Value(visibility),
                    h.Checked(isSelected),
                    h.OnChange(() => Message.ChoseVisibility({ visibility })),
                  ],
                  visuallyHiddenStyle,
                ),
              ),
              visibilityIcons[visibility]({
                size: "sm",
                tone: isSelected ? "primary" : "inherit",
              }),
              AppText.view(
                {
                  element: "span",
                  appearance: "footnote",
                  weight: "semibold",
                  children: [informationVisibilityLabels[visibility]],
                },
                h,
              ),
              AppText.view(
                {
                  element: "span",
                  appearance: "caption",
                  isMuted: true,
                  lineHeight: "normal",
                  styles: [Style.make({ gridColumn: "2" })],
                  children: [visibilityDescriptions[visibility]],
                },
                h,
              ),
            ],
          },
          h,
        )
      }),
    ),
  ])

// PLACE

const comboboxWrapperStyle = Style.make({ position: "relative", inlineSize: "100%" })

const comboboxItemsStyle = Style.make({
  inlineSize: "var(--button-width)",
  maxBlockSize: "18rem",
  overflowY: "auto",
  borderRadius: radius.md,
  borderStyle: "solid",
  borderWidth: borderWidth.hairline,
  borderColor: tones.neutral.shade[300],
  backgroundColor: toneColors.backgroundCard,
  zIndex: layer.overlay,
  outline: "none",
})

const comboboxItemClassName = styledClassName(
  Style.make({
    display: "grid",
    paddingBlock: space[2],
    paddingInline: space[3],
    cursor: "pointer",
  }).pipe(Style.when(When.highlighted, { backgroundColor: tones.primary.shade[100] })),
)

const comboboxBackdropStyle = Style.make({ position: "fixed", inset: 0, zIndex: 0 })

const placeItemStyle = Style.make({ display: "grid", rowGap: space[1] })

const previewStyle = Style.make({
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr)",
  alignItems: "center",
  gap: space[3],
  padding: space[3],
  borderRadius: radius.md,
  backgroundColor: toneColors.backgroundCard,
})

/** The place's name over its hierarchy, so places with the same name tell apart. */
const placeItem = (place: GazetteerPlaceSummary, h: ProfileLocationsEditorViewBuilder): Html =>
  h.div(styledAttributes([], placeItemStyle), [
    AppText.view(
      { element: "span", appearance: "regular", weight: "medium", children: [place.name] },
      h,
    ),
    AppText.view(
      {
        element: "span",
        appearance: "footnote",
        isMuted: true,
        children: [
          [
            ...(place.matchedName === null ? [] : [`inclui ${place.matchedName}`]),
            ...place.ancestors.map((ancestor) => ancestor.name),
          ].join(" · "),
        ],
      },
      h,
    ),
  ])

const placePreview = (
  { place, form }: Readonly<{ place: GazetteerPlace; form: Form }>,
  h: ProfileLocationsEditorViewBuilder,
): Html =>
  h.div(styledAttributes([], previewStyle), [
    h.div(styledAttributes([], thumbnailSize), [
      PlaceOutline.view(
        { geometry: place.geometry, boundingBox: place.boundingBox, label: place.name },
        h,
      ),
    ]),
    h.div(styledAttributes([], tightStackStyle), [
      AppText.view(
        {
          element: "p",
          appearance: "regular",
          weight: "semibold",
          lineHeight: "tight",
          children: [gazetteerPlaceLabel(place)],
        },
        h,
      ),
      muted("Guardamos apenas este lugar inteiro, nunca suas coordenadas.", h),
      ...EffectArray.fromOption(
        Option.map(form.maybeElevation, (elevation) =>
          h.div(styledAttributes([], rowStyle), [
            muted(`${formatElevation(elevation)} de altitude, pelo aparelho. Só você vê.`, h),
            AppButton.view(
              {
                mode: "bleed",
                size: "sm",
                onClick: Message.ClickedRemoveElevation(),
                children: ["Não guardar"],
              },
              h,
            ),
          ]),
        ),
      ),
    ]),
  ])

const placeFields = (
  { model, form }: Readonly<{ model: Model; form: Form }>,
  h: ProfileLocationsEditorViewBuilder,
): ReadonlyArray<Html> => {
  const labelOf = (id: WhosOnFirstId) =>
    Option.match(
      EffectArray.findFirst(model.searchResults, (place) => place.id === id),
      {
        onNone: () =>
          Option.match(form.maybePlace, { onNone: () => "", onSome: gazetteerPlaceLabel }),
        onSome: gazetteerPlaceLabel,
      },
    )

  const deviceMessage = deviceLookupMessages[form.deviceLookup]

  return [
    h.div(styledAttributes([], stackStyle), [
      AppText.view(
        {
          element: "label",
          appearance: "footnote",
          weight: "medium",
          attributes: [h.For(placeFieldId("Place"))],
          children: ["Município, estado ou país"],
        },
        h,
      ),
      h.block(
        PlaceComboboxBinding.embedView({
          slotId: model.placeCombobox.id,
          model: model.placeCombobox,
          viewInputs: {
            items: model.searchResults.map((place) => place.id),
            maybeSelectedValue: Option.map(form.maybePlace, (place) => place.id),
            restingInputValue: Option.match(form.maybePlace, {
              onNone: () => "",
              onSome: gazetteerPlaceLabel,
            }),
            itemToConfig: (id) => ({
              className: comboboxItemClassName,
              content: Option.match(
                EffectArray.findFirst(model.searchResults, (place) => place.id === id),
                { onNone: () => h.span([], [id]), onSome: (place) => placeItem(place, h) },
              ),
            }),
            itemToValue: (id) => id,
            itemToDisplayText: labelOf,
            inputPlaceholder: "Busque pelo nome: Villa de Leyva, Viçosa, Boyacá…",
            inputAttributes: childAttributes(styledAttributes([], textControlStyle)),
            itemsAttributes: childAttributes(styledAttributes([], comboboxItemsStyle)),
            backdropAttributes: childAttributes(styledAttributes([], comboboxBackdropStyle)),
            attributes: childAttributes(styledAttributes([], comboboxWrapperStyle)),
            anchor: { placement: "bottom-start", gap: 4, padding: 8 },
          },
        }),
      ),
      h.div(styledAttributes([], rowStyle), [
        AppButton.view(
          {
            mode: "outline",
            size: "sm",
            isDisabled: form.deviceLookup === "Locating",
            onClick: Message.ClickedUseDeviceLocation(),
            children: [
              Icons.gps({ size: "sm" }),
              form.deviceLookup === "Locating" ? "Localizando…" : "Usar minha localização",
            ],
          },
          h,
        ),
        AppButton.view(
          {
            mode: "bleed",
            size: "sm",
            onClick: Message.ChoseMode({ mode: "FreeText" }),
            children: [Icons.signpost({ size: "sm" }), "Descrever com minhas palavras"],
          },
          h,
        ),
      ]),
      ...(deviceMessage === null ? [] : [status(deviceMessage, h)]),
    ]),
    ...Option.match(form.maybePlace, {
      onNone: () => [],
      onSome: (place) => [
        placePreview({ place, form }, h),
        textInput(
          {
            id: "profile-locations-editor-label",
            label: "Como você chama esse lugar? (opcional)",
            value: form.label,
            placeholder: "Ex.: sítio na estrada para Sáchica",
            description: "Aparece junto ao nome do lugar, para quem pode vê-lo.",
            maxLength: 120,
            onInput: (value) => Message.UpdatedLabel({ value }),
          },
          h,
        ),
      ],
    }),
  ]
}

const freeTextFields = (form: Form, h: ProfileLocationsEditorViewBuilder): ReadonlyArray<Html> => [
  h.div(styledAttributes([], stackStyle), [
    textInput(
      {
        id: FREE_TEXT_INPUT_ID,
        label: "Onde você está, com suas palavras",
        value: form.freeText,
        placeholder: "Ex.: Online, Viajando por aí, Algum canto da Argentina",
        maxLength: 120,
        onInput: (value) => Message.UpdatedFreeText({ value }),
      },
      h,
    ),
    h.div(styledAttributes([], rowStyle), [
      AppButton.view(
        {
          mode: "bleed",
          size: "sm",
          onClick: Message.ChoseMode({ mode: "Place" }),
          children: [Icons.mapPoint({ size: "sm" }), "Escolher um município, estado ou país"],
        },
        h,
      ),
    ]),
  ]),
]

const formActionsStyle = Style.make({
  display: "flex",
  flexWrap: "wrap-reverse",
  justifyContent: "flex-end",
  gap: space[2],
})

const formView = (
  { model, form }: Readonly<{ model: Model; form: Form }>,
  h: ProfileLocationsEditorViewBuilder,
): Html => {
  const isEditing = Option.isSome(form.maybeEditingId)
  const title = isEditing ? "Editar lugar" : "Novo lugar no itinerário"

  return h.form(
    styledAttributes(
      [h.AriaLabel(title), h.OnSubmit(Message.SubmittedForm()), h.Attribute("novalidate", "")],
      surfaceStyle,
      formStyle,
    ),
    [
      h.div(styledAttributes([], formHeaderStyle), [
        AppText.view(
          {
            element: "h3",
            appearance: "large",
            weight: "semibold",
            tone: "secondary",
            children: [title],
          },
          h,
        ),
        AppButton.view(
          {
            mode: "bleed",
            size: "sm",
            ariaLabel: "Fechar sem salvar",
            title: "Fechar",
            onClick: Message.ClickedCancelForm(),
            children: [Icons.x({ size: "sm" })],
          },
          h,
        ),
      ]),
      h.fieldset(styledAttributes([], fieldsetStyle), [
        legend("Onde", h),
        ...(form.mode === "Place" ? placeFields({ model, form }, h) : freeTextFields(form, h)),
      ]),
      datesFieldset(form, h),
      visibilityFieldset(form, h),
      ...Option.toArray(Option.map(form.maybeError, (error) => alert(error, h))),
      h.div(styledAttributes([], formActionsStyle), [
        AppButton.view(
          { mode: "outline", onClick: Message.ClickedCancelForm(), children: ["Cancelar"] },
          h,
        ),
        AppButton.view(
          {
            type: "submit",
            tone: "primary",
            isDisabled: form.isSaving,
            children: [
              form.isSaving ? "Salvando…" : isEditing ? "Salvar alterações" : "Adicionar lugar",
            ],
          },
          h,
        ),
      ]),
    ],
  )
}

export type ViewInputs = Readonly<{ isSignedIn: boolean }>

const TITLE = "Meu itinerário geográfico"

const intro = (h: ProfileLocationsEditorViewBuilder) =>
  AppText.view(
    {
      element: "p",
      appearance: "footnote",
      isMuted: true,
      children: [
        "Onde você cultiva, onde já viveu, por onde está passando. Cada lugar aparece só para quem você escolher, e guardamos apenas o município, nunca suas coordenadas.",
      ],
    },
    h,
  )

export const view = ProfileLocationsEditorComposition.makeView.withInputs<ViewInputs>(
  // oxlint-disable-next-line custom-lint-rules/no-many-function-parameters -- Foldkit's view signature: Model, view inputs and builder.
  (model, { isSignedIn }, h) => {
    const isAdding = Option.exists(model.maybeForm, (form) => Option.isNone(form.maybeEditingId))

    return h.div(styledAttributes([], pageStyle), [
      SectionCard.view(
        {
          title: TITLE,
          icon: Icons.route,
          headingElement: "h1",
          tone: "neutral",
          ...(isSignedIn
            ? {
                actions: [
                  AppButton.view(
                    {
                      tone: "primary",
                      size: "sm",
                      isDisabled: isAdding,
                      onClick: Message.ClickedAddLocation(),
                      children: [Icons.addCircle({ size: "sm" }), "Adicionar lugar"],
                    },
                    h,
                  ),
                ],
              }
            : {}),
          children: isSignedIn
            ? [
                intro(h),
                ...EffectArray.fromOption(
                  Option.map(
                    Option.filter(model.maybeForm, (form) => Option.isNone(form.maybeEditingId)),
                    (form) => formView({ model, form }, h),
                  ),
                ),
                h.div(styledAttributes([], stackStyle), timeline(model, h)),
              ]
            : [
                intro(h),
                h.div(styledAttributes([], rowStyle), [
                  AppText.view(
                    { element: "p", children: ["Entre na sua conta para registrar seus lugares."] },
                    h,
                  ),
                  AppButton.view({ tone: "primary", href: loginRouter(), children: ["Entrar"] }, h),
                ]),
              ],
        },
        h,
      ),
    ])
  },
)
