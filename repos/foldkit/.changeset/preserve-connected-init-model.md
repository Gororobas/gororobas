---
'foldkit': patch
---

Preserve the supplied Model when `Update.combineSteps(model, steps)` applies Definition-owned child initialization Steps inside their registered Composition. Previously, a deferred init could replay the sequence from the enclosing update's original Model and discard parent changes made before `combineSteps`.

Data-first `modifyFields` also retains the source Model's registration evidence by inferring its shape from the source object rather than widening it from the transforms.

Initialization recipes created outside their registered graph remain passive. Deferred connected operations still use the active Model when interpreted, so a previously removed keyed child cannot be restored by replaying a captured Model.
