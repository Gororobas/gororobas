# Yielded Auth glossary

Use these terms consistently in public APIs, implementations, and review.

| Term                  | Meaning                                                                             |
| --------------------- | ----------------------------------------------------------------------------------- |
| Subject               | The application's authenticated identity, identified through its own key codec.     |
| Identity authority    | The application-owned boundary that selects, provisions, and revises subjects.      |
| Authentication method | A strategy that verifies evidence and contributes authentication.                   |
| Session               | The authenticated state issued through the configured session authority.            |
| Authentication flow   | One attempt whose identity and captured policy govern completion and replay.        |
| Operation             | A schema-defined action with explicit caller requirements and typed results.        |
| Request binding       | A private bearer binding a flow or command to the initiating request.               |
| Proof                 | A scoped, expiring challenge used to establish control over a delivery destination. |
| Connected account     | An application-authorized provider grant, distinct from login authority.            |
| Persistence owner     | The transaction or batch authority that commits a workflow transition.              |
| Receipt               | Durable evidence of the original command's decision, used for safe exact replay.    |
| Credential command    | Private credential delivery instructions, never ordinary public result data.        |

The npm package is `@yielded/auth`. Public modules use PascalCase names; the package
root exposes same-name namespaces and explicit direct subpaths. Service identifiers
retain `effect-auth/` and their owning module path; protocol identifiers and cookie
names are independent of the npm package name.
