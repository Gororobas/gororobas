Feature: People
  People are individual members with community access in the Gororobas community.
  Newcomers go through an approval process before gaining full access to what's shared by others.
  This protects community spaces while still allowing newcomers to explore and contribute.

  Scenario: Newcomers start without access to community content
    Given "Maria" has COMMUNITY access
    And "Maria" has a "COMMUNITY" profile
    And "Maria" has created a "COMMUNITY" post with content "Mutirão da comunidade"
    When "Pedro" completes signup
    Then "Pedro"'s accessLevel becomes "NEWCOMER"
    And "Pedro" cannot access "Maria"'s profile
    And "Pedro" cannot access the post publication

  Rule: People can manage their profile

    Background:
      Given "Maria" has COMMUNITY access

    Scenario: Person sets up their profile
      When "Maria" updates their profile with:
        | field    | value                   |
        | handle   | maria-da-terra          |
        | name     | Maria da Terra          |
        | bio      | Agricultora e educadora |
        | location | Brasília, DF            |
      Then their profile shows the updated information

    Scenario: Person changes their handle
      Given "Maria" has handle "maria"
      When "Maria" changes their handle to "maria-da-terra"
      Then their profile is accessible at "maria-da-terra"
      And their old handle "maria" is no longer valid

    Scenario: Handle must be unique
      Given "Maria" has handle "maria"
      And someone has the handle "maria-brasilia"
      When "Maria" tries to change their handle to "maria-brasilia"
      Then the change fails because the handle is already in use
      And "Maria"'s handle remains "maria"

  Rule: People can set their profile visibility

    Background:
      Given the following people exist:
        | name     | accessLevel |
        | Maria    | COMMUNITY   |
        | Irene    | COMMUNITY   |
        | Pedro    | NEWCOMER    |
        | Gusttavo | BLOCKED     |

    Scenario: Person sets profile to public
      When "Maria" has set their profile visibility to "PUBLIC"
      Then "Maria"'s profile should have the following accessibility:
        | viewer   | can_access |
        | Irene    | yes        |
        | Pedro    | yes        |
        | Gusttavo | yes        |
        | visitors | yes        |

    Scenario: Person sets profile to community-only
      When "Maria" has set their profile visibility to "COMMUNITY"
      Then "Maria"'s profile should have the following accessibility:
        | viewer   | can_access |
        | Irene    | yes        |
        | Pedro    | no         |
        | Gusttavo | no         |
        | visitors | no         |

  Rule: Moderators and admins manage community access

    Background:
      Given the following people exist:
        | name   | accessLevel |
        | Ailton | ADMIN       |
        | Ana    | MODERATOR   |
        | Irene  | COMMUNITY   |
        | Pedro  | NEWCOMER    |

    Scenario: Admin allows a person awaiting access
      When "Ailton" promotes "Pedro" to COMMUNITY
      Then "Pedro" becomes a member with community access

    Scenario: Moderator allows a person awaiting access
      When "Ana" promotes "Pedro" to COMMUNITY
      Then "Pedro" becomes a member with community access

    Scenario: Member with community access cannot allow people
      When "Irene" tries to promote "Pedro" to COMMUNITY
      Then access is denied

    Scenario: Admin blocks a person from accessing community content
      Given "Pedro" has been promoted to COMMUNITY
      When "Ailton" blocks "Pedro"'s access
      Then "Pedro" becomes blocked

    Scenario: Admin blocks and demotes a MODERATOR
      When "Ailton" blocks "Ana"'s access
      Then "Ana" becomes blocked

  Rule: Admins manage people access levels

    Background:
      Given the following people exist:
        | name   | accessLevel |
        | Ailton | ADMIN       |
        | Ana    | MODERATOR   |
        | Maria  | COMMUNITY   |

    Scenario: Admin promotes member with community access to MODERATOR
      When "Ailton" promotes "Maria" to MODERATOR
      Then "Maria"'s accessLevel becomes "MODERATOR"

    Scenario: Admin promotes MODERATOR to ADMIN
      When "Ailton" promotes "Ana" to ADMIN
      Then "Ana"'s accessLevel becomes "ADMIN"

    Scenario: Admin demotes MODERATOR to COMMUNITY
      When "Ailton" demotes "Ana" to COMMUNITY
      Then "Ana"'s accessLevel becomes "COMMUNITY"

    Scenario: MODERATOR cannot change access levels
      When "Ana" tries to promote "Maria" to MODERATOR
      Then access is denied

    Scenario: Cannot demote the last ADMIN
      Given "Ailton" is the only ADMIN
      When "Ailton" tries to demote themselves
      Then access is denied

  Rule: People can delete their account
    Deletion requires confirmation of content deletion.
    A sole manager must transfer management if other organization members remain.
    A sole member can instead confirm deletion of their organization and its content.

    Background:
      Given the following people exist:
        | name  | accessLevel |
        | Maria | COMMUNITY   |

    Scenario: Person deletes their account
      When "Maria" confirms deletion of their account and personal content
      Then "Maria"'s profile no longer exists
      And "Maria"'s personal publications are deleted
      And "Maria"'s comments are deleted

    Scenario: Deleted person's wiki contributions remain but are anonymized
      Given "Maria" has approved revisions on wiki article "Mandioca"
      When "Maria" confirms deletion of their account and personal content
      Then "Mandioca" revision history remains the same but no longer shows "Maria"

    Scenario: Cannot delete account as sole MANAGER when other organization members remain
      Given "Maria" is the only MANAGER of "Sítio Semente"
      And "Sítio Semente" has other members
      When "Maria" tries to delete their account
      Then account deletion fails because "Sítio Semente" would have members without a manager
      And "Maria"'s account and organization membership remain unchanged

    Scenario: Deleting account removes organization membership
      Given "Maria" is an "EDITOR" of "Sítio Semente"
      And "Sítio Semente" has other MANAGERs
      When "Maria" confirms deletion of their account and personal content
      Then "Maria" is no longer a member of "Sítio Semente"

    Scenario: Sole member must confirm organization deletion
      Given "Maria" is the only member and MANAGER of "Coletivo Raízes"
      When "Maria" requests account deletion without confirming organization deletion
      Then they are asked to confirm deletion of "Coletivo Raízes" and its content
      And "Maria"'s account still exists
      And "Coletivo Raízes" still exists

    Scenario: Deleting sole member deletes the organization after confirmation
      Given "Maria" is the only member and MANAGER of "Coletivo Raízes"
      When "Maria" confirms deletion of their account, "Coletivo Raízes", and their content
      Then "Maria"'s profile no longer exists
      And "Coletivo Raízes" no longer exists
      And "Coletivo Raízes"'s publications are deleted
