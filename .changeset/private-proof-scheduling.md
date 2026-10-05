---
"@yielded/auth": patch
---

Deliver proofs through a built-in bounded worker so requests return without waiting for email or SMS provider acceptance. BEHAVIOR CHANGE: keep Auth's Layer alive across requests and use prepared receipts' `schedule` continuation; provide `Proofs.ProofDispatchScheduler.layerInline` only for trusted workflows that must await delivery.
