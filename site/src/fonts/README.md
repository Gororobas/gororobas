# Fonts

The site ships three faces, the same ones as jem.computer.

- `TerminalGrotesque.woff2` and `TerminalGrotesque-Open.woff2`: Terminal Grotesque by Raphaël Bastide, published by Velvetyne under the SIL Open Font License 1.1. One weight, no italic, so the site never asks for bold or italic and sets `font-synthesis: none`.
- `CommitMonoManzanita-400.woff2` and `-600.woff2`: Commit Mono by Eigil Nikolajsen, SIL Open Font License 1.1, built with Manzanita Research's alternate choices.

The fonts are assets, not a dependency; Vite hashes and serves them from `design.ts`.
