---
'@foldkit/oxlint-plugin': minor
---

Remove `got-block-message-name`, `got-prefix-requires-block-payload`, `got-wrapper-carries-only-routing`, and `wrap-child-output-in-got-message`. Block Compositions generate child delivery envelopes. Remove these rule IDs from explicit lint configurations; the recommended and all presets already excluded them from lint enforcement.
