import { Array } from 'effect'
import { readFileSync, writeFileSync } from 'node:fs'
import semver from 'semver'

import { canaryVersion } from './package-version.mjs'

const FULL_GIT_COMMIT_PATTERN = /^[0-9a-f]{40}$/

const fail = message => {
  throw new Error(message)
}

const sortedEntries = packages =>
  Object.entries(packages).sort(([left], [right]) => left.localeCompare(right))

export const previewUploadTag = commit => {
  if (!FULL_GIT_COMMIT_PATTERN.test(commit)) {
    return fail(`invalid preview source commit ${commit}`)
  }

  return `foldkit-canary-upload-${commit.slice(0, 12)}`
}

export const previewReleaseManifest = ({ commit, packages }) => ({
  schemaVersion: 1,
  channel: 'canary',
  sourceCommit: commit,
  uploadTag: previewUploadTag(commit),
  packages: Object.fromEntries(
    packages.map(pkg => [pkg.packageJson.name, pkg.packageJson.version]),
  ),
})

export const writePreviewReleaseManifest = (path, input) => {
  const manifest = previewReleaseManifest(input)

  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`)

  return manifest
}

const assertManifestShape = manifest => {
  if (typeof manifest !== 'object' || manifest === null) {
    return fail('preview release manifest must be an object')
  }
  if (manifest.schemaVersion !== 1) {
    return fail('preview release manifest must use schemaVersion 1')
  }
  if (manifest.channel !== 'canary') {
    return fail('preview release manifest must describe a canary snapshot')
  }
  if (!FULL_GIT_COMMIT_PATTERN.test(manifest.sourceCommit)) {
    return fail('preview release manifest has an invalid source commit')
  }
  if (manifest.uploadTag !== previewUploadTag(manifest.sourceCommit)) {
    return fail('preview release manifest has the wrong upload tag')
  }
  if (typeof manifest.packages !== 'object' || manifest.packages === null) {
    return fail('preview release manifest must contain package versions')
  }
}

export const validatePreviewReleaseManifest = ({
  manifest,
  target,
  packages,
}) => {
  assertManifestShape(manifest)

  if (!FULL_GIT_COMMIT_PATTERN.test(target)) {
    return fail(`invalid preview target commit ${target}`)
  }
  if (manifest.sourceCommit !== target) {
    return fail(
      `preview release manifest belongs to ${manifest.sourceCommit}, not ${target}`,
    )
  }

  const expectedVersions = new Map(
    packages.map(pkg => [
      pkg.packageJson.name,
      canaryVersion(pkg.packageJson.version, target),
    ]),
  )
  const manifestEntries = sortedEntries(manifest.packages)

  if (manifestEntries.length !== expectedVersions.size) {
    return fail(
      `preview release manifest has ${String(manifestEntries.length)} packages; expected ${String(expectedVersions.size)}`,
    )
  }

  for (const [name, version] of manifestEntries) {
    const expectedVersion = expectedVersions.get(name)

    if (expectedVersion === undefined) {
      return fail(`preview release manifest contains unknown package ${name}`)
    }
    if (!semver.valid(version)) {
      return fail(
        `preview release manifest has invalid version ${name}@${String(version)}`,
      )
    }
    if (version !== expectedVersion) {
      return fail(
        `preview release manifest has ${name}@${version}; expected ${name}@${expectedVersion}`,
      )
    }
  }

  for (const name of expectedVersions.keys()) {
    if (!(name in manifest.packages)) {
      return fail(`preview release manifest is missing ${name}`)
    }
  }

  return manifest
}

export const readPreviewReleaseManifest = ({ path, target, packages }) => {
  const manifest = JSON.parse(readFileSync(path, 'utf8'))

  return validatePreviewReleaseManifest({ manifest, target, packages })
}

export const previewScaffoldCommand = manifest => {
  const version = manifest.packages['create-foldkit-app']

  if (version === undefined) {
    return fail('preview release manifest has no create-foldkit-app package')
  }

  return `npx create-foldkit-app@${version}`
}

export const previewInstallCommand = manifest => {
  const specs = sortedEntries(manifest.packages)
    .filter(([name]) => name !== 'create-foldkit-app')
    .map(([name, version]) => `${name}@${version}`)

  if (Array.isArrayEmpty(specs)) {
    return fail('preview release manifest has no installable packages')
  }

  return `pnpm add --save-exact ${specs.map(spec => `"${spec}"`).join(' ')}`
}

const previewMigrationPrompt = (manifest, deploymentUrl, source) => {
  const guidePath =
    source === 'stable' ? '/preview-migration.md' : '/preview-upgrade.md'
  const guide = new URL(guidePath, deploymentUrl).href
  const releaseManifest = new URL('/preview-release.json', deploymentUrl).href
  const versions = sortedEntries(manifest.packages)
    .map(([name, version]) => `${name}@${version}`)
    .join('\n')

  return [
    source === 'stable'
      ? 'Migrate this existing Foldkit application from its installed stable API to the Blocks and Effect Layers preview.'
      : 'Upgrade this existing Foldkit preview application directly to the target preview below.',
    '',
    `Target source commit: ${manifest.sourceCommit}`,
    `Migration guide: ${guide}`,
    `Verified package manifest: ${releaseManifest}`,
    '',
    'First inspect package.json, the lockfile, the source tree and existing project instructions. Record the installed versions and, for a preview, its source commit. Preserve concurrent work. Read the complete target guide, including its before/after examples, before editing. Resolve supporting documentation paths on this same deployment so you stay on the target API.',
    '',
    'Fetch the manifest and confirm its sourceCommit and package map match this target. Upgrade every Foldkit package already used by the project together, preserving dependency/devDependency placement and exact versions. Edit all installed Foldkit entries before one install. Do not install unused packages. Check declared peer requirements before changing Effect or other dependencies.',
    '',
    'Target package map:',
    versions,
    '',
    'If the project already vendors repos/foldkit, repin it to the full target commit. Refresh an existing managed FOLDKIT.md snapshot and any installed Foldkit skills from that snapshot, preserving project-specific AGENTS.md instructions. Otherwise use the target guide and commit-pinned source directly; do not add a subtree or instruction files as an unrequested migration step. Use the target guide and source, not current main or remembered preview APIs.',
    '',
    source === 'stable'
      ? 'Migrate directly to the final handler Layer, Block/Composition, Binding and Program APIs. Preserve application behavior, Model ownership, initialization Commands, OutMessage policies, occurrence identity and lifecycle cleanup.'
      : 'Apply the required changes from the installed preview to the target. Separate optional conveniences from required migration; preserve existing behavior and do not redo already-correct Block wiring.',
    '',
    'Do not bypass type errors with casts, ts-ignore, runtime-only workarounds or weakened configuration. Inspect matching emitted declarations and examples; report a concrete blocker when an exact contract cannot be preserved.',
    '',
    'Run the project typecheck including tests, lint, tests and production build. Exercise its actual browser, SSR/SSG or embedding path where applicable. Use installed package artifacts rather than workspace source aliases. Report the source and target versions, changes made, checks run and any remaining gaps. Do not commit, push or deploy without my request.',
  ].join('\n')
}

export const previewReadySummary = (manifest, deploymentUrl) => {
  const url = new URL(deploymentUrl)

  if (url.protocol !== 'https:') {
    return fail('preview deployment URL must use HTTPS')
  }

  const stableGuide = new URL('/preview-migration', url).href
  const previewGuide = new URL('/preview-upgrade', url).href
  const stablePrompt = previewMigrationPrompt(manifest, url, 'stable')
  const previewPrompt = previewMigrationPrompt(manifest, url, 'preview')
  const packages = sortedEntries(manifest.packages)
    .map(
      ([name, version]) =>
        `- [\`${name}@${version}\`](https://www.npmjs.com/package/${name}/v/${version})`,
    )
    .join('\n')

  return (
    `## Integration preview ready\n\n` +
    `Source: [\`${manifest.sourceCommit}\`](https://github.com/foldkit/foldkit/commit/${manifest.sourceCommit})\n\n` +
    `Website: [${url.href}](${url.href})\n\n` +
    `Manifest: [preview-release.json](${new URL('/preview-release.json', url).href})\n\n` +
    `### Choose your starting point\n\n` +
    `1. **Existing stable Foldkit application:** [Complete migration guide](${stableGuide})\n` +
    `2. **Application using an earlier preview:** [Previous-preview upgrade guide](${previewGuide})\n` +
    `3. **New project:** \`${previewScaffoldCommand(manifest)}\`\n\n` +
    `<details>\n<summary>Complete package-set reference</summary>\n\n` +
    `This command installs the entire set as production dependencies; it is a snapshot reference, not an upgrade command for an existing project.\n\n` +
    `\`${previewInstallCommand(manifest)}\`\n\n</details>\n\n` +
    `For an existing application, update only its installed Foldkit packages and preserve dependency/devDependency placement.\n\n` +
    `### Editor performance\n\n` +
    `Large Block compositions can still cause editor latency. We recommend trying the optional tsrs language-server setup, which improved responsiveness in our Neovim use. See the [editor tooling guide](${new URL('/preview-upgrade#optional-editor-setup-tsrs', url).href}) for setup, the tested version and limitations.\n\n` +
    `### Package versions\n\n${packages}\n\n` +
    `### Agent prompts\n\n` +
    `<details>\n<summary>Agent prompt: migrate a stable application</summary>\n\n\`\`\`text\n${stablePrompt}\n\`\`\`\n\n</details>\n\n` +
    `<details>\n<summary>Agent prompt: upgrade an earlier preview</summary>\n\n\`\`\`text\n${previewPrompt}\n\`\`\`\n\n</details>\n`
  )
}
