# @yielded/drizzle-effect-v4-patch

Drizzle RC4's Effect integration still uses APIs removed from the current stable
Effect release. This temporary patch lets you use Drizzle with the Effect version
required by Yielded Auth until Drizzle ships a compatible release.

The CLI saves a native Bun patch and runs `bun install`; subsequent installs apply
it from your lockfile. It updates Drizzle's SQL type imports, error classes, and
schema length helper in its ESM and CommonJS artifacts. Your application's Effect
package stays unchanged.

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

Before upgrading to a compatible upstream Drizzle release:

```sh
bunx @yielded/drizzle-effect-v4-patch@beta unpatch
```

Then upgrade Drizzle and commit the manifest, lockfile, and patch deletion.
The command removes only this tool's unchanged patch. This package can be retired
once the application's selected Drizzle release works with the Effect version
required by its adapter.
