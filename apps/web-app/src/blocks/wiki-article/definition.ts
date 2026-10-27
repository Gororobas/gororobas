import { Block } from "foldkit"

import { Message } from "./message"
import { Model } from "./model"

export const WikiArticleDefinition = Block.makeDefinition("WikiArticle", { Model, Message })

export const { makeFieldsStep, makeStep } = WikiArticleDefinition
