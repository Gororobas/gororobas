import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { injectBridgeScript } from '../build-examples.ts'
import {
  previewInstallCommand,
  previewReadySummary,
  previewReleaseManifest,
  previewScaffoldCommand,
  validatePreviewReleaseManifest,
} from './preview-release.mjs'

const COMMIT = '0123456789abcdef0123456789abcdef01234567'

const packages = [
  {
    packageJson: { name: 'foldkit', version: '1.2.3' },
  },
  {
    packageJson: { name: '@foldkit/ui', version: '2.3.4' },
  },
  {
    packageJson: { name: 'create-foldkit-app', version: '3.4.5' },
  },
]

const manifest = previewReleaseManifest({
  commit: COMMIT,
  packages: packages.map(pkg => ({
    packageJson: {
      ...pkg.packageJson,
      version: `${pkg.packageJson.version}-canary.${COMMIT.slice(0, 12)}`,
    },
  })),
})

test('validates the complete commit-addressed preview snapshot', () => {
  assert.deepEqual(
    validatePreviewReleaseManifest({ manifest, target: COMMIT, packages }),
    manifest,
  )
  assert.equal(manifest.uploadTag, 'foldkit-canary-upload-0123456789ab')
})

test('rejects a preview manifest from another commit', () => {
  assert.throws(
    () =>
      validatePreviewReleaseManifest({
        manifest,
        target: '1123456789abcdef0123456789abcdef01234567',
        packages,
      }),
    /belongs to .* not/,
  )
})

test('rejects missing, extra, and mismatched package versions', () => {
  const cases = [
    {
      ...manifest,
      packages: { ...manifest.packages, foldkit: '1.2.4-canary.0123456789ab' },
    },
    {
      ...manifest,
      packages: Object.fromEntries(
        Object.entries(manifest.packages).filter(
          ([name]) => name !== 'foldkit',
        ),
      ),
    },
    {
      ...manifest,
      packages: { ...manifest.packages, unexpected: '1.0.0' },
    },
  ]

  for (const candidate of cases) {
    assert.throws(() =>
      validatePreviewReleaseManifest({
        manifest: candidate,
        target: COMMIT,
        packages,
      }),
    )
  }
})

test('reports exact scaffold and install commands from verified versions', () => {
  assert.equal(
    previewScaffoldCommand(manifest),
    'npx create-foldkit-app@3.4.5-canary.0123456789ab',
  )
  assert.equal(
    previewInstallCommand(manifest),
    'pnpm add --save-exact "@foldkit/ui@2.3.4-canary.0123456789ab" "foldkit@1.2.3-canary.0123456789ab"',
  )

  const summary = previewReadySummary(manifest, 'https://example.vercel.app')

  assert.match(summary, /Integration preview ready/)
  assert.match(summary, new RegExp(COMMIT))
  assert.match(summary, /https:\/\/example\.vercel\.app\//)
  assert.match(summary, /create-foldkit-app@3\.4\.5-canary\.0123456789ab/)
  assert.match(summary, /@foldkit\/ui@2\.3\.4-canary\.0123456789ab/)
})

test('pins both migration paths and prompts to the verified deployment and package set', () => {
  const summary = previewReadySummary(manifest, 'https://example.vercel.app')

  for (const path of [
    '/preview-migration',
    '/preview-upgrade',
    '/preview-migration.md',
    '/preview-upgrade.md',
    '/preview-release.json',
  ]) {
    assert.ok(summary.includes(`https://example.vercel.app${path}`), path)
  }
  assert.ok(summary.includes(`Target source commit: ${COMMIT}`))
  assert.ok(summary.includes('Agent prompt: migrate a stable application'))
  assert.ok(summary.includes('Agent prompt: upgrade an earlier preview'))
  assert.ok(summary.includes('Record the installed versions'))
  assert.ok(summary.includes('preserving dependency/devDependency placement'))
  assert.ok(summary.includes('Do not install unused packages'))
  for (const [name, version] of Object.entries(manifest.packages)) {
    assert.ok(summary.includes(`${name}@${version}`), name)
  }
  assert.ok(!summary.includes('@latest'))
  assert.ok(!summary.includes('https://foldkit.dev/preview-'))
})

test('gives each migration prompt its complete independent release target', () => {
  const deployment = 'https://example.vercel.app'
  const summary = previewReadySummary(manifest, deployment)
  const prompts = new Map()

  for (const [, title, prompt] of summary.matchAll(
    /<summary>(Agent prompt:[^<]+)<\/summary>\s*```text\n([\s\S]*?)\n```/g,
  )) {
    prompts.set(title, prompt)
  }

  assert.equal(prompts.size, 2)
  const guides = {
    'Agent prompt: migrate a stable application': '/preview-migration.md',
    'Agent prompt: upgrade an earlier preview': '/preview-upgrade.md',
  }

  for (const [title, path] of Object.entries(guides)) {
    const prompt = prompts.get(title)
    assert.ok(prompt, title)
    assert.ok(prompt.includes(`Target source commit: ${COMMIT}`), title)
    assert.ok(prompt.includes(`Migration guide: ${deployment}${path}`), title)
    assert.ok(
      prompt.includes(
        `Verified package manifest: ${deployment}/preview-release.json`,
      ),
      title,
    )
    for (const [name, version] of Object.entries(manifest.packages)) {
      assert.ok(prompt.includes(`${name}@${version}`), `${title}: ${name}`)
    }
    assert.ok(prompt.includes('package.json, the lockfile'), title)
    assert.ok(
      prompt.includes('preserving dependency/devDependency placement'),
      title,
    )
    assert.ok(prompt.includes('Do not install unused packages'), title)
    assert.ok(
      prompt.includes('Edit all installed Foldkit entries before one install'),
      title,
    )
  }

  assert.ok(
    summary.includes(
      `Manifest: [preview-release.json](${deployment}/preview-release.json)`,
    ),
  )
  assert.ok(summary.includes('1. **Existing stable Foldkit application:**'))
  assert.ok(summary.includes('2. **Application using an earlier preview:**'))
  assert.ok(
    summary.includes(
      `3. **New project:** \`${previewScaffoldCommand(manifest)}\``,
    ),
  )
})

test('marks embedded examples with the exact website build', context => {
  const directory = mkdtempSync(resolve(tmpdir(), 'foldkit-example-build-'))
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  const nestedDirectory = resolve(directory, 'nested')
  const indexPath = resolve(nestedDirectory, 'index.html')
  const buildId = `${COMMIT}/preview?attempt=2`

  mkdirSync(nestedDirectory)
  writeFileSync(indexPath, '<html><head></head><body></body></html>')
  injectBridgeScript(directory, buildId)

  assert.ok(
    readFileSync(indexPath, 'utf8').includes(
      `bridge.js?build=${encodeURIComponent(buildId)}`,
    ),
  )
})

test('links optional editor guidance to the verified preview deployment', () => {
  const deployment = 'https://example.vercel.app'
  const summary = previewReadySummary(manifest, deployment)

  assert.ok(summary.includes('### Editor performance'))
  assert.ok(
    summary.indexOf('### Package versions') >
      summary.indexOf('### Editor performance'),
  )
  assert.ok(
    summary.indexOf('### Agent prompts') >
      summary.indexOf('### Package versions'),
  )
  assert.ok(
    summary.includes('Large Block compositions can still cause editor latency'),
  )
  assert.ok(
    summary.includes(
      'We recommend trying the optional tsrs language-server setup',
    ),
  )
  assert.ok(
    summary.includes(
      `${deployment}/preview-upgrade#optional-editor-setup-tsrs`,
    ),
  )
})
