import createAuth from '@gel/auth-nextjs/app'
import { createClient, IsolationLevel } from 'gel'
import { BASE_URL } from './utils/config'

export const client = createClient({
  // Note: when developing locally you will need to set tls security to
  // insecure, because the development server uses self-signed certificates
  // which will cause api calls with the fetch api to fail.
  tlsSecurity: 'insecure',
  host: 'localhost',
  port: 5656,
  password: process.env.GEL_PASSWORD
}).withTransactionOptions({
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
