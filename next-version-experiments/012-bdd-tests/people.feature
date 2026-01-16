Feature: People
  People are the individual members of the Gororobas community.
  New members go through an approval process before gaining full access to what's shared by others.
  This protects community spaces while still allowing newcomers to explore and contribute.

  Rule: New members start with pending approval status

    Scenario: Person signs up and receives pending status
      When a person completes signup
      Then their approval status is "pending"
      And their role is "participant"

  Rule: People can manage their profile

    Background:
      Given "Maria" is an approved member

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
      Then access is denied: handle already taken

  Rule: People can set their profile visibility

    Background:
      Given the following people exist:
        | name  | role        | approval_status |
        | Maria | participant | approved        |
        | Irene | participant | approved        |

    Scenario: Person sets profile to public
      When "Maria" has set their profile visibility to "public"
      Then "Maria"'s profile should have the following accessibility:
        | viewer   | can_access |
        | Irene    | yes        |
        | visitors | yes        |

    Scenario: Person sets profile to community-only
      When "Maria" has set their profile visibility to "community"
      Then "Maria"'s profile should have the following accessibility:
        | viewer   | can_access |
        | Irene    | yes        |
        | visitors | no         |

  Rule: Moderators and admins manage member approval

    Background:
      Given the following people exist:
        | name   | role        | approval_status |
        | Ailton | admin       | approved        |
        | Ana    | moderator   | approved        |
        | Irene  | participant | approved        |
        | Pedro  | participant | pending         |

    Scenario: Admin approves a pending member
      When "Ailton" approves "Pedro"
      Then "Pedro"'s approval status becomes "approved"

    Scenario: Moderator approves a pending member
      When "Ana" approves "Pedro"
      Then "Pedro"'s approval status becomes "approved"

    Scenario: Participant cannot approve members
      When "Irene" tries to approve "Pedro"
      Then access is denied

    Scenario: Admin disapproves a member
      Given "Pedro" has been approved
      When "Ailton" disapproves "Pedro"
      Then "Pedro"'s approval status becomes "disapproved"

    Scenario: Cannot disapprove a moderator without demoting first
      When "Ailton" tries to disapprove "Ana"
      Then access is denied

  Rule: Admins manage member roles

    Background:
      Given the following people exist:
        | name   | role        | approval_status |
        | Ailton | admin       | approved        |
        | Ana    | moderator   | approved        |
        | Maria  | participant | approved        |

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

    Scenario: Cannot demote the last admin
      Given "Ailton" is the only admin
      When "Ailton" tries to demote themselves
      Then access is denied

  Rule: People can delete their account

    Background:
      Given the following people exist:
        | name  | role        | approval_status |
        | Maria | participant | approved        |

    Scenario: Person deletes their account
      When "Maria" deletes their account
      Then "Maria"'s profile no longer exists
      And "Maria"'s personal notes are deleted
      And "Maria"'s comments are deleted

    Scenario: Deleted person's wiki contributions remain but are anonymized
      Given "Maria" has approved edits on vegetable "Mandioca"
      When "Maria" deletes their account
      Then "Mandioca" revision history remains the same but no longer shows "Maria"

    Scenario: Cannot delete account while sole admin of an organization
      Given "Maria" is the only admin of "Sítio Semente"
      When "Maria" tries to delete their account
      Then access is denied

    Scenario: Deleting account removes organization memberships
      Given "Maria" is a member of "Sítio Semente" with "edit" permissions
      And "Sítio Semente" has other admins
      When "Maria" deletes their account
      Then "Maria" is no longer a member of "Sítio Semente"

    Scenario: Deleting sole member deletes the organization
      Given "Maria" is the only member of "Coletivo Raízes"
      When "Maria" deletes their account
      Then "Coletivo Raízes" no longer exists
