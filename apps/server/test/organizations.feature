Feature: Organizations
  Organizations represent collectives such as territories, social movements and NGOs.
  They have profiles, memberships with organization access levels, and configurable visibility for their members list.

  Rule: Only people with community access can create organizations

    Background:
      Given the following people exist:
        | name     | accessLevel |
        | Maria    | COMMUNITY    |
        | Pedro    | NEWCOMER     |
        | Gusttavo | BLOCKED      |

    Scenario: Member with community access creates an organization
      When "Maria" creates an organization named "Sítio Semente" of type "TERRITORY"
      Then the organization "Sítio Semente" exists
      And "Maria" is a "MANAGER" of "Sítio Semente"

    Scenario: Person awaiting access cannot create an organization
      When "Pedro" tries to create an organization
      Then access is denied

    Scenario: Blocked person cannot create an organization
      When "Gusttavo" tries to create an organization
      Then access is denied

    Scenario: Visitor cannot create an organization
      When a visitor tries to create an organization
      Then access is denied

  Rule: Organization profile can only be edited by organization managers

    Background:
      Given the following people exist:
        | name  | accessLevel |
        | Maria | COMMUNITY    |
        | Irene | COMMUNITY    |
      And the organization "Sítio Semente" exists
      And the following memberships exist for "Sítio Semente":
        | name  | organizationAccessLevel |
        | Maria | MANAGER                 |
        | Irene | EDITOR                  |

    Scenario: Manager edits organization profile
      When "Maria" updates "Sítio Semente" profile name to "Sítio Semente (DF)"
      Then "Sítio Semente" profile name becomes "Sítio Semente (DF)"

    Scenario: Editor cannot edit organization profile
      When "Irene" tries to update "Sítio Semente" profile name
      Then access is denied

  Rule: Organization invitations create memberships

    Background:
      Given the following people exist:
        | name     | accessLevel |
        | Maria    | COMMUNITY    |
        | Teresa   | COMMUNITY    |
        | Irene    | COMMUNITY    |
        | Pedro    | NEWCOMER     |
        | Gusttavo | BLOCKED      |
      And the organization "Sítio Semente" exists
      And the following memberships exist for "Sítio Semente":
        | name  | organizationAccessLevel |
        | Maria | MANAGER                 |

    Scenario: Invitee accepts an invitation and becomes a member
      Given "Maria" has invited "Teresa" to join "Sítio Semente" as a "VIEWER"
      When "Teresa" accepts the invitation to join "Sítio Semente"
      Then "Teresa" is a "VIEWER" of "Sítio Semente"

    Scenario: Non-members can't invite people to an organization
      When "Irene" tries to invite "Teresa" to join "Sítio Semente"
      Then access is denied

    Scenario: Can't invite people without community access
      When "Maria" tries to invite "Pedro" to join "Sítio Semente"
      Then access is denied

    Scenario: Can't invite blocked people
      When "Maria" tries to invite "Gusttavo" to join "Sítio Semente"
      Then access is denied

    Scenario: Can't invite invalid people
      When "Maria" tries to invite "Fulana" to join "Sítio Semente"
      Then access is denied

  Rule: Managers handle organization memberships

    Background:
      Given the following people exist:
        | name   | accessLevel |
        | Maria  | COMMUNITY    |
        | Irene  | COMMUNITY    |
        | Teresa | COMMUNITY    |
        | Ana    | MODERATOR    |
      And the organization "Sítio Semente" exists
      And the following memberships exist for "Sítio Semente":
        | name   | organizationAccessLevel |
        | Maria  | MANAGER                 |
        | Irene  | MANAGER                 |
        | Teresa | VIEWER                  |

    Scenario: Manager promotes member to EDITOR
      When "Maria" promotes "Teresa" to "EDITOR" in "Sítio Semente"
      Then "Teresa" is an "EDITOR" of "Sítio Semente"

    Scenario: Non-MANAGER member cannot change organization access levels
      When "Teresa" tries to change "Irene"'s organization access level in "Sítio Semente"
      Then access is denied

    Scenario: Manager removes another member
      When "Maria" removes "Teresa" from "Sítio Semente"
      Then "Teresa" is no longer a member of "Sítio Semente"

    Scenario: Cannot remove the last MANAGER
      Given "Irene" is removed from "Sítio Semente"
      And "Maria" is the only MANAGER of "Sítio Semente"
      When "Maria" tries to leave "Sítio Semente"
      Then access is denied

    Scenario: Manager can leave if another manager exists
      When "Maria" leaves "Sítio Semente"
      Then "Maria" is no longer a member of "Sítio Semente"
      And "Irene" remains a "MANAGER" of "Sítio Semente"

  Rule: Organizations can be deleted by manager organization members

    Background:
      Given the following people exist:
        | name  | accessLevel |
        | Maria | COMMUNITY    |
        | Irene | COMMUNITY    |
      And the organization "Sítio Semente" exists
      And the following memberships exist for "Sítio Semente":
        | name  | organizationAccessLevel |
        | Maria | MANAGER                 |
        | Irene | EDITOR                  |

    Scenario: Manager deletes the organization
      When "Maria" deletes the organization "Sítio Semente"
      Then the organization "Sítio Semente" no longer exists

    Scenario: Non-manager cannot delete the organization
      When "Irene" tries to delete the organization "Sítio Semente"
      Then access is denied

  Rule: Organizations control the visibility of their members list

    Background:
      Given the following people exist:
        | name   | accessLevel |
        | Maria  | COMMUNITY    |
        | Irene  | COMMUNITY    |
        | Teresa | COMMUNITY    |
        | Pedro  | NEWCOMER     |
      And the organization "Sítio Semente" exists
      And the following members exist for "Sítio Semente":
        | name   | organizationAccessLevel |
        | Maria  | MANAGER                 |
        | Teresa | VIEWER                  |

    Scenario: Organization hides members from people outside the organization
      Given "Sítio Semente" only displays members in "PRIVATE"
      Then "Sítio Semente" members list should have the following accessibility:
        | viewer   | can_access |
        | visitors | no         |
        | Pedro    | no         |
        | Irene    | no         |
        | Maria    | yes        |
        | Teresa   | yes        |

    Scenario: Organization only shows members to the community
      Given "Sítio Semente" only displays members in "COMMUNITY"
      Then "Sítio Semente" members list should have the following accessibility:
        | viewer   | can_access |
        | visitors | no         |
        | Pedro    | no         |
        | Irene    | yes        |
        | Maria    | yes        |
        | Teresa   | yes        |

    Scenario: Organization only shows members to the public
      Given "Sítio Semente" only displays members in "PUBLIC"
      Then "Sítio Semente" members list should have the following accessibility:
        | viewer   | can_access |
        | visitors | yes        |
        | Pedro    | yes        |
        | Irene    | yes        |
        | Maria    | yes        |
        | Teresa   | yes        |
