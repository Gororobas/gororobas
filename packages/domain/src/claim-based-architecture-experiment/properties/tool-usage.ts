import { ToolUsage } from "../../common/enums.js"
import { defineProperty } from "../property.js"

export const ToolUsageProperty = defineProperty({
  id: "toolUsage",
  value: ToolUsage,
  subjectKinds: ["TOOL"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: ["PERSON"],
})
