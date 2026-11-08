import { SupportedLanguage } from "@gororobas/domain/common/enums"
import { defineMessageUnion } from "foldkit/message"

import { DeviceLocation } from "../../lib/device-location"

export const Message = defineMessageUnion({
  CompletedLocateDevice: { deviceLocation: DeviceLocation },
})

export const OutMessage = defineMessageUnion({
  RequestedSignOut: {},
  ChoseLanguage: { language: SupportedLanguage },
  DeletedAccount: {},
})
