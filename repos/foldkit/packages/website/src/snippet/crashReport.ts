import { Option } from 'effect'
import { Program, Runtime } from 'foldkit'

import * as Sentry from '@sentry/browser'

import { ApplicationBlock } from './application'

const program = Program.make({
  block: ApplicationBlock,
  crash: {
    report: ({ error, model, message }) => {
      Sentry.captureException(error, {
        extra: { model, message: Option.getOrUndefined(message) },
      })
    },
  },
  container: document.getElementById('root'),
})

Runtime.run(program)
