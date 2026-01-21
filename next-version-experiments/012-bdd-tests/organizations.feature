Feature: Organizations
  Organizations represent collectives such as territories, social movements and NGOs.
  They have profiles, memberships with permissions, and configurable visibility for their members list.

  Rule: Only people with allowed community access can create organizations

    Background:
      Given the following people exist:
        | name     | access_level |
        | Maria    | trusted      |
        | Pedro    | newcomer     |
        | Gusttavo | blocked      |

    Scenario: Trusted participant creates an organization
      When "Maria" creates an organization named "Sítio Semente" of type "territory"
      Then the organization "Sítio Semente" exists
      And "Maria" is an organization member of "Sítio Semente" with "full" permissions

    Scenario: Person awaiting access cannot create an organization
      When "Pedro" tries to create an organization
      Then access is denied

    Scenario: Blocked person cannot create an organization
      When "Gusttavo" tries to create an organization
      Then access is denied

    Scenario: Visitor cannot create an organization
      When a visitor tries to create an organization
      Then access is denied

  Rule: Organization profile can only be edited by full-permissions organization members

    Background:
      Given the following people exist:
        | name  | access_level |
        | Maria | trusted      |
        | Irene | trusted      |
      And the organization "Sítio Semente" exists
      And the following memberships exist for "Sítio Semente":
        | name  | permissions |
        | Maria | full        |
        | Irene | edit        |

    Scenario: Full-permissions member edits organization profile
      When "Maria" updates "Sítio Semente" profile name to "Sítio Semente (DF)"
      Then "Sítio Semente" profile name becomes "Sítio Semente (DF)"

    Scenario: Editor cannot edit organization profile
      When "Irene" tries to update "Sítio Semente" profile name
      Then access is denied

  Rule: Organization invitations create memberships

    Background:
      Given the following people exist:
        | name     | access_level |
        | Maria    | trusted      |
        | Teresa   | trusted      |
        | Irene    | trusted      |
        | Pedro    | newcomer     |
        | Gusttavo | blocked      |
      And the organization "Sítio Semente" exists
      And the following memberships exist for "Sítio Semente":
        | name  | permissions |
        | Maria | full        |

    Scenario: Invitee accepts an invitation and becomes a member
      Given "Maria" has invited "Teresa" to join "Sítio Semente" with "view" permissions
      When "Teresa" accepts the invitation to join "Sítio Semente"
      Then "Teresa" is an organization member of "Sítio Semente" with "view" permissions

    Scenario: Non-members can't invite people to an organization
      When "Irene" tries to invite "Teresa" to join "Sítio Semente"
      Then access is denied

    Scenario: Can't invite people without allowed community access
      When "Maria" tries to invite "Pedro" to join "Sítio Semente"
      Then access is denied

    Scenario: Can't invite blocked people
      When "Maria" tries to invite "Gusttavo" to join "Sítio Semente"
      Then access is denied

    Scenario: Can't invite invalid people
      When "Maria" tries to invite "Fulana" to join "Sítio Semente"
      Then access is denied

  Rule: Full members manage organization memberships

    Background:
      Given the following people exist:
        | name   | access_level |
        | Maria  | trusted      |
        | Irene  | trusted      |
        | Teresa | trusted      |
        | Ana    | moderator    |
      And the organization "Sítio Semente" exists
      And the following memberships exist for "Sítio Semente":
        | name   | permissions |
        | Maria  | full        |
        | Irene  | full        |
        | Teresa | view        |

    Scenario: Full-permissions member changes another member permissions
      When "Maria" changes "Teresa" permissions in "Sítio Semente" to "edit"
      Then "Teresa" is an organization member of "Sítio Semente" with "edit" permissions

    Scenario: Non-full-permissions member cannot change permissions
      When "Teresa" tries to change "Irene" permissions in "Sítio Semente"
      Then access is denied

    Scenario: Full-permissions member removes a member
      When "Maria" removes "Teresa" from "Sítio Semente"
      Then "Teresa" is not an organization member of "Sítio Semente"

    Scenario: Cannot remove the last full-permissions member
      Given "Irene" is removed from "Sítio Semente"
      And "Maria" is the only full-permissions member of "Sítio Semente"
      When "Maria" tries to remove themselves from "Sítio Semente"
      Then access is denied

    Scenario: Full member can leave if there is another full-permissions member
      When "Maria" leaves "Sítio Semente"
      Then "Maria" is not a member of "Sítio Semente"
      And "Irene" remains a member of "Sítio Semente" with "full" permissions

  Rule: Organizations can be deleted by full-permission organization members

    Background:
      Given the following people exist:
        | name  | access_level |
        | Maria | trusted      |
        | Irene | trusted      |
      And the organization "Sítio Semente" exists
      And the following memberships exist for "Sítio Semente":
        | name  | permissions |
        | Maria | full        |
        | Irene | edit        |

    Scenario: Full member deletes the organization
      When "Maria" deletes the organization "Sítio Semente"
      Then the organization "Sítio Semente" no longer exists

    Scenario: Non-full member cannot delete the organization
      When "Irene" tries to delete the organization "Sítio Semente"
      Then access is denied

  Rule: Organizations control the visibility of their members list

    Background:
      Given the following people exist:
        | name   | access_level |
        | Maria  | trusted      |
        | Irene  | trusted      |
        | Teresa | trusted      |
        | Pedro  | newcomer     |
      And the organization "Sítio Semente" exists
      And the following memberships exist for "Sítio Semente":
        | name   | permissions |
        | Maria  | full        |
        | Teresa | view        |

    Scenario: Organization hides members from people outside the organization
      Given "Sítio Semente" only displays members in "private"
      Then "Sítio Semente" members list should have the following accessibility:
        | viewer   | can_access |
        | visitors | no         |
        | Pedro    | no         |
        | Irene    | no         |
        | Maria    | yes        |
        | Teresa   | yes        |

    Scenario: Organization only shows members to the community
      Given "Sítio Semente" only displays members in "community"
      Then "Sítio Semente" members list should have the following accessibility:
        | viewer   | can_access |
        | visitors | no         |
        | Pedro    | no         |
        | Irene    | yes        |
        | Maria    | yes        |
        | Teresa   | yes        |

    Scenario: Organization only shows members to the public
      Given "Sítio Semente" only displays members in "public"
      Then "Sítio Semente" members list should have the following accessibility:
        | viewer   | can_access |
        | visitors | yes        |
        | Pedro    | yes        |
        | Irene    | yes        |
        | Maria    | yes        |
        | Teresa   | yes        |
