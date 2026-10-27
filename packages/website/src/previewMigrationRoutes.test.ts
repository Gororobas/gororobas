import { Option } from 'effect'
import { fromString as urlFromString } from 'foldkit/url'
import { afterEach, expect, test, vi } from 'vitest'

const previewRelease = JSON.stringify({
  schemaVersion: 1,
  channel: 'canary',
  sourceCommit: '0123456789abcdef0123456789abcdef01234567',
  uploadTag: 'foldkit-canary-upload-0123456789ab',
  packages: { foldkit: '1.2.3-canary.0123456789ab' },
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

test.each([
  {
    name: 'production',
    previewRelease: undefined,
    canaryCommit: undefined,
    isAvailable: false,
  },
  {
    name: 'main canary',
    previewRelease: undefined,
    canaryCommit: 'abc1234',
    isAvailable: false,
  },
  {
    name: 'integration preview',
    previewRelease,
    canaryCommit: undefined,
    isAvailable: true,
  },
])(
  'migration pages are available only in an integration preview: $name',
  async ({ previewRelease, canaryCommit, isAvailable }) => {
    vi.stubEnv('VITE_FOLDKIT_PREVIEW_RELEASE', previewRelease)
    vi.stubEnv('VITE_FOLDKIT_CANARY_COMMIT', canaryCommit)
    vi.resetModules()

    const Route = await import('./route')
    const { allPages } = await import('./docsNav')

    for (const [path, tag] of [
      ['/preview-migration', 'PreviewMigration'],
      ['/preview-upgrade', 'PreviewUpgrade'],
    ]) {
      const url = Option.getOrThrow(urlFromString(`${Route.SITE_URL}${path}`))

      expect(Route.urlToApplicationRoute(url)._tag).toBe(
        isAvailable ? tag : 'NotFound',
      )
      expect(allPages.some(page => page._tag === tag)).toBe(isAvailable)
    }
  },
)
