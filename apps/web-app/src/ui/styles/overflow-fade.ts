import { Global, Style, When } from "@pleat/core"

/** How far the edges fade out where content continues past them. */
export const OVERFLOW_FADE = "4rem"

const fadeMask = ({ start, end }: Readonly<{ start: boolean; end: boolean }>) =>
  `linear-gradient(to right, ${start ? "transparent" : "black"}, black ${start ? OVERFLOW_FADE : "0%"}, black calc(100% - ${end ? OVERFLOW_FADE : "0%"}), ${end ? "transparent" : "black"})`

/**
 * Fades whichever edge has more content past it, so a clipped strip doesn't read as complete.
 * Driven by the strip's own scroll timeline, which is inactive (and so leaves no mask) when the
 * content fits. Masks don't interpolate: each one holds until the next keyframe takes over.
 */
const overflowFade = Global.keyframes("overflow-fade", {
  "from, 1%": { maskImage: fadeMask({ start: false, end: true }) },
  "2%, 98%": { maskImage: fadeMask({ start: true, end: true }) },
  "99%, to": { maskImage: fadeMask({ start: true, end: false }) },
})

/** For horizontally scrolling strips, such as tabs and carousels. */
export const overflowFadeStyle = Style.make({}).pipe(
  Style.when(When.supports("(animation-timeline: scroll())"), {
    animationName: overflowFade,
    animationTimingFunction: "linear",
    animationFillMode: "both",
    animationTimeline: "scroll(self inline)",
  }),
)
