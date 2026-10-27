return Update.combineSteps(model, [
  openDialog,
  ApplicationDefinition.makeFieldsStep(() => ({
    isSubmitting: () => false,
  })),
])
