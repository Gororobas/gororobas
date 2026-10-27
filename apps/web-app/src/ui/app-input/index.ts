import { view as textareaView } from "./textarea-view"
import { view } from "./view"

export const AppInput = { view }
export const AppTextarea = { view: textareaView }

export { textControlStyle, type AppInputConfig } from "./view"
export type { AppTextareaConfig } from "./textarea-view"
