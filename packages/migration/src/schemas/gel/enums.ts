/**
 * Gel schema enums and scalar types.
 */
import { Schema } from "effect"

// ============ Scalar Types ============

export const Role = Schema.Enums({
  ADMIN: "ADMIN",
  USER: "USER",
  MODERATOR: "MODERATOR",
})
export type Role = typeof Role.Type

export const SourceType = Schema.Enums({
  GOROROBAS: "GOROROBAS",
  EXTERNAL: "EXTERNAL",
})
export type SourceType = typeof SourceType.Type

export const Gender = Schema.Enums({
  FEMININO: "FEMININO",
  MASCULINO: "MASCULINO",
  NEUTRO: "NEUTRO",
})
export type Gender = typeof Gender.Type

export const VegetableUsage = Schema.Enums({
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
export type VegetableUsage = typeof VegetableUsage.Type

export const EdiblePart = Schema.Enums({
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
export type EdiblePart = typeof EdiblePart.Type

export const VegetableLifeCycle = Schema.Enums({
  SEMESTRAL: "SEMESTRAL",
  ANUAL: "ANUAL",
  BIENAL: "BIENAL",
  PERENE: "PERENE",
})
export type VegetableLifeCycle = typeof VegetableLifeCycle.Type

export const Stratum = Schema.Enums({
  EMERGENTE: "EMERGENTE",
  ALTO: "ALTO",
  MEDIO: "MEDIO",
  BAIXO: "BAIXO",
  RASTEIRO: "RASTEIRO",
})
export type Stratum = typeof Stratum.Type

export const PlantingMethod = Schema.Enums({
  BROTO: "BROTO",
  ENXERTO: "ENXERTO",
  ESTACA: "ESTACA",
  RIZOMA: "RIZOMA",
  SEMENTE: "SEMENTE",
  TUBERCULO: "TUBERCULO",
})
export type PlantingMethod = typeof PlantingMethod.Type

export const TipSubject = Schema.Enums({
  PLANTIO: "PLANTIO",
  CRESCIMENTO: "CRESCIMENTO",
  COLHEITA: "COLHEITA",
})
export type TipSubject = typeof TipSubject.Type

export const VegetableWishlistStatus = Schema.Enums({
  QUERO_CULTIVAR: "QUERO_CULTIVAR",
  SEM_INTERESSE: "SEM_INTERESSE",
  JA_CULTIVEI: "JA_CULTIVEI",
  ESTOU_CULTIVANDO: "ESTOU_CULTIVANDO",
})
export type VegetableWishlistStatus = typeof VegetableWishlistStatus.Type

export const EditSuggestionStatus = Schema.Enums({
  PENDING_REVIEW: "PENDING_REVIEW",
  MERGED: "MERGED",
  REJECTED: "REJECTED",
})
export type EditSuggestionStatus = typeof EditSuggestionStatus.Type

export const NotePublishStatus = Schema.Enums({
  PRIVATE: "PRIVATE",
  COMMUNITY: "COMMUNITY",
  PUBLIC: "PUBLIC",
})
export type NotePublishStatus = typeof NotePublishStatus.Type

export const ResourceFormat = Schema.Enums({
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
export type ResourceFormat = typeof ResourceFormat.Type

export const NoteType = Schema.Enums({
  EXPERIMENTO: "EXPERIMENTO",
  ENSINAMENTO: "ENSINAMENTO",
  DESCOBERTA: "DESCOBERTA",
  PERGUNTA: "PERGUNTA",
  INSPIRACAO: "INSPIRACAO",
})
export type NoteType = typeof NoteType.Type

export const HistoryAction = Schema.Enums({
  INSERT: "INSERT",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
})
export type HistoryAction = typeof HistoryAction.Type
