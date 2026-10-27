import { Option, Schema } from 'effect'
import * as Calendar from 'foldkit/calendar'
import * as Story from 'foldkit/story'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import * as UiCalendar from '../calendar/block.js'
import * as Popover from '../popover/block.js'
import {
  DatePickerBlock,
  Message,
  OutMessage,
  focusDate,
  init,
  update,
} from './block.js'

const today = Calendar.make(2026, 4, 13)

const gotCalendarMessage = ({
  message,
}: Readonly<{
  message: typeof UiCalendar.CalendarBlock.Message.Type
}>) =>
  Schema.decodeSync(DatePickerBlock.Message)({
    _tag: 'GotCalendarMessage',
    placement: 'calendar',
    generation: 0,
    message,
  })

const gotPopoverMessage = ({
  message,
}: Readonly<{ message: typeof Popover.PopoverBlock.Message.Type }>) =>
  Schema.decodeSync(DatePickerBlock.Message)({
    _tag: 'GotPopoverMessage',
    placement: 'popover',
    generation: 0,
    message,
  })

const givenClosed = Story.given(init({ id: 'picker', today }).model)

const givenOpen = Story.steps(givenClosed, Story.message(Message.Opened()))

describe('DatePicker', () => {
  describe('init', () => {
    it('defaults to a closed popover with contentFocus enabled', () => {
      const model = init({ id: 'picker', today }).model
      expect(model.id).toBe('picker')
      expect(model.popover.isOpen).toBe(false)
      expect(model.popover.contentFocus).toBe(true)
      expect(model.popover.id).toBe('picker-popover')
      expect(model.calendar.id).toBe('picker-calendar')
    })

    it('seeds the calendar view month from initialViewDate', () => {
      const initialViewDate = Calendar.make(2026, 5, 2)
      const model = init({
        id: 'picker',
        today,
        initialViewDate,
      }).model
      expect(model.calendar.viewMonth).toBe(5)
    })

    it('propagates isAnimated to the popover block', () => {
      const model = init({ id: 'picker', today, isAnimated: true }).model
      expect(model.popover.isAnimated).toBe(true)
    })

    it('propagates min/max and disabled config to the calendar block', () => {
      const minDate = Calendar.make(2026, 1, 1)
      const maxDate = Calendar.make(2026, 12, 31)
      const model = init({
        id: 'picker',
        today,
        minDate,
        maxDate,
        disabledDaysOfWeek: ['Sunday'],
      }).model
      expect(model.calendar.maybeMinDate).toStrictEqual(Option.some(minDate))
      expect(model.calendar.maybeMaxDate).toStrictEqual(Option.some(maxDate))
      expect(model.calendar.disabledDaysOfWeek).toStrictEqual(['Sunday'])
    })
  })

  describe('update', () => {
    describe('Opened', () => {
      it('opens the popover', () => {
        Story.story(
          update,
          givenClosed,
          Story.message(Message.Opened()),
          Story.model(model => {
            expect(model.popover.isOpen).toBe(true)
          }),
          Story.expectNoOutMessage(),
        )
      })

      it('does not dispatch focus commands when opening', () => {
        Story.story(
          update,
          givenClosed,
          Story.message(Message.Opened()),
          Story.Command.expectNone(),
        )
      })

      it('drops the calendar back to Days mode if a previous session left it drilled into Months or Years', () => {
        Story.story(
          update,
          givenOpen,
          Story.message(
            gotCalendarMessage({
              message: UiCalendar.Message.ClickedHeading(),
            }),
          ),
          Story.Command.resolve(
            UiCalendar.FocusGrid,
            UiCalendar.Message.CompletedFocusGrid(),
          ),
          Story.message(
            gotCalendarMessage({
              message: UiCalendar.Message.ClickedHeading(),
            }),
          ),
          Story.Command.resolve(
            UiCalendar.FocusGrid,
            UiCalendar.Message.CompletedFocusGrid(),
          ),
          Story.model(model => {
            expect(model.calendar.viewMode).toBe('Years')
          }),
          Story.message(Message.Closed()),
          Story.Command.resolve(
            Popover.FocusPopoverButton,
            Popover.Message.CompletedFocusPopoverButton(),
          ),
          Story.message(Message.Opened()),
          Story.model(model => {
            expect(model.calendar.viewMode).toBe('Days')
          }),
        )
      })
    })

    describe('Closed', () => {
      it('closes the popover and returns focus to the trigger button', () => {
        Story.story(
          update,
          givenOpen,
          Story.message(Message.Closed()),
          Story.Command.resolve(
            Popover.FocusPopoverButton,
            Popover.Message.CompletedFocusPopoverButton(),
          ),
          Story.model(model => {
            expect(model.popover.isOpen).toBe(false)
          }),
          Story.expectNoOutMessage(),
        )
      })

      it('drops the calendar back to Days mode if the user closed while drilled into Months or Years', () => {
        Story.story(
          update,
          givenOpen,
          Story.message(
            gotCalendarMessage({
              message: UiCalendar.Message.ClickedHeading(),
            }),
          ),
          Story.Command.resolve(
            UiCalendar.FocusGrid,
            UiCalendar.Message.CompletedFocusGrid(),
          ),
          Story.message(
            gotCalendarMessage({
              message: UiCalendar.Message.ClickedHeading(),
            }),
          ),
          Story.Command.resolve(
            UiCalendar.FocusGrid,
            UiCalendar.Message.CompletedFocusGrid(),
          ),
          Story.model(model => {
            expect(model.calendar.viewMode).toBe('Years')
          }),
          Story.message(Message.Closed()),
          Story.Command.resolve(
            Popover.FocusPopoverButton,
            Popover.Message.CompletedFocusPopoverButton(),
          ),
          Story.model(model => {
            expect(model.calendar.viewMode).toBe('Days')
          }),
        )
      })

      it('reconciles the calendar focus after Years-mode paging so reopening does not drift the day grid', () => {
        Story.story(
          update,
          givenOpen,
          Story.message(
            gotCalendarMessage({
              message: UiCalendar.Message.ClickedHeading(),
            }),
          ),
          Story.Command.resolve(
            UiCalendar.FocusGrid,
            UiCalendar.Message.CompletedFocusGrid(),
          ),
          Story.message(
            gotCalendarMessage({
              message: UiCalendar.Message.ClickedHeading(),
            }),
          ),
          Story.Command.resolve(
            UiCalendar.FocusGrid,
            UiCalendar.Message.CompletedFocusGrid(),
          ),
          Story.message(
            gotCalendarMessage({
              message: UiCalendar.Message.PagedYears({ direction: 1 }),
            }),
          ),
          Story.message(Message.Closed()),
          Story.Command.resolve(
            Popover.FocusPopoverButton,
            Popover.Message.CompletedFocusPopoverButton(),
          ),
          Story.model(model => {
            expect(model.calendar.viewMode).toBe('Days')
            expect(model.calendar.viewYear).toBe(2026)
            expect(model.calendar.viewMonth).toBe(4)
            expect(model.calendar.maybeFocusedDate).toStrictEqual(
              Option.some(Calendar.make(2026, 4, 13)),
            )
          }),
        )
      })
    })

    describe('RequestedSelectDate', () => {
      it('commits the date, closes the popover, and emits SelectedDate', () => {
        const target = Calendar.make(2026, 4, 20)
        Story.story(
          update,
          givenOpen,
          Story.message(Message.RequestedSelectDate({ date: target })),
          Story.expectOutMessage(OutMessage.SelectedDate({ date: target })),
          Story.Command.resolve(
            Popover.FocusPopoverButton,
            Popover.Message.CompletedFocusPopoverButton(),
          ),
          Story.model(model => {
            expect(model.calendar.maybeFocusedDate).toStrictEqual(
              Option.some(target),
            )
            expect(model.popover.isOpen).toBe(false)
          }),
        )
      })

      it('syncs the calendar view month when the selection crosses a month boundary', () => {
        const target = Calendar.make(2026, 6, 5)
        Story.story(
          update,
          givenOpen,
          Story.message(Message.RequestedSelectDate({ date: target })),
          Story.Command.resolve(
            Popover.FocusPopoverButton,
            Popover.Message.CompletedFocusPopoverButton(),
          ),
          Story.model(model => {
            expect(model.calendar.viewYear).toBe(2026)
            expect(model.calendar.viewMonth).toBe(6)
          }),
        )
      })
    })

    describe('Cleared', () => {
      it('emits ClearedDate without closing the popover', () => {
        const seeded = init({
          id: 'picker',
          today,
          initialViewDate: Calendar.make(2026, 4, 20),
        }).model
        Story.story(
          update,
          Story.steps(Story.given(seeded), Story.message(Message.Opened())),
          Story.message(Message.Cleared()),
          Story.Command.expectNone(),
          Story.model(model => {
            expect(model.popover.isOpen).toBe(true)
          }),
          Story.expectOutMessage(OutMessage.ClearedDate()),
        )
      })
    })

    describe('GotCalendarMessage', () => {
      it('propagates Calendar ChangedViewMonth as DatePicker ChangedViewMonth', () => {
        Story.story(
          update,
          givenOpen,
          Story.message(
            gotCalendarMessage({
              message: UiCalendar.Message.ClickedNextMonthButton(),
            }),
          ),
          Story.model(model => {
            expect(model.calendar.viewMonth).toBe(5)
          }),
          Story.expectOutMessage(
            OutMessage.ChangedViewMonth({ year: 2026, month: 5 }),
          ),
        )
      })

      it('passes keyboard navigation through to the calendar grid', () => {
        Story.story(
          update,
          givenOpen,
          Story.message(
            gotCalendarMessage({
              message: UiCalendar.Message.PressedKeyOnGrid({
                key: 'ArrowRight',
                isShift: false,
              }),
            }),
          ),
          Story.model(model => {
            expect(model.calendar.maybeFocusedDate).toStrictEqual(
              Option.some(Calendar.make(2026, 4, 14)),
            )
          }),
        )
      })
    })

    describe('GotPopoverMessage', () => {
      it('routes popover messages through the popover update', () => {
        Story.story(
          update,
          givenOpen,
          Story.message(
            gotPopoverMessage({
              message: Popover.Message.RequestedClose(),
            }),
          ),
          Story.Command.resolve(
            Popover.FocusPopoverButton,
            Popover.Message.CompletedFocusPopoverButton(),
          ),
          Story.model(model => {
            expect(model.popover.isOpen).toBe(false)
          }),
        )
      })
    })
  })

  describe('programmatic helpers', () => {
    it('open(model) behaves like dispatching Opened', () => {
      const model = init({ id: 'picker', today }).model
      const pickerOpen = DatePickerBlock.operations.requestOpen(model)
      expect(pickerOpen.model.popover.isOpen).toBe(true)
    })

    it('close(model) behaves like dispatching Closed', () => {
      const pickerOpen = DatePickerBlock.operations.requestOpen(
        init({ id: 'picker', today }).model,
      )
      const pickerClose = DatePickerBlock.operations.requestClose(
        pickerOpen.model,
      )
      expect(pickerClose.model.popover.isOpen).toBe(false)
      expect((pickerClose.commands ?? []).length).toBeGreaterThan(0)
    })

    it('selectDate(model, date) commits the date, closes the popover, and emits SelectedDate', () => {
      const target = Calendar.make(2026, 4, 20)
      const pickerOpen = DatePickerBlock.operations.requestOpen(
        init({ id: 'picker', today }).model,
      )
      const dateSelection = DatePickerBlock.operations.requestSelectDate(
        pickerOpen.model,
        target,
      )
      expect(dateSelection.model.popover.isOpen).toBe(false)
      expect(dateSelection.outMessage).toStrictEqual(
        OutMessage.SelectedDate({ date: target }),
      )
    })

    it('clear(model) emits ClearedDate', () => {
      const seeded = init({
        id: 'picker',
        today,
        initialViewDate: Calendar.make(2026, 4, 20),
      }).model
      const selectionClear = DatePickerBlock.operations.requestClear(seeded)
      expect(selectionClear.outMessage).toStrictEqual(OutMessage.ClearedDate())
    })

    it('informMinDateChanged forwards to the embedded calendar', () => {
      const model = init({ id: 'picker', today }).model
      const newMin = Calendar.make(2026, 5, 1)
      const minDateChange = DatePickerBlock.operations.informMinDateChanged(
        model,
        Option.some(newMin),
      )
      expect(minDateChange.model.calendar.maybeMinDate).toStrictEqual(
        Option.some(newMin),
      )
    })

    it('informMinDateChanged clears the minimum', () => {
      const model = init({
        id: 'picker',
        today,
        minDate: Calendar.make(2026, 1, 1),
      }).model
      const minDateChange = DatePickerBlock.operations.informMinDateChanged(
        model,
        Option.none(),
      )
      expect(minDateChange.model.calendar.maybeMinDate).toStrictEqual(
        Option.none(),
      )
    })

    it('informMaxDateChanged forwards to the embedded calendar', () => {
      const model = init({ id: 'picker', today }).model
      const newMax = Calendar.make(2026, 12, 31)
      const maxDateChange = DatePickerBlock.operations.informMaxDateChanged(
        model,
        Option.some(newMax),
      )
      expect(maxDateChange.model.calendar.maybeMaxDate).toStrictEqual(
        Option.some(newMax),
      )
    })

    it('informDisabledDatesChanged forwards to the embedded calendar', () => {
      const model = init({ id: 'picker', today }).model
      const disabled = [Calendar.make(2026, 4, 15)]
      const disabledDatesChange =
        DatePickerBlock.operations.informDisabledDatesChanged(model, disabled)
      expect(disabledDatesChange.model.calendar.disabledDates).toStrictEqual(
        disabled,
      )
    })

    it('informDisabledDaysOfWeekChanged forwards to the embedded calendar', () => {
      const model = init({ id: 'picker', today }).model
      const disabledDaysChange =
        DatePickerBlock.operations.informDisabledDaysOfWeekChanged(model, [
          'Saturday',
          'Sunday',
        ])
      expect(
        disabledDaysChange.model.calendar.disabledDaysOfWeek,
      ).toStrictEqual(['Saturday', 'Sunday'])
    })
  })

  describe('focusDate', () => {
    it('moves the embedded calendar view and cursor to a date', () => {
      const date = Calendar.make(2026, 8, 15)
      const dateFocus = focusDate(init({ id: 'picker', today }).model, date)
      expect(dateFocus.model.calendar.viewYear).toBe(2026)
      expect(dateFocus.model.calendar.viewMonth).toBe(8)
      expect(dateFocus.model.calendar.maybeFocusedDate).toStrictEqual(
        Option.some(date),
      )
    })
  })
})
