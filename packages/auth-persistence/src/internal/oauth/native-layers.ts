import {
  OAuthAccountsPersistence,
  OAuthSignInPersistence,
  OAuthRegistrationIntents,
  OAuthConnectedPersistence,
  OAuthConnectedRevocations,
} from "@yielded/auth/OAuth";
import { type Context, Effect, Layer } from "effect";

import type { OAuthRegistrationAuthority } from "../models/oauth-model";

export const oauthAccountsPersistenceLayer = <E, R>(
  services: Effect.Effect<
    { readonly oauthAccountsPersistence: OAuthAccountsPersistence["Service"] },
    E,
    R
  >,
) =>
  Layer.effect(
    OAuthAccountsPersistence,
    Effect.map(services, (value) => value.oauthAccountsPersistence),
  );

export const oauthSignInPersistenceLayer = <E, R>(
  services: Effect.Effect<
    { readonly oauthSignInPersistence: OAuthSignInPersistence["Service"] },
    E,
    R
  >,
) =>
  Layer.effect(
    OAuthSignInPersistence,
    Effect.map(services, (value) => value.oauthSignInPersistence),
  );

export const oauthRegistrationIntentsLayer = <E, R>(
  services: Effect.Effect<
    { readonly oauthRegistrationIntents: OAuthRegistrationIntents["Service"] },
    E,
    R
  >,
) =>
  Layer.effect(
    OAuthRegistrationIntents,
    Effect.map(services, (value) => value.oauthRegistrationIntents),
  );

export const oauthConnectedPersistenceLayer = <E, R>(
  services: Effect.Effect<
    { readonly oauthConnectedPersistence: OAuthConnectedPersistence["Service"] },
    E,
    R
  >,
) =>
  Layer.effect(
    OAuthConnectedPersistence,
    Effect.map(services, (value) => value.oauthConnectedPersistence),
  );

export const oauthConnectedRevocationsLayer = <E, R>(
  services: Effect.Effect<
    { readonly oauthConnectedRevocations: OAuthConnectedRevocations["Service"] },
    E,
    R
  >,
) =>
  Layer.effect(
    OAuthConnectedRevocations,
    Effect.map(services, (value) => value.oauthConnectedRevocations),
  );

export const oauthRegistrationAuthorityLayer = <Id, Registration, E, R>(
  tag: Context.Key<Id, OAuthRegistrationAuthority<Registration>>,
  services: Effect.Effect<
    { readonly registrationAuthority: OAuthRegistrationAuthority<Registration> },
    E,
    R
  >,
) =>
  Layer.effect(
    tag,
    Effect.map(services, (value) => value.registrationAuthority),
  );
