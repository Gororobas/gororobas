import { Option, Schema, pipe } from 'effect'
import { Calendar } from 'foldkit'
import { expect, given, role, scene } from 'foldkit/scene'
import * as Url from 'foldkit/url'
import { describe, test } from 'vitest'

import { ApplicationComposition } from '../../composition'
import { Deployment } from '../../deployment'
import { init } from '../../init'
import { update } from '../../update'
import { view } from '../../view/view'
import { ApiData, ApiModule, ApiType } from './domain'
import { Message as ApiReferenceMessage } from './message'
const seededData = ApiData.make({
  parsedApi: {
    modules: [
      ApiModule.make({
        name: 'Command',
        functions: [],
        types: [
          ApiType.make({
            name: 'SeededCommand',
            description: Option.none(),
            typeDefinition: 'type SeededCommand = string',
            sourceUrl: Option.none(),
          }),
        ],
        interfaces: [],
        variables: [],
      }),
    ],
  },
  highlights: {},
})
const url = pipe(
  Url.fromString('https://foldkit.dev/api-reference/command'),
  Option.getOrThrow,
)
describe('prerendered API Reference', () => {
  test('displays the seeded module during refresh and after full-load failure', () => {
    const initialization = init(
      {
        currentYear: 2026,
        today: Calendar.make(2026, 8, 30),
        deployment: Deployment.Canary({ commit: 'test' }),
        maybeApiData: Option.some(seededData),
        maybeExampleSources: Option.none(),
      },
      url,
    )
    scene(
      { update, view },
      given(initialization.model),
      expect(role('heading', { name: 'SeededCommand' })).toExist(),
    )
    const failedLoad = update(
      initialization.model,
      Schema.decodeSync(ApplicationComposition.Message)({
        _tag: 'GotApiReferenceMessage',
        placement: 'apiReference',
        generation: 0,
        message: ApiReferenceMessage.FailedLoadApiData({ error: 'Offline' }),
      }),
    )
    scene(
      { update, view },
      given(failedLoad.model),
      expect(role('heading', { name: 'SeededCommand' })).toExist(),
    )
  })
})
