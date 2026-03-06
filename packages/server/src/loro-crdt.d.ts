import { LoroDocFrontier } from "@gororobas/domain"
import "loro-crdt"

declare module "loro-crdt" {
  interface LoroDoc {
    frontiers(): LoroDocFrontier
  }
}
