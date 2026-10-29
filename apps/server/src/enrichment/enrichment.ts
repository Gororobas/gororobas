/**
 * Derived work on committed content: which workflows each kind of change requests.
 *
 * Services call these after their transaction commits, so workflows read the committed state.
 * Requests are best-effort: `submitInBackground` logs a failed submission instead of failing the
 * change that made it. Tests swap `EnrichmentSubmitterLive` for `EnrichmentRecorder` to assert
 * which workflows a change requests without running them.
 */
import {
  ContentLanguage,
  PublicationCrdt,
  type PublicationCommentData,
  type PublicationId,
  snapshotToLoroDoc,
  SupportedLanguage,
  type WikiArticleProjectionRow,
} from "@gororobas/domain"
import { Array as EffectArray, Context, Effect, Layer, Option, Ref } from "effect"
import { WorkflowEngine } from "effect/workflow"

import { PublicationLinkInferenceWorkflow } from "../link-inference/publication-link-inference-workflow.js"
import { requestWikiArticleLinkInference } from "../link-inference/wiki-article-link-inference-definition.js"
import { PublicationsRepository } from "../publications/repository.js"
import { PublicationCommentTranslationWorkflow } from "../translation/publication-comment-translation-workflow.js"
import { PublicationTranslationWorkflow } from "../translation/publication-translation-workflow.js"
import type { ExternalDataArticle } from "../wiki/external-data/persist-utils.js"
import { requestExternalDataFetch } from "../wiki/external-data/workflow.js"

export interface EnrichmentRequest<E> {
  /** Names the workflow and what it works on, for logs and test assertions. */
  readonly description: string
  readonly submit: Effect.Effect<unknown, E, WorkflowEngine.WorkflowEngine>
}

export class EnrichmentSubmitter extends Context.Service<
  EnrichmentSubmitter,
  { readonly submitInBackground: <E>(request: EnrichmentRequest<E>) => Effect.Effect<void> }
>()("EnrichmentSubmitter") {}

export const EnrichmentSubmitterLive = Layer.effect(
  EnrichmentSubmitter,
  Effect.gen(function* () {
    const engine = yield* WorkflowEngine.WorkflowEngine

    return {
      submitInBackground: (request) =>
        request.submit.pipe(
          Effect.asVoid,
          Effect.provideService(WorkflowEngine.WorkflowEngine, engine),
          Effect.catchCause((cause) =>
            Effect.logError(`Submitting ${request.description} failed`, cause),
          ),
        ),
    }
  }),
)

/** The requests changes made, in order, instead of submitting them. */
export class RecordedEnrichment extends Context.Service<
  RecordedEnrichment,
  Ref.Ref<ReadonlyArray<string>>
>()("RecordedEnrichment") {}

export const EnrichmentRecorder = Layer.effect(
  EnrichmentSubmitter,
  Effect.gen(function* () {
    const recorded = yield* RecordedEnrichment
    return {
      submitInBackground: (request) =>
        Ref.update(recorded, (requests) => [...requests, request.description]),
    }
  }),
).pipe(Layer.provideMerge(Layer.effect(RecordedEnrichment, Ref.make<ReadonlyArray<string>>([]))))

const UNDETERMINED_LANGUAGE = ContentLanguage.make("und")

const translationTargets = (sourceLanguage: ContentLanguage) =>
  sourceLanguage === UNDETERMINED_LANGUAGE
    ? []
    : EffectArray.filter(
        SupportedLanguage.literals,
        (language) => language !== new Intl.Locale(sourceLanguage).language,
      )

/** The table of which workflows each kind of committed change requests. */
export class Enrichment extends Context.Service<Enrichment>()("Enrichment", {
  make: Effect.gen(function* () {
    const submitter = yield* EnrichmentSubmitter
    const publications = yield* PublicationsRepository

    const submitAll = <E>(requests: ReadonlyArray<EnrichmentRequest<E>>) =>
      Effect.forEach(requests, submitter.submitInBackground, { concurrency: 1, discard: true })

    /** An approved wiki article state: refresh its provider data and infer its relations. */
    const onWikiArticleChanged = (input: {
      article: ExternalDataArticle
      previous?: WikiArticleProjectionRow | undefined
    }) =>
      submitAll([
        {
          description: `external data for wiki article ${input.article.id}`,
          submit: requestExternalDataFetch(input.article, input.previous),
        },
        {
          description: `link inference for wiki article ${input.article.id}`,
          submit: requestWikiArticleLinkInference(input.article, input.previous),
        },
      ])

    /**
     * New publication content: infer the wiki articles it's about and translate it to the other
     * supported languages. Content in an undetermined language isn't translated.
     */
    const onPublicationContentChanged = (publicationId: PublicationId) =>
      Effect.gen(function* () {
        const row = yield* publications.findPublicationRowById(publicationId)
        const stored = yield* publications.findPublicationCrdtSnapshotById(publicationId)
        if (Option.isNone(row) || Option.isNone(stored)) return

        const { sourceContent, sourceLanguage } = yield* PublicationCrdt.read(
          snapshotToLoroDoc(stored.value.crdtSnapshot),
        )
        const sourceCrdtFrontier = row.value.currentCrdtFrontier

        yield* submitAll([
          {
            description: `link inference for publication ${publicationId}`,
            submit: PublicationLinkInferenceWorkflow.execute(
              { publicationId, crdtFrontier: sourceCrdtFrontier },
              { discard: true },
            ),
          },
          ...translationTargets(sourceLanguage).map((targetLanguage) => ({
            description: `${targetLanguage} translation for publication ${publicationId}`,
            submit: PublicationTranslationWorkflow.execute(
              {
                publicationId,
                updatedAt: row.value.updatedAt,
                sourceLanguage,
                sourceCrdtFrontier,
                targetLanguage,
                sourceContent,
              },
              { discard: true },
            ),
          })),
        ])
      }).pipe(
        // Reading what to request is as best-effort as the requests themselves.
        Effect.catchCause((cause) =>
          Effect.logError(`Requesting enrichment for publication ${publicationId} failed`, cause),
        ),
      )

    /** A new or edited comment: detect its language and translate it. */
    const onCommentChanged = (
      comment: Pick<PublicationCommentData, "id" | "currentRevisionId" | "sourceContent">,
    ) =>
      submitAll([
        {
          description: `translation for publication comment ${comment.id}`,
          submit: PublicationCommentTranslationWorkflow.execute(
            {
              publicationCommentId: comment.id,
              sourceRevisionId: comment.currentRevisionId,
              sourceContent: comment.sourceContent,
            },
            { discard: true },
          ),
        },
      ])

    return { onWikiArticleChanged, onPublicationContentChanged, onCommentChanged } as const
  }),
}) {}
