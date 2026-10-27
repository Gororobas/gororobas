import { Effect } from 'effect'
import { Command } from 'foldkit'

// ❌ Bad
// Mapping the Effect hides this same-feature Message conversion from resolve.
const badCommand = Command.mapEffect(
  documentCommand,
  Effect.map(({ document }) =>
    Message.CompletedLoadCurrentDocument({ document, documentId }),
  ),
)

// ✅ Good
// mapEffect changes execution while preserving the original result Message.
const infallibleCommand = Command.mapEffect(documentCommand, Effect.orDie)

// ✅ Good
// mapMessage records this conversion for Story and Scene resolution.
const goodCommand = Command.mapMessage(documentCommand, ({ document }) =>
  Message.CompletedLoadCurrentDocument({ document, documentId }),
)
