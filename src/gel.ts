import createAuth from '@gel/auth-nextjs/app'
import { type ConnectOptions, createClient, IsolationLevel } from 'gel'
import { BASE_URL } from './utils/config'

export const GEL_CONNECTION_OPTIONS: ConnectOptions = {
  tlsSecurity: 'insecure',
  host: 'gel',
  port: 5656,
  user: 'edgedb',
  password: process.env.GEL_PASSWORD,
}

export const client = createClient(
  GEL_CONNECTION_OPTIONS,
).withTransactionOptions({
  /** @docs https://www.geldata.com/updates#automatically-lower-transaction-isolation */
  isolation: IsolationLevel.PreferRepeatableRead,
})

export const auth = createAuth(client, {
  baseUrl: BASE_URL,
  magicLinkFailurePath: '/entrar?error=magic-link',
  authRoutesPath: '/auth',
  authCookieName: 'gororobas--session',
  pkceVerifierCookieName: 'gororobas--pkce-verifier',
})
