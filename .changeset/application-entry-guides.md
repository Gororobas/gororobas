---
'@foldkit/devtools': patch
'@foldkit/devtools-mcp': patch
'@foldkit/markdown': patch
'@foldkit/vite-plugin': patch
---

Show `ApplicationDefinition`, `ApplicationComposition`, `ApplicationBlock`, and `Program.make` in DevTools setup guidance, installer instructions, the Vite plugin's build-id guidance and fixtures, and the Markdown island example. Migrate the DevTools overlay to the same completed root Block and element Program. Root graph assembly through the ordinary Block Definition and Composition lives in `application.ts`; host configuration, Service provision through `program.provide`, and browser startup remain in `entry.ts`.
