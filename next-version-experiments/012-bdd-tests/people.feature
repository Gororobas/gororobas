Feature: People
  People are the individual participants of the Gororobas community.
  Newcomers go through an approval process before gaining full access to what's shared by others.
  This protects community spaces while still allowing newcomers to explore and contribute.

  Scenario: Newcomers start without access to community content
    When a person completes signup
    Then their community access is "awaiting_access"
    And their role is "participant"

  Rule: People can manage their profile

    Background:
      Given "Maria" has community access

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
      Given "João" has handle "joao"
      When "Maria" tries to change their handle to "joao"
      Then access is denied

  Rule: People can set their profile visibility

    Background:
      Given the following people exist:
        | name     | role        | community_access |
        | Maria    | participant | allowed          |
        | Irene    | participant | allowed          |
        | Pedro    | participant | awaiting_access  |
        | Gusttavo | participant | blocked          |

    Scenario: Person sets profile to public
      When "Maria" has set their profile visibility to "public"
      Then "Maria"'s profile should have the following accessibility:
        | viewer   | can_access |
        | Irene    | yes        |
        | Pedro    | yes        |
        | Gusttavo | yes        |
        | visitors | yes        |

    Scenario: Person sets profile to community-only
      When "Maria" has set their profile visibility to "community"
      Then "Maria"'s profile should have the following accessibility:
        | viewer   | can_access |
        | Irene    | yes        |
        | Pedro    | no         |
        | Gusttavo | no         |
        | visitors | no         |

  Rule: Moderators and admins manage community access

    Background:
      Given the following people exist:
        | name   | role        | community_access |
        | Ailton | admin       | allowed          |
        | Ana    | moderator   | allowed          |
        | Irene  | participant | allowed          |
        | Pedro  | participant | awaiting_access  |

    Scenario: Admin allows a person awaiting access
      When "Ailton" allows "Pedro"
      Then "Pedro"'s community access becomes "allowed"

    Scenario: Moderator allows a person awaiting access
      When "Ana" allows "Pedro"
      Then "Pedro"'s community access becomes "allowed"

    Scenario: Participant cannot allow people
      When "Irene" tries to allow "Pedro"
      Then access is denied

    Scenario: Admin blocks a person from accessing community content
      Given "Pedro" has been allowed to access community content
      When "Ailton" blocks "Pedro"
      Then "Pedro"'s community access becomes "blocked"

    Scenario: Cannot block a moderator without demoting first
      When "Ailton" tries to block "Ana"
      Then access is denied

  Rule: Admins manage people roles

    Background:
      Given the following people exist:
        | name   | role        | community_access |
        | Ailton | admin       | allowed          |
        | Ana    | moderator   | allowed          |
        | Maria  | participant | allowed          |

    Scenario: Admin promotes participant to moderator
      When "Ailton" promotes "Maria" to moderator
      Then "Maria"'s role becomes "moderator"

    Scenario: Admin promotes moderator to admin
      When "Ailton" promotes "Ana" to admin
      Then "Ana"'s role becomes "admin"

    Scenario: Admin demotes moderator to participant
      When "Ailton" demotes "Ana" to participant
      Then "Ana"'s role becomes "participant"

    Scenario: Moderator cannot change roles
      When "Ana" tries to promote "Maria" to moderator
      Then access is denied

    Scenario: Cannot demote the last full-permissions member
      Given "Ailton" is the only full-permissions member
      When "Ailton" tries to demote themselves
      Then access is denied

  Rule: People can delete their account

    Background:
      Given the following people exist:
        | name  | role        | community_access |
        | Maria | participant | allowed          |

    Scenario: Person deletes their account
      When "Maria" deletes their account
      Then "Maria"'s profile no longer exists
      And "Maria"'s personal posts are deleted
      And "Maria"'s comments are deleted

    Scenario: Deleted person's wiki contributions remain but are anonymized
      Given "Maria" has allowed edits on vegetable "Mandioca"
      When "Maria" deletes their account
      Then "Mandioca" revision history remains the same but no longer shows "Maria"

    Scenario: Cannot delete account while sole full-permissions member of an organization
      Given "Maria" is the only full-permissions member of "Sítio Semente"
      When "Maria" tries to delete their account
      Then access is denied

    Scenario: Deleting account removes organization memberships
      Given "Maria" is a member of "Sítio Semente" with "edit" permissions
      And "Sítio Semente" has other full-permission members
      When "Maria" deletes their account
      Then "Maria" is no longer a member of "Sítio Semente"

    Scenario: Deleting sole member deletes the organization
      Given "Maria" is the only member of "Coletivo Raízes"
      When "Maria" deletes their account
      Then "Coletivo Raízes" no longer exists
