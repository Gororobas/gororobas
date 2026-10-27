import { describe, expect, test } from 'vitest'

import { decodePreviewRelease, scaffoldCommand } from './previewRelease'

const release = decodePreviewRelease(
  JSON.stringify({
    schemaVersion: 1,
    channel: 'canary',
    sourceCommit: '0123456789abcdef0123456789abcdef01234567',
    uploadTag: 'foldkit-canary-upload-0123456789ab',
    packages: {
      foldkit: '1.2.3-canary.0123456789ab',
      '@foldkit/ui': '2.3.4-canary.0123456789ab',
      'create-foldkit-app': '3.4.5-canary.0123456789ab',
    },
  }),
)

describe('PreviewRelease', () => {
  test('decodes the verified build metadata', () => {
    expect(release.sourceCommit).toBe(
      '0123456789abcdef0123456789abcdef01234567',
    )
  })

  test('builds the exact scaffold command from the release versions', () => {
    expect(scaffoldCommand(release)).toBe(
      'npx create-foldkit-app@3.4.5-canary.0123456789ab',
    )
  })

  test('rejects incomplete metadata', () => {
    expect(() => decodePreviewRelease('{}')).toThrow()
  })
})
