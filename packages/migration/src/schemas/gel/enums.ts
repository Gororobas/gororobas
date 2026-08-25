/**
 * Gel schema enums and scalar types.
 */
import { Schema } from "effect"

// ============ Scalar Types ============

export const GelRole = Schema.Literals(["ADMIN", "USER", "MODERATOR"])
export type GelRole = typeof GelRole.Type

export const GelSourceType = Schema.Literals(["GOROROBAS", "EXTERNAL"])
export type GelSourceType = typeof GelSourceType.Type

export const GelGender = Schema.Literals(["FEMININO", "MASCULINO", "NEUTRO"])
export type GelGender = typeof GelGender.Type

export const GelVegetableUsage = Schema.Literals([
  "ALIMENTO_ANIMAL",
  "ALIMENTO_HUMANO",
  "CONSTRUCAO",
  "MATERIA_ORGANICA",
  "MEDICINAL",
  "COSMETICO",
  "ORNAMENTAL",
  "RITUALISTICO",
  "ECOLOGICO",
])
export type GelVegetableUsage = typeof GelVegetableUsage.Type

export const GelEdiblePart = Schema.Literals([
  "FRUTO",
  "FLOR",
  "FOLHA",
  "CAULE",
  "SEMENTE",
  "CASCA",
  "BULBO",
  "BROTO",
  "RAIZ",
  "TUBERCULO",
  "RIZOMA",
])
export type GelEdiblePart = typeof GelEdiblePart.Type

export const GelVegetableLifeCycle = Schema.Literals(["SEMESTRAL", "ANUAL", "BIENAL", "PERENE"])
export type GelVegetableLifeCycle = typeof GelVegetableLifeCycle.Type

export const GelStratum = Schema.Literals(["EMERGENTE", "ALTO", "MEDIO", "BAIXO", "RASTEIRO"])
export type GelStratum = typeof GelStratum.Type

export const GelPlantingMethod = Schema.Literals([
  "BROTO",
  "ENXERTO",
  "ESTACA",
  "RIZOMA",
  "SEMENTE",
  "TUBERCULO",
])
export type GelPlantingMethod = typeof GelPlantingMethod.Type

export const GelTipSubject = Schema.Literals(["PLANTIO", "CRESCIMENTO", "COLHEITA"])
export type GelTipSubject = typeof GelTipSubject.Type

export const GelVegetableWishlistStatus = Schema.Literals([
  "QUERO_CULTIVAR",
  "SEM_INTERESSE",
  "JA_CULTIVEI",
  "ESTOU_CULTIVANDO",
])
export type GelVegetableWishlistStatus = typeof GelVegetableWishlistStatus.Type

export const GelEditSuggestionStatus = Schema.Literals(["PENDING_REVIEW", "MERGED", "REJECTED"])
export type GelEditSuggestionStatus = typeof GelEditSuggestionStatus.Type

export const GelNotePublishStatus = Schema.Literals(["PRIVATE", "COMMUNITY", "PUBLIC"])
export type GelNotePublishStatus = typeof GelNotePublishStatus.Type

export const GelResourceFormat = Schema.Literals([
  "BOOK",
  "FILM",
  "SOCIAL_MEDIA",
  "VIDEO",
  "ARTICLE",
  "PODCAST",
  "COURSE",
  "ACADEMIC_WORK",
  "DATASET",
  "ORGANIZATION",
  "OTHER",
])
export type GelResourceFormat = typeof GelResourceFormat.Type

export const GelNoteType = Schema.Literals([
  "EXPERIMENTO",
  "ENSINAMENTO",
  "DESCOBERTA",
  "PERGUNTA",
  "INSPIRACAO",
])
export type GelNoteType = typeof GelNoteType.Type

export const GelHistoryAction = Schema.Literals(["INSERT", "UPDATE", "DELETE"])
export type GelHistoryAction = typeof GelHistoryAction.Type
