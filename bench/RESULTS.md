# Render benchmark

`pnpm bench` runs [`render.ts`](./render.ts): the same button as a Pleat recipe and as the
common Tailwind stack (class-variance-authority for variants, tailwind-merge so overrides win).

Measured Oct 8 2026 on an AMD Ryzen 5 7640HS, Node v26.8.2, median of 7 rounds.

| One styled element per render         | Time per operation | Relative |
| ------------------------------------- | -----------------: | -------: |
| Pleat: recipe → `css()`               |              90 ns |     1.0× |
| Pleat: recipe + override → `css()`    |             107 ns |     1.2× |
| cva                                   |             228 ns |     2.5× |
| cva + tailwind-merge with an override |             334 ns |     3.7× |

| Server render of 500 buttons with Foldkit | Time per operation | Relative |
| ----------------------------------------- | -----------------: | -------: |
| Pleat                                     |           32.76 ms |     1.0× |
| Tailwind classes via cva                  |           39.14 ms |     1.2× |

What the numbers mean:

- A recipe call is a few map lookups after the first call for each combination, and `css()`
  returns a cached, frozen attribute array for a style it has seen, so a render allocates
  nothing for styling.
- Merging an override into a recipe's style is memoized by identity, so it costs one extra
  lookup. tailwind-merge has to parse class strings to know which utilities conflict.
- The server render is dominated by Foldkit's own rendering. The page's CSS is generated
  once per page by `renderDocument` and is not included in these timings.
