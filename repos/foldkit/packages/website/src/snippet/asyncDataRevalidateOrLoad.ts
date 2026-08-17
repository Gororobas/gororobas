const enterNotebooksRoute = (model: Model): readonly [Model, Commands] =>
  Option.match(AsyncData.revalidateOrLoad(model.notebooks), {
    onNone: () => [model, []],
    onSome: nextNotebooks => [
      evo(model, { notebooks: () => nextNotebooks }),
      [LoadNotebooks()],
    ],
  })
