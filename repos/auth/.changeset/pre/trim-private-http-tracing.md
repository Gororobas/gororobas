---
"@yielded/auth": patch
---

Reduce HTTP transport tracing overhead while retaining public request and operation spans. Remove internal body-reading, command-delivery, and admission helper spans and their function stack enrichment.
