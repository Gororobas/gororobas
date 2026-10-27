import type { WorkspacePackage } from './workspace-packages.mjs'

export type PreviewReleaseManifest = Readonly<{
  schemaVersion: 1
  channel: 'canary'
  sourceCommit: string
  uploadTag: string
  packages: Readonly<Record<string, string>>
}>

type ManifestInput = Readonly<{
  commit: string
  packages: ReadonlyArray<WorkspacePackage>
}>

type ValidationInput = Readonly<{
  manifest: unknown
  target: string
  packages: ReadonlyArray<WorkspacePackage>
}>

export const previewUploadTag: (commit: string) => string

export const previewReleaseManifest: (
  input: ManifestInput,
) => PreviewReleaseManifest

export const writePreviewReleaseManifest: (
  path: string,
  input: ManifestInput,
) => PreviewReleaseManifest

export const validatePreviewReleaseManifest: (
  input: ValidationInput,
) => PreviewReleaseManifest

export const readPreviewReleaseManifest: (
  input: Omit<ValidationInput, 'manifest'> & Readonly<{ path: string }>,
) => PreviewReleaseManifest

export const previewScaffoldCommand: (
  manifest: PreviewReleaseManifest,
) => string

export const previewInstallCommand: (manifest: PreviewReleaseManifest) => string

export const previewReadySummary: (
  manifest: PreviewReleaseManifest,
  deploymentUrl: string,
) => string
