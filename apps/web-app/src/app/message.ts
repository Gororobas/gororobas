import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import { UrlRequest } from "foldkit/navigation"
import { Url } from "foldkit/url"

import { DeviceLocation } from "../lib/device-location"

export const Message = defineMessageUnion({
  ClickedLink: { request: UrlRequest },
  ClickedSearchLink: {},
  CompletedFocusSearchField: {},
  ChangedUrl: { url: Url },
  CompletedNavigateInternal: {},
  CompletedLoadExternal: {},
  CompletedReadToday: { today: Schema.DateTimeUtc },
  CompletedLocateDevice: { deviceLocation: DeviceLocation },
})
