import { type Html } from "foldkit/html"

import { reiconGenerator, type IconConfig } from "../reicon-generator.js"

export const chevronDown = (config: IconConfig = {}): Html =>
  reiconGenerator(
    {
      duotone:
        '<path d="M 12 18 c -0.256 0 -0.512 -0.0973 -0.7067 -0.2933 L 2.96 9.3733 c -0.3907 -0.3907 -0.3907 -1.024 0 -1.4147 s 1.024 -0.3907 1.4147 0 l 7.6266 7.6266 7.6266 -7.6266 c 0.3907 -0.3907 1.024 -0.3907 1.4147 0 s 0.3907 1.024 0 1.4147 l -8.3333 8.3333 c -0.1947 0.1947 -0.4507 0.2933 -0.7067 0.2933 Z" fill="currentColor"></path>',
      filled:
        '<path d="M 12 18 c -0.256 0 -0.512 -0.0973 -0.7067 -0.2933 L 2.96 9.3733 c -0.3907 -0.3907 -0.3907 -1.024 0 -1.4147 s 1.024 -0.3907 1.4147 0 l 7.6266 7.6266 7.6266 -7.6266 c 0.3907 -0.3907 1.024 -0.3907 1.4147 0 s 0.3907 1.024 0 1.4147 l -8.3333 8.3333 c -0.1947 0.1947 -0.4507 0.2933 -0.7067 0.2933 Z" fill="currentColor"></path>',
      outline:
        '<polyline points="20.3333 8.6666 12 17 3.6667 8.6666" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"></polyline>',
    },
    config,
  )
