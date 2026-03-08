import { noDirectFetchRule } from "./no-direct-fetch.mjs"
import { noDirectIdConstructionRule } from "./no-direct-id-construction.mjs"
import { noDisableValidationRule } from "./no-disable-validation.mjs"
import { noNestedLayerProvideRule } from "./no-nested-layer-provide.mjs"
import { noSqlTypeParameterRule } from "./no-sql-type-parameter.mjs"
import { pipeMaxArgumentsRule } from "./pipe-max-arguments.mjs"
import { preferOptionFromNullableRule } from "./prefer-option-from-nullable.mjs"
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
    "prefer-option-from-nullable": preferOptionFromNullableRule,
    "service-map-class-suffix-by-file": serviceMapClassSuffixByFileRule,
    "tagged-error-suffix": taggedErrorSuffixRule,
  },
}
