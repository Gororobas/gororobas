import { Array, Option, Schema } from 'effect'
import { Update } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'

import {
  Combobox,
  Dialog,
  Listbox,
  Menu,
  Tabs,
  Tooltip,
} from '@foldkit/ui'

// NOTE: the state behind the live demos on the Foldkit UI page. The page is a
// Submodel of the site, so this is the whole of what the demos add to it.

// MODEL

export const Action = Schema.Literals([
  'Rename',
  'Duplicate',
  'Share',
  'Archive',
  'Delete',
])
export type Action = typeof Action.Type

export const Person = Schema.Literals([
  'Ada',
  'Grace',
  'Katherine',
  'Margaret',
  'Radia',
])
export type Person = typeof Person.Type

export const Fabric = Schema.Literals([
  'Calico',
  'Chambray',
  'Corduroy',
  'Denim',
  'Gabardine',
  'Linen',
  'Muslin',
  'Organza',
  'Poplin',
  'Seersucker',
  'Tweed',
  'Velvet',
])
export type Fabric = typeof Fabric.Type

export const Section = Schema.Literals([
  'Pattern',
  'Fabric',
  'Notions',
  'History',
])
export type Section = typeof Section.Type

export const TabAppearance = Schema.Literals(['Underline', 'Pill'])
export type TabAppearance = typeof TabAppearance.Type

export const Step = Schema.Literals(['Cut', 'Press', 'Hem'])
export type Step = typeof Step.Type

export const Question = Schema.Literals([
  'Attributes',
  'Transitions',
  'Inline',
])
export type Question = typeof Question.Type

export const ActionMenu: Menu.Bundle<Action> = Menu.create<Action>()
export const AssigneeListbox: Listbox.Bundle<Person> =
  Listbox.create<Person>()
export const FabricCombobox: Combobox.Bundle<Fabric> =
  Combobox.create<Fabric>()
export const SectionTabs: Tabs.Bundle<Section> =
  Tabs.create<Section>()

export const Model = Schema.Struct({
  saveCount: Schema.Number,
  isDigestOn: Schema.Boolean,
  isMentionsOn: Schema.Boolean,
  doneSteps: Schema.Array(Step),
  openQuestions: Schema.Array(Question),
  section: Section,
  tabAppearance: TabAppearance,
  tabs: Tabs.Model,
  menu: Menu.Model,
  maybeAction: Schema.Option(Action),
  listbox: Listbox.Model,
  maybeAssignee: Schema.Option(Person),
  weight: Schema.String,
  combobox: Combobox.Model,
  maybeFabric: Schema.Option(Fabric),
  dialog: Dialog.Model,
  isPatternArchived: Schema.Boolean,
  tooltip: Tooltip.Model,
})
export type Model = typeof Model.Type

export const init = (): Model => ({
  saveCount: 0,
  isDigestOn: true,
  isMentionsOn: false,
  doneSteps: ['Cut'],
  openQuestions: ['Attributes'],
  section: 'Pattern',
  tabAppearance: 'Underline',
  tabs: Tabs.init({ id: 'ui-tabs' }),
  menu: Menu.init({ id: 'ui-menu', isAnimated: true }),
  maybeAction: Option.none(),
  listbox: Listbox.init({ id: 'ui-listbox', isAnimated: true }),
  maybeAssignee: Option.some('Grace'),
  weight: '',
  combobox: Combobox.init({ id: 'ui-combobox', isAnimated: true }),
  maybeFabric: Option.none(),
  dialog: Dialog.init({ id: 'ui-dialog', isAnimated: true }),
  isPatternArchived: false,
  tooltip: Tooltip.init({ id: 'ui-tooltip', showDelay: 300 }),
})

// MESSAGE

export const Message = defineMessageUnion({
  ClickedSave: {},
  ToggledDigest: { isChecked: Schema.Boolean },
  ToggledMentions: { isChecked: Schema.Boolean },
  ToggledStep: { step: Step, isChecked: Schema.Boolean },
  ToggledAllSteps: { isChecked: Schema.Boolean },
  ToggledQuestion: { question: Question, isOpen: Schema.Boolean },
  SelectedTabAppearance: { appearance: TabAppearance },
  UpdatedWeight: { weight: Schema.String },
  ClickedArchivePrompt: {},
  ClickedArchive: {},
  ClickedRestore: {},
  GotTabsMessage: { message: Tabs.Message },
  GotMenuMessage: { message: Menu.Message },
  GotListboxMessage: { message: Listbox.Message },
  GotComboboxMessage: { message: Combobox.Message },
  GotDialogMessage: { message: Dialog.Message },
  GotTooltipMessage: { message: Tooltip.Message },
})
export type Message = typeof Message.Type

// UPDATE

type UpdateReturn = Update.Return<Model, Message>

const foldTabs = Update.foldChild({
  update: SectionTabs.update,
  read: (model: Model) => Option.some(model.tabs),
  write: (model, tabs) => modifyFields(model, { tabs: () => tabs }),
  toParentMessage: message => Message.GotTabsMessage({ message }),
  foldOutMessage:
    ({ value }) =>
    model => ({
      model: modifyFields(model, { section: () => value }),
    }),
})

const foldMenu = Update.foldChild({
  update: ActionMenu.update,
  read: (model: Model) => Option.some(model.menu),
  write: (model, menu) => modifyFields(model, { menu: () => menu }),
  toParentMessage: message => Message.GotMenuMessage({ message }),
  foldOutMessage:
    ({ value }) =>
    model => ({
      model: modifyFields(model, {
        maybeAction: () => Option.some(value),
      }),
    }),
})

const foldListbox = Update.foldChild({
  update: AssigneeListbox.update,
  read: (model: Model) => Option.some(model.listbox),
  write: (model, listbox) =>
    modifyFields(model, { listbox: () => listbox }),
  toParentMessage: message =>
    Message.GotListboxMessage({ message }),
  foldOutMessage:
    ({ value }) =>
    model => ({
      model: modifyFields(model, {
        maybeAssignee: () => Option.some(value),
      }),
    }),
})

const foldCombobox = Update.foldChild({
  update: FabricCombobox.update,
  read: (model: Model) => Option.some(model.combobox),
  write: (model, combobox) =>
    modifyFields(model, { combobox: () => combobox }),
  toParentMessage: message =>
    Message.GotComboboxMessage({ message }),
  foldOutMessage: outMessage => model => ({
    model: modifyFields(model, {
      maybeFabric: () =>
        outMessage._tag === 'Selected'
          ? Option.some(outMessage.value)
          : Option.none(),
    }),
  }),
})

const foldDialog = Update.foldChild({
  update: Dialog.update,
  read: (model: Model) => Option.some(model.dialog),
  write: (model, dialog) =>
    modifyFields(model, { dialog: () => dialog }),
  toParentMessage: message => Message.GotDialogMessage({ message }),
  foldOutMessage: () => model => ({ model }),
})

const foldDialogOpen = Update.foldChildStep({
  update: Dialog.open,
  read: (model: Model) => Option.some(model.dialog),
  write: (model, nextDialog) =>
    modifyFields(model, { dialog: () => nextDialog }),
  toParentMessage: message => Message.GotDialogMessage({ message }),
  foldOutMessage: () => model => ({ model }),
})

const foldDialogClose = Update.foldChildStep({
  update: Dialog.close,
  read: (model: Model) => Option.some(model.dialog),
  write: (model, nextDialog) =>
    modifyFields(model, { dialog: () => nextDialog }),
  toParentMessage: message => Message.GotDialogMessage({ message }),
  foldOutMessage: () => model => ({ model }),
})

const foldTooltip = Update.foldChild({
  update: Tooltip.update,
  read: (model: Model) => Option.some(model.tooltip),
  write: (model, tooltip) =>
    modifyFields(model, { tooltip: () => tooltip }),
  toParentMessage: message =>
    Message.GotTooltipMessage({ message }),
  foldOutMessage: () => model => ({ model }),
})

const toggled = <A>(
  values: ReadonlyArray<A>,
  value: A,
  isOn: boolean,
): Array<A> =>
  isOn
    ? Array.union(values, [value])
    : Array.filter(values, other => other !== value)

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ClickedSave: () => ({
      model: modifyFields(model, { saveCount: count => count + 1 }),
    }),
    ToggledDigest: ({ isChecked }) => ({
      model: modifyFields(model, { isDigestOn: () => isChecked }),
    }),
    ToggledMentions: ({ isChecked }) => ({
      model: modifyFields(model, { isMentionsOn: () => isChecked }),
    }),
    ToggledStep: ({ step, isChecked }) => ({
      model: modifyFields(model, {
        doneSteps: steps => toggled(steps, step, isChecked),
      }),
    }),
    ToggledAllSteps: ({ isChecked }) => ({
      model: modifyFields(model, {
        doneSteps: () => (isChecked ? Step.literals : []),
      }),
    }),
    ToggledQuestion: ({ question, isOpen }) => ({
      model: modifyFields(model, {
        openQuestions: questions =>
          toggled(questions, question, isOpen),
      }),
    }),
    SelectedTabAppearance: ({ appearance }) => ({
      model: modifyFields(model, {
        tabAppearance: () => appearance,
      }),
    }),
    UpdatedWeight: ({ weight }) => ({
      model: modifyFields(model, { weight: () => weight }),
    }),
    ClickedArchivePrompt: () => foldDialogOpen(model),
    ClickedArchive: () =>
      foldDialogClose(
        modifyFields(model, { isPatternArchived: () => true }),
      ),
    ClickedRestore: () => ({
      model: modifyFields(model, {
        isPatternArchived: () => false,
      }),
    }),
    GotTabsMessage: ({ message }) => foldTabs(model, message),
    GotMenuMessage: ({ message }) => foldMenu(model, message),
    GotListboxMessage: ({ message }) => foldListbox(model, message),
    GotComboboxMessage: ({ message }) =>
      foldCombobox(model, message),
    GotDialogMessage: ({ message }) => foldDialog(model, message),
    GotTooltipMessage: ({ message }) => foldTooltip(model, message),
  })
