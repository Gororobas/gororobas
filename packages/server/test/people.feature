Feature: People
  People are the individual trusteds of the Gororobas community.
  Newcomers go through an approval process before gaining full access to what's shared by others.
  This protects community spaces while still allowing newcomers to explore and contribute.

  Scenario: Newcomers start without access to community content
    When a person completes signup
    Then they're treated as newcomers

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
      Given someone has the handle "maria-brasilia"
      When "Maria" tries to change their handle to "maria-brasilia"
      Then access is denied

  Rule: People can set their profile visibility

    Background:
      Given the following people exist:
        | name     | access_level |
        | Maria    | trusted      |
        | Irene    | trusted      |
        | Pedro    | newcomer     |
        | Gusttavo | blocked      |

    Scenario: Person sets profile to public
      When "Maria" has set their profile visibility to "public"
      Then "Maria"'s profile should have the following accessibility:
        | viewer   | can_access |
        | Irene    | yes        |
        | Pedro    | yes        |
        | Gusttavo | yes        |
        | visitors | yes        |

    Scenario: Person sets profile to trusted-only
      When "Maria" has set their profile visibility to "trusted"
      Then "Maria"'s profile should have the following accessibility:
        | viewer   | can_access |
        | Irene    | yes        |
        | Pedro    | no         |
        | Gusttavo | no         |
        | visitors | no         |

  Rule: Moderators and admins manage community access

    Background:
      Given the following people exist:
        | name   | access_level |
        | Ailton | admin        |
        | Ana    | moderator    |
        | Irene  | trusted      |
        | Pedro  | newcomer     |

    Scenario: Admin allows a person awaiting access
      When "Ailton" promotes "Pedro" to trusted
      Then "Pedro"'s becomes a full trusted

    Scenario: Moderator allows a person awaiting access
      When "Ana" promotes "Pedro" to trusted
      Then "Pedro"'s becomes  a full trusted

    Scenario: Trusted participant cannot allow people
      When "Irene" tries to promote "Pedro" to trusted
      Then access is denied

    Scenario: Admin blocks a person from accessing community content
      Given "Pedro" has been promoted to trusted
      When "Ailton" blocks "Pedro"'s access
      Then "Pedro" becomes blocked

    Scenario: Admin blocks and demotes a moderator
      When "Ailton" blocks "Ana"'s access
      Then "Ana" becomes blocked

  Rule: Admins manage people access levels

    Background:
      Given the following people exist:
        | name   | access_level |
        | Ailton | admin        |
        | Ana    | moderator    |
        | Maria  | trusted      |

    Scenario: Admin promotes trusted to moderator
      When "Ailton" promotes "Maria" to moderator
      Then "Maria"'s access_level becomes "moderator"

    Scenario: Admin promotes moderator to admin
      When "Ailton" promotes "Ana" to admin
      Then "Ana"'s access_level becomes "admin"

    Scenario: Admin demotes moderator to trusted
      When "Ailton" demotes "Ana" to trusted
      Then "Ana"'s access_level becomes "trusted"

    Scenario: Moderator cannot change access levels
      When "Ana" tries to promote "Maria" to moderator
      Then access is denied

    Scenario: Cannot demote the last admin
      Given "Ailton" is the only admin
      When "Ailton" tries to demote themselves
      Then access is denied

  Rule: People can delete their account

    Background:
      Given the following people exist:
        | name  | access_level |
        | Maria | trusted      |

    Scenario: Person deletes their account
      When "Maria" deletes their account
      Then "Maria"'s profile no longer exists
      And "Maria"'s personal posts are deleted
      And "Maria"'s comments are deleted

    Scenario: Deleted person's wiki contributions remain but are anonymized
      Given "Maria" has allowed edits on vegetable "Mandioca"
      When "Maria" deletes their account
      Then "Mandioca" revision history remains the same but no longer shows "Maria"

    Scenario: Cannot delete account as sole manager of an organization
      Given "Maria" is the only manager of "Sítio Semente"
      When "Maria" tries to delete their account
      Then access is denied

    Scenario: Deleting account removes organization membership
      Given "Maria" is an "editor" of "Sítio Semente"
      And "Sítio Semente" has other managers
      When "Maria" deletes their account
      Then "Maria" is no longer a member of "Sítio Semente"

    Scenario: Deleting sole member deletes the organization
      Given "Maria" is the only member of "Coletivo Raízes"
      When "Maria" deletes their account
      Then "Coletivo Raízes" no longer exists
