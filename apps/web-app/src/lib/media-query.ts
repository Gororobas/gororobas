import { Stream } from "effect"

/** Whether a media query matches, now and whenever that changes. */
export const streamMediaQueryMatches = (query: string): Stream.Stream<boolean> => {
  const list = window.matchMedia(query)

  return Stream.concat(
    Stream.succeed(list.matches),
    Stream.fromEventListener<MediaQueryListEvent>(list, "change").pipe(
      Stream.map((event) => event.matches),
    ),
  )
}
