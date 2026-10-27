return Update.combineSteps(model, [
  foldDialogClose,
  ApplicationDefinition.makeFieldsStep(() => ({
    isSubmitting: () => false,
  })),
])
