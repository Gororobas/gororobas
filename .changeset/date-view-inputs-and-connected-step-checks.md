---
'foldkit': patch
---

Accept native Date values in nested ViewInputs while continuing to reject nested application callbacks. Invalid-input diagnostics identify callback paths when available and otherwise retain a generic rejection.

Preserve connected-Step registration checks when `Update.combineSteps` mixes a Binding operation with a generic no-op. Invalid calls now explain the registered Composition boundary and deferred-Step repair, while valid calls retain their exact Model, Command, and registration channels. Empty Step lists retain the supplied Model type, and ordinary inline Steps retain contextual Model typing.
