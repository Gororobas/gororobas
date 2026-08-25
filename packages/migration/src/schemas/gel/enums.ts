/**
 * Gel schema enums and scalar types.
 */
import { Schema } from "effect"

// ============ Scalar Types ============

export const GelRole = Schema.Enum({
  ADMIN: "ADMIN",
  USER: "USER",
  MODERATOR: "MODERATOR",
})
export type GelRole = typeof GelRole.Type

export const GelSourceType = Schema.Enum({
  GOROROBAS: "GOROROBAS",
  EXTERNAL: "EXTERNAL",
})
export type GelSourceType = typeof GelSourceType.Type

export const GelGender = Schema.Enum({
  FEMININO: "FEMININO",
  MASCULINO: "MASCULINO",
  NEUTRO: "NEUTRO",
})
export type GelGender = typeof GelGender.Type

export const GelVegetableUsage = Schema.Enum({
  ALIMENTO_ANIMAL: "ALIMENTO_ANIMAL",
  ALIMENTO_HUMANO: "ALIMENTO_HUMANO",
  CONSTRUCAO: "CONSTRUCAO",
  MATERIA_ORGANICA: "MATERIA_ORGANICA",
  MEDICINAL: "MEDICINAL",
  COSMETICO: "COSMETICO",
  ORNAMENTAL: "ORNAMENTAL",
  RITUALISTICO: "RITUALISTICO",
  ECOLOGICO: "ECOLOGICO",
})
export type GelVegetableUsage = typeof GelVegetableUsage.Type

export const GelEdiblePart = Schema.Enum({
  FRUTO: "FRUTO",
  FLOR: "FLOR",
  FOLHA: "FOLHA",
  CAULE: "CAULE",
  SEMENTE: "SEMENTE",
  CASCA: "CASCA",
  BULBO: "BULBO",
  BROTO: "BROTO",
  RAIZ: "RAIZ",
  TUBERCULO: "TUBERCULO",
  RIZOMA: "RIZOMA",
})
export type GelEdiblePart = typeof GelEdiblePart.Type

export const GelVegetableLifeCycle = Schema.Enum({
  SEMESTRAL: "SEMESTRAL",
  ANUAL: "ANUAL",
  BIENAL: "BIENAL",
  PERENE: "PERENE",
})
export type GelVegetableLifeCycle = typeof GelVegetableLifeCycle.Type

export const GelStratum = Schema.Enum({
  EMERGENTE: "EMERGENTE",
  ALTO: "ALTO",
  MEDIO: "MEDIO",
  BAIXO: "BAIXO",
  RASTEIRO: "RASTEIRO",
})
export type GelStratum = typeof GelStratum.Type

export const GelPlantingMethod = Schema.Enum({
  BROTO: "BROTO",
  ENXERTO: "ENXERTO",
  ESTACA: "ESTACA",
  RIZOMA: "RIZOMA",
  SEMENTE: "SEMENTE",
  TUBERCULO: "TUBERCULO",
})
export type GelPlantingMethod = typeof GelPlantingMethod.Type

export const GelTipSubject = Schema.Enum({
  PLANTIO: "PLANTIO",
  CRESCIMENTO: "CRESCIMENTO",
  COLHEITA: "COLHEITA",
})
export type GelTipSubject = typeof GelTipSubject.Type

export const GelVegetableWishlistStatus = Schema.Enum({
  QUERO_CULTIVAR: "QUERO_CULTIVAR",
  SEM_INTERESSE: "SEM_INTERESSE",
  JA_CULTIVEI: "JA_CULTIVEI",
  ESTOU_CULTIVANDO: "ESTOU_CULTIVANDO",
})
export type GelVegetableWishlistStatus = typeof GelVegetableWishlistStatus.Type

export const GelEditSuggestionStatus = Schema.Enum({
  PENDING_REVIEW: "PENDING_REVIEW",
  MERGED: "MERGED",
  REJECTED: "REJECTED",
})
export type GelEditSuggestionStatus = typeof GelEditSuggestionStatus.Type

export const GelNotePublishStatus = Schema.Enum({
  PRIVATE: "PRIVATE",
  COMMUNITY: "COMMUNITY",
  PUBLIC: "PUBLIC",
})
export type GelNotePublishStatus = typeof GelNotePublishStatus.Type

export const GelResourceFormat = Schema.Enum({
  BOOK: "BOOK",
  FILM: "FILM",
  SOCIAL_MEDIA: "SOCIAL_MEDIA",
  VIDEO: "VIDEO",
  ARTICLE: "ARTICLE",
  PODCAST: "PODCAST",
  COURSE: "COURSE",
  ACADEMIC_WORK: "ACADEMIC_WORK",
  DATASET: "DATASET",
  ORGANIZATION: "ORGANIZATION",
  OTHER: "OTHER",
})
export type GelResourceFormat = typeof GelResourceFormat.Type

export const GelNoteType = Schema.Enum({
  EXPERIMENTO: "EXPERIMENTO",
  ENSINAMENTO: "ENSINAMENTO",
  DESCOBERTA: "DESCOBERTA",
  PERGUNTA: "PERGUNTA",
  INSPIRACAO: "INSPIRACAO",
})
export type GelNoteType = typeof GelNoteType.Type

export const GelHistoryAction = Schema.Enum({
  INSERT: "INSERT",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
})
export type GelHistoryAction = typeof GelHistoryAction.Type
