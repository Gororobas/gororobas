import { ToolUsage } from "../../common/enums.js"
import { NonEmptySet } from "../../common/sets.js"
import { defineSituatedProperty } from "../property.js"

export const ToolUsageProperty = defineSituatedProperty({
  id: "toolUsage",
  valueSchema: NonEmptySet(ToolUsage),
  kinds: ["TOOL"],
  scope: "UNIVERSAL",
  sources: (source) => ({ person: source.person({ inferable: true }) }),
  summary: (summarize) => summarize.eachMember(ToolUsage),
})
