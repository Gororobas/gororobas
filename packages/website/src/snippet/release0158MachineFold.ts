const foldCheckout = Machine.fold({
  machine: checkoutMachine,
  read: (model: typeof Model.Type) => Option.some(model.checkout),
  write: (model, nextCheckout) => evo(model, { checkout: () => nextCheckout }),
})
