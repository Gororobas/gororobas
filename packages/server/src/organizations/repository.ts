import { Context, Effect } from "effect"

import {
  deleteMembership,
  deleteRow,
  insertMembership,
  insertRow,
  updateMembership,
  updateRow,
} from "./mutations.js"
import {
  findById,
  findMembership,
  findOrganizationsWhereSoleManager,
  listMembers,
} from "./queries.js"

export class OrganizationsRepository extends Context.Service<OrganizationsRepository>()(
  "OrganizationsRepository",
  {
    make: Effect.succeed({
      deleteRow,
      deleteMembership,
      findById,
      findMembership,
      findOrganizationsWhereSoleManager,
      insertMembership,
      insertRow,
      listMembers,
      updateMembership,
      updateRow,
    } as const),
  },
) {}
