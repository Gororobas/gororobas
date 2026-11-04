import type * as Arr from "effect/Array";
import * as Context from "effect/Context";
import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiError from "effect/http-api/HttpApiError";
import type * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import * as HttpApiMiddleware from "effect/http-api/HttpApiMiddleware";
import * as HttpApiSecurity from "effect/http-api/HttpApiSecurity";
import * as Schema from "effect/Schema";

const validScope = Schema.isPattern(/^[\x21\x23-\x5B\x5D-\x7E]{1,128}$/);
const brand = Schema.brand("effect-auth/OAuthScope");

/** A validated OAuth scope. Wire values remain strings. */
export const OAuthScope = Schema.String.check(validScope).pipe(brand);

export type OAuthScope<Name extends string = string> = Name & typeof OAuthScope.Type;

/** Declare a scope while preserving its literal name and nominal type. */
export const make = <const Name extends string>(name: Name): OAuthScope<Name> =>
  Schema.Literal(name).check(validScope).pipe(brand).make(name);

/** A scope with application-authored text for consent and scope pages.
 * Escape the description when rendering it.
 */
export interface Described<Scope extends OAuthScope = OAuthScope> {
  readonly name: Scope;
  readonly description: string;
}

type Entry<Scope extends OAuthScope> = Scope | Described<Scope>;

/** Access must hold every `allOf` scope and, when `anyOf` is present, at least one
 * `anyOf` scope. Names match exactly; `{ allOf: [] }` accepts any valid access.
 * Challenges advertise `allOf` and the first `anyOf` scope, so list the narrowest
 * alternative first. Add `satisfies Requirement<Scope>` to check literal names.
 */
export type Requirement<Scope extends OAuthScope = OAuthScope> =
  | {
      readonly allOf: ReadonlyArray<Entry<Scope>>;
      readonly anyOf?: Arr.NonEmptyReadonlyArray<Entry<Scope>>;
    }
  | {
      readonly allOf?: ReadonlyArray<Entry<Scope>>;
      readonly anyOf: Arr.NonEmptyReadonlyArray<Entry<Scope>>;
    };

/** HttpApiGroup or HttpApiEndpoint scope requirement enforced by `RequireAccess`.
 * An endpoint's requirement replaces its group's; HttpApi-level requirements are rejected.
 */
export class Required
  extends /* @__PURE__ */ Context.Service<Required, Requirement>()(
    "effect-auth/OAuthScope/Required",
  ) {}

/** Shared bearer security for endpoints with a `Required` requirement. Attach it after
 * adding endpoints. Clients need no implementation; an authorization server's
 * `securityLayer(api)` implements it.
 */
export class RequireAccess
  extends /* @__PURE__ */ HttpApiMiddleware.Service<RequireAccess>()(
    "effect-auth/OAuthScope/RequireAccess",
    {
      security: { bearer: HttpApiSecurity.bearer },
      error: [
        HttpApiError.UnauthorizedNoContent,
        HttpApiError.ForbiddenNoContent,
        HttpApiError.ServiceUnavailableNoContent,
      ],
    },
  ) {}

/** Described scopes from group and endpoint requirements, by name in declaration order;
 * the first description wins. Pure and synchronous, so it can run at module load.
 */
export const catalog = <Id extends string, Groups extends HttpApiGroup.Constraint>(
  api: HttpApi.HttpApi<Id, Groups>,
): ReadonlyArray<Described> => {
  const described = new Map<string, Described>();

  const collect = (annotations: Context.Context<never>) => {
    const requirement = Context.getOrUndefined(annotations, Required);

    for (const entry of [...(requirement?.allOf ?? []), ...(requirement?.anyOf ?? [])])
      if (typeof entry !== "string" && !described.has(entry.name))
        described.set(entry.name, { name: entry.name, description: entry.description });
  };

  HttpApi.reflect(api, {
    onGroup: ({ group }) => collect(group.annotations),
    onEndpoint: ({ endpoint }) => collect(endpoint.annotations),
  });

  return [...described.values()];
};
