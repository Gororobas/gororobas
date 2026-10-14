# @yielded/drizzle-effect-v4-patch

Patch Drizzle's Effect integration for use with Yielded Auth in a Bun project.
The CLI saves a native Bun patch and installs it; subsequent installs apply it
from your lockfile. Your application's Effect package stays unchanged.

## Apply

Install your application's dependencies first, then run from the workspace that
depends on Drizzle:

```sh
bun add drizzle-orm@1.0.0-rc.4
bunx @yielded/drizzle-effect-v4-patch@beta patch
```

Commit `package.json`, `bun.lock` (or `bun.lockb`), and the generated file in
`patches/`. No lifecycle hook or runtime dependency on this CLI is needed.
Use `--dir path/to/workspace` to select another workspace; patch configuration
belongs to the nearest Bun lockfile's directory.

The patch targets the released `drizzle-orm@1.0.0-rc.4`. Other versions, including
commit snapshots, are rejected. Yielded Auth's Drizzle adapter accepts this release.
The CLI supports Bun projects and refuses to overwrite a conflicting patch.
If installation fails after saving configuration, rerun the command to finish.

## Remove

Remove this tool's patch before changing the installed Drizzle version:

```sh
bunx @yielded/drizzle-effect-v4-patch@beta unpatch
```

The command removes only this tool's unchanged patch. Commit the manifest,
lockfile, and patch deletion, and check your adapter's declared peer requirements
before selecting another Drizzle version.
