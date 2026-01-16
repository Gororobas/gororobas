Feature: Organizations
  Organizations represent collectives such as territories, social movements and NGOs.
  They have profiles, memberships with permissions, and a configurable behavior for displaying members.

  Rule: Only approved members can create organizations

    Background:
      Given the following people exist:
        | name     | role        | approval_status |
        | Maria    | participant | approved        |
        | Pedro    | participant | pending         |
        | Gusttavo | participant | disapproved     |

    Scenario: Approved member creates an organization
      When "Maria" creates an organization named "Sítio Semente" of type "territory"
      Then the organization "Sítio Semente" exists
      And "Maria" is a member of "Sítio Semente" with "full" permissions

    Scenario: Pending member cannot create an organization
      When "Pedro" tries to create an organization
      Then access is denied

    Scenario: Disapproved member cannot create an organization
      When "Gusttavo" tries to create an organization
      Then access is denied

    Scenario: Visitor cannot create an organization
      When visitor tries to create an organization
      Then access is denied

  Rule: Organization profile can only be edited by full-permission members

    Background:
      Given the following people exist:
        | name  | role        | approval_status |
        | Maria | participant | approved        |
        | Joao  | participant | approved        |
      And the organization "Sítio Semente" exists
      And the following memberships exist for "Sítio Semente":
        | name  | permissions |
        | Maria | full        |
        | Joao  | edit        |

    Scenario: Full member edits organization profile
      When "Maria" updates "Sítio Semente" profile name to "Sítio Semente (DF)"
      Then "Sítio Semente" profile name becomes "Sítio Semente (DF)"

    Scenario: Editor cannot edit organization profile
      When "Joao" tries to update "Sítio Semente" profile name
      Then access is denied

  Rule: Organization invitations create memberships

    Background:
      Given the following people exist:
        | name     | role        | approval_status |
        | Maria    | participant | approved        |
        | Teresa   | participant | approved        |
        | João     | participant | approved        |
        | Pedro    | participant | pending         |
        | Gusttavo | participant | disapproved     |
      And the organization "Sítio Semente" exists
      And the following memberships exist for "Sítio Semente":
        | name  | permissions |
        | Maria | full        |

    Scenario: Invitee accepts an invitation and becomes a member
      Given "Maria" has invited "Teresa" to join "Sítio Semente" with "view" permissions
      When "Teresa" accepts the invitation to join "Sítio Semente"
      Then "Teresa" is a member of "Sítio Semente" with "view" permissions

    Scenario: Non-members can't invite people to an organization
      When "João" tries to invite "Teresa" to join "Sítio Semente"
      Then access is denied

    Scenario: Can't invite pending members to an organization
      When "Maria" tries to invite "Pedro" to join "Sítio Semente"
      Then access is denied

    Scenario: Can't invite disapproved members to an organization
      When "Maria" tries to invite "Gusttavo" to join "Sítio Semente"
      Then access is denied

    Scenario: Can't invite invalid members to an organization
      When "Maria" tries to invite "Fulana" to join "Sítio Semente"
      Then access is denied

  Rule: Full members manage organization memberships

    Background:
      Given the following people exist:
        | name   | role        | approval_status |
        | Maria  | participant | approved        |
        | Joao   | participant | approved        |
        | Teresa | participant | approved        |
        | Ana    | moderator   | approved        |
      And the organization "Sítio Semente" exists
      And the following memberships exist for "Sítio Semente":
        | name   | permissions |
        | Maria  | full        |
        | Joao   | full        |
        | Teresa | view        |

    Scenario: Full member changes another member permissions
      When "Maria" changes "Teresa" permissions in "Sítio Semente" to "edit"
      Then "Teresa" is a member of "Sítio Semente" with "edit" permissions

    Scenario: Non-full member cannot change permissions
      When "Teresa" tries to change "Joao" permissions in "Sítio Semente"
      Then access is denied

    Scenario: Full member removes a member
      When "Maria" removes "Teresa" from "Sítio Semente"
      Then "Teresa" is not a member of "Sítio Semente"

    Scenario: Cannot remove the last full member
      Given "Joao" is removed from "Sítio Semente"
      And "Maria" is the only full member of "Sítio Semente"
      When "Maria" tries to remove themselves from "Sítio Semente"
      Then access is denied

    Scenario: Full member can leave if there is another full member
      When "Maria" leaves "Sítio Semente"
      Then "Maria" is not a member of "Sítio Semente"
      And "Joao" remains a member of "Sítio Semente" with "full" permissions

  Rule: Organizations can be deleted by full-permission members

    Background:
      Given the following people exist:
        | name  | role        | approval_status |
        | Maria | participant | approved        |
        | Joao  | participant | approved        |
      And the organization "Sítio Semente" exists
      And the following memberships exist for "Sítio Semente":
        | name  | permissions |
        | Maria | full        |
        | Joao  | edit        |

    Scenario: Full member deletes the organization
      When "Maria" deletes the organization "Sítio Semente"
      Then the organization "Sítio Semente" no longer exists

    Scenario: Non-full member cannot delete the organization
      When "Joao" tries to delete the organization "Sítio Semente"
      Then access is denied

  Rule: Organizations control how members are displayed

    Background:
      Given the following people exist:
        | name   | role        | approval_status |
        | Maria  | participant | approved        |
        | Joao   | participant | approved        |
        | Teresa | participant | approved        |
        | Pedro  | participant | pending         |
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
        | João     | no         |
        | Maria    | yes        |
        | Teresa   | yes        |

    Scenario: Organization only shows members to the community
      Given "Sítio Semente" only displays members in "community"
      Then "Sítio Semente" members list should have the following accessibility:
        | viewer   | can_access |
        | visitors | no         |
        | Pedro    | no         |
        | João     | yes        |
        | Maria    | yes        |
        | Teresa   | yes        |

    Scenario: Organization only shows members to the public
      Given "Sítio Semente" only displays members in "public"
      Then "Sítio Semente" members list should have the following accessibility:
        | viewer   | can_access |
        | visitors | yes        |
        | Pedro    | yes        |
        | João     | yes        |
        | Maria    | yes        |
        | Teresa   | yes        |
