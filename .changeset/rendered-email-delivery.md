---
"@yielded/auth": minor
---

Deliver Auth-rendered emails through an application-supplied `EmailDelivery` service, with built-in code/link templates and REST API and Alchemy examples. BEHAVIOR CHANGE: replace `Proofs.EmailProofDelivery` and `@yielded/auth-cloudflare` with that service, choose `Password.resetLink({ url })` or `Password.resetCode()` for password management, pass a URL to `Email.makeLink`, and read link fragments with `EmailDelivery.parseLinkFragment`.
