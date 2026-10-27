import { docPage, slotDocPage } from '../../markdown'
import anchorMarkdown from './anchorPage.md'
import animationMarkdown from './animationPage.md'
import buttonMarkdown from './buttonPage.md'
import calendarMarkdown from './calendarPage.md'
import checkboxMarkdown from './checkboxPage.md'
import comboboxMarkdown from './comboboxPage.md'
import datePickerMarkdown from './datePickerPage.md'
import dialogMarkdown from './dialogPage.md'
import disclosureMarkdown from './disclosurePage.md'
import dragAndDropMarkdown from './dragAndDropPage.md'
import fieldsetMarkdown from './fieldsetPage.md'
import fileDropMarkdown from './fileDropPage.md'
import hoverIntentMarkdown from './hoverIntentPage.md'
import inputMarkdown from './inputPage.md'
import listboxMarkdown from './listboxPage.md'
import menuMarkdown from './menuPage.md'
import meterMarkdown from './meterPage.md'
import navMarkdown from './navPage.md'
import overviewMarkdown from './overviewPage.md'
import popoverMarkdown from './popoverPage.md'
import progressMarkdown from './progressPage.md'
import radioGroupMarkdown from './radioGroupPage.md'
import selectMarkdown from './selectPage.md'
import selectionBlocksMarkdown from './selectionBlocksPage.md'
import sliderMarkdown from './sliderPage.md'
import switchMarkdown from './switchPage.md'
import tabsMarkdown from './tabsPage.md'
import textareaMarkdown from './textareaPage.md'
import toastMarkdown from './toastPage.md'
import tooltipMarkdown from './tooltipPage.md'
import virtualListMarkdown from './virtualListPage.md'

export const AnchorPageContent = docPage(anchorMarkdown, 'ui/anchor')

export const AnimationPageContent = slotDocPage<'animation'>(
  animationMarkdown,
  'ui/animation',
)

export const ButtonPageContent = slotDocPage<'basic' | 'disabled'>(
  buttonMarkdown,
  'ui/button',
)

export const CalendarPageContent = slotDocPage<'basic'>(
  calendarMarkdown,
  'ui/calendar',
)

export const CheckboxPageContent = slotDocPage<'basic' | 'indeterminate'>(
  checkboxMarkdown,
  'ui/checkbox',
)

export const ComboboxPageContent = slotDocPage<
  | 'single-select'
  | 'nullable'
  | 'select-on-focus'
  | 'locked-placement'
  | 'multi'
>(comboboxMarkdown, 'ui/combobox')

export const DatePickerPageContent = slotDocPage<'basic'>(
  datePickerMarkdown,
  'ui/date-picker',
)

export const DialogPageContent = slotDocPage<
  'dialog' | 'animated' | 'overlay' | 'nested'
>(dialogMarkdown, 'ui/dialog')

export const DisclosurePageContent = slotDocPage<'basic' | 'collapsedPreview'>(
  disclosureMarkdown,
  'ui/disclosure',
)

export const DragAndDropPageContent = slotDocPage<'demo'>(
  dragAndDropMarkdown,
  'ui/drag-and-drop',
)

export const FieldsetPageContent = slotDocPage<'basic' | 'disabled'>(
  fieldsetMarkdown,
  'ui/fieldset',
)

export const FileDropPageContent = slotDocPage<'basic'>(
  fileDropMarkdown,
  'ui/file-drop',
)

export const HoverIntentPageContent = slotDocPage<'hover-card' | 'hover-menu'>(
  hoverIntentMarkdown,
  'ui/hover-intent',
)

export const InputPageContent = slotDocPage<'basic' | 'disabled'>(
  inputMarkdown,
  'ui/input',
)

export const ListboxPageContent = slotDocPage<
  'basic' | 'multi-select' | 'grouped'
>(listboxMarkdown, 'ui/listbox')

export const MenuPageContent = slotDocPage<'basic' | 'animated'>(
  menuMarkdown,
  'ui/menu',
)

export const MeterPageContent = slotDocPage<'basic' | 'thresholds'>(
  meterMarkdown,
  'ui/meter',
)

export const NavPageContent = slotDocPage<'basic'>(navMarkdown, 'ui/nav')

export const OverviewPageContent = docPage(overviewMarkdown, 'ui/overview')

export const PopoverPageContent = slotDocPage<
  'basic' | 'arrow' | 'animated' | 'nested'
>(popoverMarkdown, 'ui/popover')

export const ProgressPageContent = slotDocPage<'basic' | 'indeterminate'>(
  progressMarkdown,
  'ui/progress',
)

export const RadioGroupPageContent = slotDocPage<'vertical' | 'horizontal'>(
  radioGroupMarkdown,
  'ui/radio-group',
)

export const SelectPageContent = slotDocPage<'basic' | 'disabled'>(
  selectMarkdown,
  'ui/select',
)

export const SelectionBlocksPageContent = docPage(
  selectionBlocksMarkdown,
  'ui/selection-blocks',
)

export const SliderPageContent = slotDocPage<'horizontal' | 'vertical'>(
  sliderMarkdown,
  'ui/slider',
)

export const SwitchPageContent = slotDocPage<'basic'>(
  switchMarkdown,
  'ui/switch',
)

export const TabsPageContent = slotDocPage<'horizontal' | 'vertical'>(
  tabsMarkdown,
  'ui/tabs',
)

export const TextareaPageContent = slotDocPage<'basic' | 'disabled'>(
  textareaMarkdown,
  'ui/textarea',
)

export const ToastPageContent = slotDocPage<'demo'>(toastMarkdown, 'ui/toast')

export const TooltipPageContent = slotDocPage<'demo'>(
  tooltipMarkdown,
  'ui/tooltip',
)

export const VirtualListPageContent = slotDocPage<
  'fixed' | 'variable' | 'chat'
>(virtualListMarkdown, 'ui/virtual-list')
