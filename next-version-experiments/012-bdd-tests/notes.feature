Feature: Notes
  People can share notes, that can be as short as a tweet or as large as an essay.
  Notes are tied to a specific profile, be it an organization or a person.

  Rule: The three levels of personal notes visibility

    Background:
      Given the following people exist:
        | name     | role        | access           |
        | Ailton   | admin       | approved         |
        | Ana      | moderator   | approved         |
        | Irene    | participant | approved         |
        | Pedro    | participant | pending_approval |
        | Gusttavo | participant | disapproved      |

    Scenario: Approved person creates truly public notes
      Given "Ailton" is logged in
      When they create a "public" note under their profile
      Then the note is created in "Ailton"'s profile
      And the note is visible to "Irene"
      And the note is visible to "Ailton"
      And the note is visible to "Pedro"
      And the note is visible to "Gusttavo"
      And the note is visible to visitors

    Scenario: Approved person creates community-only notes
      Community notes are safe spaces and can't be accessed by visitors or participants with unapproved access (pending or blocked)

      Given "Ailton" is logged in
      When they create a "community" note under their profile
      Then the note is created in "Ailton"'s profile
      And the note is visible to "Ailton"
      And the note is visible to "Ana"
      And the note is visible to "Irene"
      And the note is not visible to "Pedro"
      And the note is not visible to "Gusttavo"

    Scenario: Approved person creates private note
      Private means PRIVATE. Not even Admins should snoop

      Given "Irene" is logged in
      When they create a "private" note under their profile
      Then the note is created in "Irene"'s profile
      And the note is visible to "Irene"
      And the note is not visible to "Ailton"
      And the note is not visible to "Ana"
      And the note is not visible to "Pedro"
      And the note is not visible to "Gusttavo"

    Scenario: Person with pending access creates note
      However, no participant can see their notes, only admins and moderators.
      Not even public notes become truly public.

      Given "Pedro" is logged in
      When they create a "public" note under their profile
      Then the note is created in "Pedro"'s profile
      And the note is visible to "Pedro"
      And the note is visible to "Ailton"
      And the note is visible to "Ana"
      And the note is not visible to "Irene"
      And the note is not visible to "Gusttavo"

    Scenario: Disapproved person tries to create note
      Given "Gusttavo" is logged in
      When they create a "public" note under their profile
      Then the creation is denied

  Rule: Organizational notes management

    Background:
      Given the organization "Sítio Semente" exists
      And the following people exist:
        | name   | access   |
        | Maria  | approved |
        | Joao   | approved |
        | Teresa | approved |
        | Xavier | approved |
      And the following memberships exist for "Sítio Semente":
        | name   | permissions |
        | Maria  | full        |
        | Joao   | edit        |
        | Teresa | view        |
      # Xavier is not a member

    Scenario: Editor publishes a community-only note
      Given "Joao" is logged in
      When they create a "community" note under "Sítio Semente" profile
      Then the note is visible to "Teresa"
      Then the note is visible to "Xavier"
      And the note is not visible to visitors

    Scenario: Editor publishes an internal note (Private)
      In Organizations, private notes functions as an internal memo or draft for the team

      Given "Joao" is logged in
      When they create a "private" note under "Sítio Semente" profile
      Then the note is visible to "Maria"
      And the note is visible to "Joao"
      And the note is visible to "Teresa"
      And the note is not visible to "Xavier"

    Scenario: Editor edits an existing organization note
      Editors manage content, so they can edit posts made by others in the organization.

      Given a note "Mutirão Sábado" exists on "Sítio Semente" profile created by "Maria"
      And "Joao" is logged in
      When they edit the note content to "Mutirão Domingo"
      Then the note content should be updated

    Scenario: Viewer cannot edit organization notes
      Given a note "Boas vindas" exists on "Sítio Semente" profile
      And "Teresa" is logged in
      When they try to edit the note
      Then the note content should remain unchanged

    Scenario: Person with Full permissions deletes any note
      Given a note "Post polêmico" exists on "Sítio Semente" profile created by "Joao"
      And "Maria" is logged in
      When they delete the note
      Then the note should be deleted

    Scenario: Editor deletes a note
      Given a note "Erro de digitação" exists on "Sítio Semente" profile
      And "Joao" is logged in
      When they delete the note
      Then the note should be deleted

    Scenario: Viewer cannot delete notes
      Given a note "Documento Importante" exists on "Sítio Semente" profile
      And "Teresa" is logged in
      When they try to delete the note
      Then the note should still exist

  Rule: Content Auditability (Who changed what?)

    Background:
      Given the organization "Sítio Semente" exists
      And the following people exist:
        | name  | permissions |
        | Maria | full        |
        | Joao  | edit        |

    Scenario: Organization keeps history of edits with author attribution
      Given "Maria" creates a note with content "Reunião cancelada" under "Sítio Semente"'s profile
      When "Joao" logs in
      And they edit the note content to "Reunião adiada para amanhã"
      Then the note content should be "Reunião adiada para amanhã"
      And the note history should contain 2 versions
      And version 1 should be authored by "Maria" with content "Reunião cancelada"
      And version 2 should be authored by "Joao" with content "Reunião adiada para amanhã"
