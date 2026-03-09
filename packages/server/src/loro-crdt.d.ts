import { LoroDocFrontier, LoroDocSnapshot, LoroDocUpdate } from "@gororobas/domain"
import "loro-crdt"

declare module "loro-crdt" {
  interface LoroDoc {
    export(config: { mode: "snapshot" }): LoroDocSnapshot
    export(config: { from: VersionVector; mode: "update" }): LoroDocUpdate

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
