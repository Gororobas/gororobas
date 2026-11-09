import { describe, expect, it } from "@effect/vitest"
import {
  canViewContent,
  Handle,
  IdGen,
  MediaAssetId,
  ModerationStatus,
  OrganizationAccessLevel,
  OrganizationId,
  PersonId,
  PlatformAccessLevel,
  PublicationId,
  PublicationVisibility,
  type ProfileId,
  type Session,
} from "@gororobas/domain"
import { assertPropertyEffect } from "@gororobas/domain/testing"
import { DateTime, Effect, Option, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { SqlClient, SqlSchema } from "effect/sql"

import { findContentOwner } from "../src/content-visibility/queries.js"
import { publicationVisibleTo } from "../src/content-visibility/visible-to.js"
import { insertMediaAsset } from "../src/media-assets/mutations.js"
import { listVisiblePhotos } from "../src/profiles/queries.js"
import { makeOrganizationFixture, makeOrganizationProfileFixture } from "./fixtures.js"
import { insertOrganizationWithDependencies, seedPerson, TestLayer } from "./test-helpers.js"

const isVisibleInSql = (session: Session) =>
  SqlSchema.findOne({
    Request: PublicationId,
    Result: Schema.Struct({ result: Schema.BooleanFromBit }),
    execute: (id) =>
      SqlClient.SqlClient.use(
        (sql) => sql`SELECT EXISTS (
          SELECT 1 FROM publication_sources source
          WHERE source.id = ${id} AND ${publicationVisibleTo(sql, session)}
        ) AS result`,
      ),
  })

const insertPublication = (input: {
  ownerProfileId: ProfileId
  visibility: PublicationVisibility
  moderationStatus: ModerationStatus
}) =>
  Effect.gen(function* () {
    const id = yield* IdGen.make(PublicationId)
    const now = DateTime.formatIso(yield* DateTime.now)

    yield* SqlClient.SqlClient.use(
      (sql) =>
        sql`INSERT INTO publication_sources ${sql.insert({
          id,
          crdtSnapshot: new Uint8Array(),
          moderationStatus: input.moderationStatus,
          ownerProfileId: input.ownerProfileId,
          handle: `publication-${id}`,
          visibility: input.visibility,
          publishedAt: now,
          createdAt: now,
          updatedAt: now,
        })}`,
    )

    return id
  })

/** An image attached only to `publicationId`, so the publication alone decides who sees it. */
const insertPublicationImage = (input: {
  ownerProfileId: ProfileId
  publicationId: PublicationId
  moderationStatus: ModerationStatus
  /** Only people take photos: organizations' media credits someone else, or no one. */
  isTakenByOwner: boolean
}) =>
  Effect.gen(function* () {
    const id = yield* IdGen.make(MediaAssetId)
    const now = yield* DateTime.now

    yield* insertMediaAsset({
      id,
      format: "IMAGE",
      metadata: { format: "IMAGE", originalWidth: 80, originalHeight: 40 },
      contentType: "image/png",
      byteSize: 1,
      category: null,
      descriptions: {},
      moderationStatus: input.moderationStatus,
      ownerProfileId: input.ownerProfileId,
      licenseUrl: null,
      createdAt: now,
      updatedAt: now,
    })

    yield* SqlClient.SqlClient.use(
      (sql) =>
        sql`INSERT INTO publication_media_assets ${sql.insert({
          publicationId: input.publicationId,
          mediaAssetId: id,
        })}`,
    )

    // Credited to who took it, which is what puts it among their profile's photos.
    if (input.isTakenByOwner) {
      yield* SqlClient.SqlClient.use(
        (sql) =>
          sql`INSERT INTO media_asset_credits ${sql.insert({
            mediaAssetId: id,
            orderIndex: 0,
            personId: input.ownerProfileId,
          })}`,
      )
    }

    return id
  })

const Viewer = Schema.Union([
  Schema.Struct({ type: Schema.Literal("VISITOR") }),
  Schema.Struct({
    type: Schema.Literal("ACCOUNT"),
    accessLevel: PlatformAccessLevel,
    /** Owns the publication, when a person owns it. */
    isOwner: Schema.Boolean,
    /** Their membership in the owning organization, when one owns it, or in another one. */
    membership: Schema.NullOr(
      Schema.Struct({ accessLevel: OrganizationAccessLevel, isOfOwner: Schema.Boolean }),
    ),
  }),
])

describe("content visibility", () => {
  it.layer(TestLayer)((it) => {
    it.effect(
      "visibleTo in SQL agrees with canViewContent for any viewer and publication, and so do its photos",
      () =>
        assertPropertyEffect({
          // Rare branches, like a community member reading a newcomer's post, need many runs.
          options: { runs: 1000 },
          arbitrary: Arbitrary.all({
            ownerType: Arbitrary.schema(Schema.Literals(["PERSON", "ORGANIZATION"])),
            ownerAccessLevel: Arbitrary.schema(PlatformAccessLevel),
            visibility: Arbitrary.schema(PublicationVisibility),
            moderationStatus: Arbitrary.schema(ModerationStatus),
            imageModerationStatus: Arbitrary.schema(ModerationStatus),
            viewer: Arbitrary.schema(Viewer),
          }),
          predicate: ({
            ownerType,
            ownerAccessLevel,
            visibility,
            moderationStatus,
            imageModerationStatus,
            viewer,
          }) =>
            Effect.gen(function* () {
              const ownerProfileId: ProfileId =
                ownerType === "PERSON"
                  ? (yield* seedPerson(ownerAccessLevel)).person.id
                  : yield* Effect.gen(function* () {
                      const organization = yield* makeOrganizationFixture()

                      yield* insertOrganizationWithDependencies({
                        organization,
                        // The fixture's handle only varies with the ID's timestamp.
                        profile: yield* makeOrganizationProfileFixture({
                          id: organization.id,
                          handle: Handle.make(`org-${organization.id}`),
                        }),
                      })

                      return organization.id
                    })

              const session: Session =
                viewer.type === "VISITOR"
                  ? viewer
                  : {
                      type: "ACCOUNT",
                      accessLevel: viewer.accessLevel,
                      personId:
                        viewer.isOwner && ownerType === "PERSON"
                          ? PersonId.make(ownerProfileId)
                          : yield* IdGen.make(PersonId),
                      memberships:
                        viewer.membership === null
                          ? []
                          : [
                              {
                                accessLevel: viewer.membership.accessLevel,
                                organizationId:
                                  viewer.membership.isOfOwner && ownerType === "ORGANIZATION"
                                    ? OrganizationId.make(ownerProfileId)
                                    : yield* IdGen.make(OrganizationId),
                              },
                            ],
                    }

              const id = yield* insertPublication({ ownerProfileId, visibility, moderationStatus })
              const owner = Option.getOrThrow(yield* findContentOwner(ownerProfileId))
              const inSql = (yield* isVisibleInSql(session)(id)).result

              const canView = canViewContent(session, { owner, visibility, moderationStatus })
              expect(inSql).toBe(canView)

              // A profile's photos follow their publication, and censored ones show only to who took them.
              const imageId = yield* insertPublicationImage({
                ownerProfileId,
                publicationId: id,
                moderationStatus: imageModerationStatus,
                isTakenByOwner: ownerType === "PERSON",
              })

              const isOwnerAccount =
                session.type === "ACCOUNT" && session.personId === ownerProfileId
              const photos = yield* listVisiblePhotos(session)({
                profileId: ownerProfileId,
                currentPage: 0,
              })

              expect(photos.some((photo) => photo.id === imageId)).toBe(
                ownerType === "PERSON" &&
                  canView &&
                  (imageModerationStatus !== "CENSORED" || isOwnerAccount),
              )

              return true
            }),
        }),
    )
  })
})
