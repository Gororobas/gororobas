import { ElevationInMeters } from "@gororobas/domain/profiles/locations"
import { DateTime, Effect, Layer, Option, Schema } from "effect"
import { load, pushUrl } from "foldkit/navigation"

import { DeviceLocation } from "../lib/device-location"
import { ApplicationBlock } from "./definition"
import { Message } from "./message"

export const NavigateInternal = ApplicationBlock.makeCommand("NavigateInternal", {
  args: { url: Schema.String },
  messages: [Message.CompletedNavigateInternal],
  handler: function* () {
    return ({ url }) => pushUrl(url).pipe(Effect.as(Message.CompletedNavigateInternal()))
  },
})

export const LoadExternal = ApplicationBlock.makeCommand("LoadExternal", {
  args: { href: Schema.String },
  messages: [Message.CompletedLoadExternal],
  handler: function* () {
    return ({ href }) => load(href).pipe(Effect.as(Message.CompletedLoadExternal()))
  },
})

export const ReadToday = ApplicationBlock.makeCommand("ReadToday", {
  messages: [Message.CompletedReadToday],
  handler: function* () {
    return () => DateTime.now.pipe(Effect.map((today) => Message.CompletedReadToday({ today })))
  },
})

class PositionUnavailableError extends Schema.TaggedError<PositionUnavailableError>()(
  "PositionUnavailableError",
  {},
) {}

const currentPosition = Effect.callback<GeolocationPosition, PositionUnavailableError>((resume) => {
  if (!("geolocation" in navigator)) {
    resume(Effect.fail(new PositionUnavailableError()))
    return
  }

  navigator.geolocation.getCurrentPosition(
    (position) => resume(Effect.succeed(position)),
    () => resume(Effect.fail(new PositionUnavailableError())),
    { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
  )
})

/** Asks the browser where the device is, which may prompt the person for permission. */
export const LocateDevice = ApplicationBlock.makeCommand("LocateDevice", {
  messages: [Message.CompletedLocateDevice],
  handler: function* () {
    return () =>
      currentPosition.pipe(
        Effect.map(({ coords }) =>
          DeviceLocation.Located({
            coordinates: { latitude: coords.latitude, longitude: coords.longitude },
            maybeElevation: Option.flatMap(Option.fromNullishOr(coords.altitude), (altitude) =>
              Schema.decodeOption(ElevationInMeters)(altitude),
            ),
          }),
        ),
        Effect.orElseSucceed(() => DeviceLocation.Unavailable()),
        Effect.map((deviceLocation) => Message.CompletedLocateDevice({ deviceLocation })),
      )
  },
})

export const EffectsLayer = Layer.mergeAll(
  NavigateInternal.layer,
  LoadExternal.layer,
  ReadToday.layer,
  LocateDevice.layer,
)
