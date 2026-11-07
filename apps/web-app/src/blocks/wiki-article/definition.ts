import { SupportedLanguage } from "@gororobas/domain/common/enums"
import { WikiArticleLookup } from "@gororobas/domain/wiki/domain"
import { Schema } from "effect"
import { Block } from "foldkit"

import { GororobasApiClient } from "../../api-client"
import { SessionAccess } from "../../session-access"
import { Message } from "./message"
import { Model } from "./model"
import type { ViewInputs } from "./view/view"

export const WikiArticleKey = Symbol("WikiArticle")

export const WikiArticleBlock = Block.make("WikiArticle", {
  key: WikiArticleKey,
  Init: Schema.Tuple([WikiArticleLookup, SupportedLanguage]),
  view: { kind: "Element", Inputs: Block.makeInputContract<ViewInputs>() },
  effects: { services: [GororobasApiClient, SessionAccess] },
  Model,
  Message,
})

export const { makeFieldsStep, makeNoopStep, makeStep } = WikiArticleBlock
