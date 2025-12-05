import { twMerge } from 'tailwind-merge'
import type { CnOptions } from 'tailwind-variants'

export function cn<T extends CnOptions>(...classes: T) {
  // @ts-expect-error tailwind-variants accepts numbers and supposedly twMerge doesn't. We're not using them anyways, so... 😬
  return twMerge(...classes)
}
