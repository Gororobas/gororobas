import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as GitHub from 'alchemy/GitHub'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'

const OWNER = 'Manzanita-Research'
const REPOSITORY = 'pleat'
const ZONE_NAME = 'manzanita.dev'
const TOKEN_NAME = 'pleat-docs-deploy'

/** What the docs Worker and Alchemy's state store need. The state store is a Worker with a
 *  Secrets Store binding, and Alchemy reads the account's workers.dev subdomain to find it. */
const ACCOUNT_PERMISSIONS = [
  'Workers Scripts Write',
  'Secrets Store Write',
  'Account Settings Read',
  'Workers Tail Read',
] as const

/** What the custom domain needs: Alchemy finds the zone by name, then attaches the hostname,
 *  which creates a DNS record and an edge certificate in that zone. */
const ZONE_PERMISSIONS = [
  'Zone Read',
  'Workers Routes Write',
  'DNS Write',
  'SSL and Certificates Write',
] as const

/** Mints the Cloudflare token the Deploy workflow uses and writes it, with the account id, to
 *  the repository's Actions secrets. Deploy it once from an admin profile, and again to rotate
 *  the token or change its permissions. */
export default Alchemy.Stack(
  'PleatSecrets',
  {
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment
    const zone = yield* Cloudflare.Zone.findZoneByName({
      accountId,
      name: ZONE_NAME,
    }).pipe(Effect.orDie)
    if (zone === undefined) {
      return yield* Effect.die(
        new Error(`Zone ${ZONE_NAME} is not in account ${accountId}.`),
      )
    }

    const account = `com.cloudflare.api.account.${accountId}` as const
    const deployToken = yield* Cloudflare.ApiToken.AccountApiToken('DeployToken', {
      name: TOKEN_NAME,
      accountId,
      policies: [
        {
          effect: 'allow',
          permissionGroups: [...ACCOUNT_PERMISSIONS],
          resources: { [account]: '*' },
        },
        {
          effect: 'allow',
          permissionGroups: [...ZONE_PERMISSIONS],
          resources: {
            [account]: { [`com.cloudflare.api.account.zone.${zone.id}`]: '*' },
          },
        },
      ],
    })

    yield* GitHub.Secret('CloudflareApiToken', {
      owner: OWNER,
      repository: REPOSITORY,
      name: 'CLOUDFLARE_API_TOKEN',
      value: deployToken.value,
    })
    yield* GitHub.Secret('CloudflareAccountId', {
      owner: OWNER,
      repository: REPOSITORY,
      name: 'CLOUDFLARE_ACCOUNT_ID',
      value: Redacted.make(accountId),
    })

    return { token: deployToken.name, zone: zone.name }
  }),
)
