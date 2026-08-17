const revalidateAllNotes = (model: Model): readonly [Model, Commands] =>
  Option.match(AsyncData.revalidate(model.allNotes), {
    onNone: () => [model, []],
    onSome: refreshingAllNotes => [
      evo(model, { allNotes: () => refreshingAllNotes }),
      [LoadAllNotes()],
    ],
  })
