import { Context, Effect } from "effect"

import {
  insertInvitation,
  updateInvitation,
  deleteMembership,
  deleteRow,
  insertMembership,
  insertRow,
  updateMembership,
  updateRow,
} from "./mutations.js"
import {
  listInvitations,
  findInvitation,
  findPersonEmail,
  findById,
  findMembership,
  findOrganizationsWhereSoleManager,
  listMembers,
} from "./queries.js"

export class OrganizationsRepository extends Context.Service<OrganizationsRepository>()(
  "OrganizationsRepository",
  {
    make: Effect.succeed({
      listInvitations,
      findInvitation,
      findPersonEmail,
      insertInvitation,
      updateInvitation,
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
