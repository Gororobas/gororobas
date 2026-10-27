import { type Html } from "foldkit/html"

import { reiconGenerator, type IconConfig } from "../reicon-generator.js"

export const microphone = (config: IconConfig = {}): Html =>
  reiconGenerator(
    {
      duotone:
        '<path fill-rule="evenodd" clip-rule="evenodd" d="M4 9C4.41421 9 4.75 9.33579 4.75 9.75V10.75C4.75 14.7541 7.99594 18 12 18C16.0041 18 19.25 14.7541 19.25 10.75V9.75C19.25 9.33579 19.5858 9 20 9C20.4142 9 20.75 9.33579 20.75 9.75V10.75C20.75 15.3298 17.2314 19.0879 12.75 19.4683V21.75C12.75 22.1642 12.4142 22.5 12 22.5C11.5858 22.5 11.25 22.1642 11.25 21.75V19.4683C6.7686 19.0879 3.25 15.3298 3.25 10.75V9.75C3.25 9.33579 3.58579 9 4 9Z" fill="currentColor"/><path opacity="0.5" d="M12 2C8.82436 2 6.25 4.57436 6.25 7.75V10.75C6.25 13.9256 8.82436 16.5 12 16.5C14.9214 16.5 17.334 14.3213 17.7015 11.5L13 11.5C12.5858 11.5 12.25 11.1642 12.25 10.75C12.25 10.3358 12.5858 10 13 10L17.75 10V8.5H13C12.5858 8.5 12.25 8.16421 12.25 7.75C12.25 7.33579 12.5858 7 13 7H17.7015C17.334 4.17873 14.9214 2 12 2Z" fill="currentColor"/><path d="M12.25 10.75C12.25 11.1642 12.5858 11.5 13 11.5L17.7015 11.5L17.75 10L13 10C12.5858 10 12.25 10.3358 12.25 10.75Z" fill="currentColor"/><path d="M12.25 7.75C12.25 8.16421 12.5858 8.5 13 8.5H17.75L17.7015 7H13C12.5858 7 12.25 7.33579 12.25 7.75Z" fill="currentColor"/>',
      filled:
        '<path d="M 12 16 c 2.9413 0 5.3333 -2.392 5.3333 -5.3333 v -4 c 0 -2.9413 -2.392 -5.3333 -5.3333 -5.3333 s -5.3333 2.392 -5.3333 5.3333 v 4 c 0 2.9413 2.392 5.3333 5.3333 5.3333 Z" fill="currentColor"></path><path d="M 20.3333 9.6666 c -0.552 0 -1 0.448 -1 1 0 4.044 -3.2893 7.3333 -7.3333 7.3333 s -7.3333 -3.2893 -7.3333 -7.3333 c 0 -0.552 -0.448 -1 -1 -1 s -1 0.448 -1 1 c 0 4.808 3.656 8.7773 8.3333 9.2773 v 1.7227 c 0 0.552 0.448 1 1 1 s 1 -0.448 1 -1 v -1.7227 c 4.6773 -0.5013 8.3333 -4.4693 8.3333 -9.2773 0 -0.552 -0.448 -1 -1 -1 Z" fill="currentColor"></path>',
      outline:
        '<rect x="7.6666" y="2.3333" width="8.6666" height="12.6666" rx="4.3333" ry="4.3333" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"></rect><path d="M 20.3333 10.6666 c 0 4.6027 -3.7307 8.3333 -8.3333 8.3333 h 0 c -4.6027 0 -8.3333 -3.7307 -8.3333 -8.3333" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"></path><line x1="12" y1="19" x2="12" y2="21.6666" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"></line>',
    },
    config,
  )
