import { noDirectFetchRule } from "./no-direct-fetch.mjs"
import { noDirectIdConstructionRule } from "./no-direct-id-construction.mjs"
import { noDisableValidationRule } from "./no-disable-validation.mjs"
import { noNestedLayerProvideRule } from "./no-nested-layer-provide.mjs"
import { noSqlTypeParameterRule } from "./no-sql-type-parameter.mjs"
import { pipeMaxArgumentsRule } from "./pipe-max-arguments.mjs"
import { preferOptionFromNullableRule } from "./prefer-option-from-nullable.mjs"
import { preferArrSortRule } from "./prefer-arr-sort.mjs"
import { requireCanonicalEffectModuleNamesRule } from "./require-canonical-effect-module-names.mjs"
import { requireEffectAliasForEsNamespacesRule } from "./require-effect-alias-for-es-namespaces.mjs"
import { serviceMapClassSuffixByFileRule } from "./service-map-class-suffix-by-file.mjs"
import { taggedErrorSuffixRule } from "./tagged-error-suffix.mjs"

export default {
  meta: { name: "custom-lint-rules" },
  rules: {
    "no-direct-fetch": noDirectFetchRule,
    "no-direct-id-construction": noDirectIdConstructionRule,
    "no-disable-validation": noDisableValidationRule,
    "no-nested-layer-provide": noNestedLayerProvideRule,
    "no-sql-type-parameter": noSqlTypeParameterRule,
    "pipe-max-arguments": pipeMaxArgumentsRule,
    "prefer-arr-sort": preferArrSortRule,
    "prefer-option-from-nullable": preferOptionFromNullableRule,
    "require-canonical-module-names": requireCanonicalEffectModuleNamesRule,
    "require-effect-alias-for-es-namespaces": requireEffectAliasForEsNamespacesRule,
    "service-map-class-suffix-by-file": serviceMapClassSuffixByFileRule,
    "tagged-error-suffix": taggedErrorSuffixRule,
  },
}
