import type { HtmlBuilder } from 'foldkit/html'

const editorView = (model: typeof Model.Type, h: HtmlBuilder<Message>) =>
  h.div(
    [
      h.OnFocusEnter(Message.EnteredEditorRegion()),
      h.OnFocusLeave(Message.LeftEditorRegion()),
    ],
    [
      tiptapEditorView(model.editor, h),
      model.focusState === 'Within' ? formattingToolbarView(h) : h.empty,
    ],
  )
