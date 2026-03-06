import { LoroDocFrontier } from "@gororobas/domain"
import "loro-crdt"

declare module "loro-crdt" {
  interface LoroDoc {
    frontiers(): LoroDocFrontier

    diff(from: LoroDocFrontier, to: LoroDocFrontier, for_json: false): [ContainerID, Diff][]
    diff(from: LoroDocFrontier, to: LoroDocFrontier, for_json: true): [ContainerID, JsonDiff][]
    diff(from: LoroDocFrontier, to: LoroDocFrontier, for_json: undefined): [ContainerID, JsonDiff][]
    diff(
      from: LoroDocFrontier,
      to: LoroDocFrontier,
      for_json?: boolean,
    ): [ContainerID, JsonDiff | Diff][]
  }
}
