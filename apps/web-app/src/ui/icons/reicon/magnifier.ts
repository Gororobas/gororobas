import { type Html } from "foldkit/html"

import { reiconGenerator, type IconConfig } from "../reicon-generator.js"

export const magnifier = (config: IconConfig = {}): Html =>
  reiconGenerator(
    {
      duotone:
        '<path opacity="0.5" d="M20.3133 11.1566C20.3133 16.2137 16.2137 20.3133 11.1566 20.3133C6.09956 20.3133 2 16.2137 2 11.1566C2 6.09956 6.09956 2 11.1566 2C16.2137 2 20.3133 6.09956 20.3133 11.1566Z" fill="currentColor"/><path d="M17.1001 18.1219L20.7664 21.7882C21.0487 22.0705 21.5064 22.0705 21.7887 21.7882C22.071 21.5059 22.071 21.0482 21.7887 20.7659L18.1224 17.0996C17.809 17.4666 17.4671 17.8085 17.1001 18.1219Z" fill="currentColor"/>',
      filled:
        '<path fill-rule="evenodd" clip-rule="evenodd" d="M 14.811 14.811 C 15.2016 14.4205 15.8346 14.4205 16.2252 14.811 L 21.707 20.2929 C 22.0975 20.6834 22.0975 21.3165 21.707 21.707 C 21.3165 22.0975 20.6834 22.0975 20.2929 21.707 L 14.811 16.2252 C 14.4205 15.8346 14.4205 15.2016 14.811 14.811 Z" fill="currentColor"></path> <path fill-rule="evenodd" clip-rule="evenodd" d="M 2 10.3333 C 2 5.731 5.731 2 10.3333 2 C 14.9356 2 18.6666 5.731 18.6666 10.3333 C 18.6666 14.9356 14.9356 18.6666 10.3333 18.6666 C 5.731 18.6666 2 14.9356 2 10.3333 Z M 10.3333 4 C 6.8356 4 4 6.8356 4 10.3333 C 4 13.831 6.8356 16.6666 10.3333 16.6666 C 13.831 16.6666 16.6666 13.831 16.6666 10.3333 C 16.6666 6.8356 13.831 4 10.3333 4 Z" fill="currentColor"></path>',
      outline:
        '<path d="M 20.9999 20.9999 L 15.5181 15.5181" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"></path> <path d="M 10.3333 17.6666 C 14.3833 17.6666 17.6666 14.3833 17.6666 10.3333 C 17.6666 6.2833 14.3833 3 10.3333 3 C 6.2833 3 3 6.2833 3 10.3333 C 3 14.3833 6.2833 17.6666 10.3333 17.6666 Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"></path>',
    },
    config,
  )
