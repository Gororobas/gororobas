import { Server } from 'foldkit/experimental'

import { ApplicationBlock } from './blockProfile'

export const render = () => Server.renderToString(ApplicationBlock, {}, {})
