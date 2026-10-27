import { Array } from 'effect'
import { appendFileSync, readdirSync, readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'

import {
  previewReadySummary,
  readPreviewReleaseManifest,
} from './lib/preview-release.mjs'
import {
  publicWorkspacePackages,
  readWorkspacePackages,
} from './lib/workspace-packages.mjs'

const fail = message => {
  throw new Error(message)
}

const REPO_ROOT = resolve(import.meta.dirname, '..')

const packages = publicWorkspacePackages(readWorkspacePackages(REPO_ROOT))

const readManifest = (path, target) =>
  readPreviewReleaseManifest({ path, target, packages })

const assetFiles = directory =>
  readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => resolve(entry.parentPath, entry.name))
    .filter(path => ['.html', '.js'].includes(extname(path)))

const assertEmbeddedExamplesMatch = (directory, target) => {
  const examplesDirectory = resolve(directory, 'example-apps-embed')
  const examples = readdirSync(examplesDirectory, {
    withFileTypes: true,
  }).filter(entry => entry.isDirectory())

  if (Array.isArrayEmpty(examples)) {
    return fail('preview website build has no embedded examples')
  }

  for (const example of examples) {
    const files = assetFiles(resolve(examplesDirectory, example.name))

    if (!files.some(path => readFileSync(path, 'utf8').includes(target))) {
      return fail(
        `embedded example ${example.name} does not contain build ${target}`,
      )
    }
  }
}

const verifyBuild = (manifestPath, target, directory) => {
  const manifest = readManifest(manifestPath, target)
  const publicManifestPath = resolve(directory, 'preview-release.json')
  const publicManifest = readManifest(publicManifestPath, target)

  if (JSON.stringify(publicManifest) !== JSON.stringify(manifest)) {
    return fail(
      'built preview release manifest differs from the verified input',
    )
  }

  const expectedValues = new Set([
    manifest.sourceCommit,
    ...Object.entries(manifest.packages).map(
      ([name, version]) => `${name}@${version}`,
    ),
  ])

  for (const path of assetFiles(directory)) {
    const contents = readFileSync(path, 'utf8')

    for (const value of expectedValues) {
      if (contents.includes(value)) {
        expectedValues.delete(value)
      }
    }
  }

  if (expectedValues.size > 0) {
    return fail(
      `built preview assets do not contain ${[...expectedValues].join(', ')}`,
    )
  }

  assertEmbeddedExamplesMatch(directory, target)
}

const main = () => {
  const command = process.argv.at(2)
  const manifestPath = process.argv.at(3)
  const target = process.argv.at(4)

  if (manifestPath === undefined || target === undefined) {
    return fail(
      'Usage: node scripts/preview-release-manifest.mjs verify|verify-build|summary <manifest> <commit> [value]',
    )
  }

  if (command === 'verify') {
    process.stdout.write(
      `${JSON.stringify(readManifest(manifestPath, target))}\n`,
    )
    return
  }

  if (command === 'verify-build') {
    const directory = process.argv.at(5)

    if (directory === undefined) {
      return fail('verify-build requires the built website directory')
    }

    verifyBuild(manifestPath, target, directory)
    return
  }

  if (command === 'summary') {
    const deploymentUrl = process.argv.at(5)
    const summaryPath = process.env['GITHUB_STEP_SUMMARY']

    if (deploymentUrl === undefined || summaryPath === undefined) {
      return fail('summary requires a deployment URL and GITHUB_STEP_SUMMARY')
    }

    appendFileSync(
      summaryPath,
      previewReadySummary(readManifest(manifestPath, target), deploymentUrl),
    )
    return
  }

  return fail(`Unknown preview release manifest command: ${String(command)}`)
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.stack : String(error)

  console.error(`[preview-release] FAIL ${message}`)
  process.exitCode = 1
}
