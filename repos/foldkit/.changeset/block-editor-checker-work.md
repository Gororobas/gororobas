---
'foldkit': patch
---

Reduce repeated TypeScript work during Block assembly and editor requests without changing the consumer API. Infer exact implementations before validating them, defer overload validation until implementation types resolve, reuse handler and delivery indexes, and represent HTML Attributes as an explicit union.

Reject incompatible same-named Command handlers inside generic Block factories. The handler check no longer depends on TypeScript first proving that the contracts form a union.
