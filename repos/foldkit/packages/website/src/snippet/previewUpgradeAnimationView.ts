h.block(
  AnimationBinding.embedView({
    slotId: 'saved-message',
    model: model.animation,
    viewInputs: {
      toView: () => h.p([], ['Saved']),
    },
  }),
)
