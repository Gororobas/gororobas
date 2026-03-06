import type { LoroDocFrontier } from "./domain.js"
import "loro-crdt"

declare module "loro-crdt" {
  interface LoroDoc {
    frontiers(): LoroDocFrontier
  }
}
