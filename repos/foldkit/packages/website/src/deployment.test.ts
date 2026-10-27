import { describe, expect, test } from 'vitest'

import {
  Deployment,
  deploymentFromCanaryCommit,
  deploymentFromEnvironment,
  isTelemetryEnabled,
} from './deployment'

describe('deploymentFromCanaryCommit', () => {
  test('uses the production deployment without canary metadata', () => {
    expect(deploymentFromCanaryCommit(undefined)).toEqual({
      _tag: 'Production',
    })
  })

  test('identifies the canary commit', () => {
    expect(deploymentFromCanaryCommit('abc1234')).toEqual({
      _tag: 'Canary',
      commit: 'abc1234',
    })
  })

  test('rejects an empty canary commit', () => {
    expect(() => deploymentFromCanaryCommit('')).toThrow()
  })

  test('identifies a package-matched integration preview', () => {
    expect(
      deploymentFromEnvironment(
        undefined,
        JSON.stringify({
          schemaVersion: 1,
          channel: 'canary',
          sourceCommit: '0123456789abcdef0123456789abcdef01234567',
          uploadTag: 'foldkit-canary-upload-0123456789ab',
          packages: {
            foldkit: '1.2.3-canary.0123456789ab',
          },
        }),
      ),
    ).toMatchObject({
      _tag: 'Preview',
      release: {
        sourceCommit: '0123456789abcdef0123456789abcdef01234567',
      },
    })
  })

  test('rejects conflicting non-production deployment metadata', () => {
    expect(() => deploymentFromEnvironment('abc1234', '{}')).toThrow(
      'cannot be both canary and preview',
    )
  })
})

describe('isTelemetryEnabled', () => {
  test('enables telemetry only in production', () => {
    expect(isTelemetryEnabled(Deployment.Production())).toBe(true)
    expect(isTelemetryEnabled(Deployment.Canary({ commit: 'abc1234' }))).toBe(
      false,
    )
    expect(
      isTelemetryEnabled(
        Deployment.Preview({
          release: {
            schemaVersion: 1,
            channel: 'canary',
            sourceCommit: '0123456789abcdef0123456789abcdef01234567',
            uploadTag: 'foldkit-canary-upload-0123456789ab',
            packages: { foldkit: '1.2.3-canary.0123456789ab' },
          },
        }),
      ),
    ).toBe(false)
  })
})
