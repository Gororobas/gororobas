---
'foldkit': patch
---

Reduce repeated type instantiation during Block assembly validation by reusing projected requirement channels. Preserve handler-completeness checks, child-registration evidence, and diagnostics for union and partial types.
