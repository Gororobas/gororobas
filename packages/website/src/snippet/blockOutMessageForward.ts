const forwardDatePickerOutMessage = DateRangeDefinition.makeOutMessageForward(
  DatePickerBlock,
  {
    SelectedDate: ({ date }) => OutMessage.SelectedEndDate({ date }),
    Closed: () => undefined,
  },
)

export const DatePickerBinding = DateRangeDefinition.makeBinding(
  DatePickerBlock,
  { field: 'datePicker' },
).withOutMessagePolicy({ forward: forwardDatePickerOutMessage })
