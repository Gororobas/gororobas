Feature: Resources
  The resources library is a public collection of links and references about agroecology.
  It is collaboratively maintained through a revision workflow.

  Rule: Resources are always public

    Background:
      Given the following people exist:
        | name  | access_level |
        | Maria | trusted      |
        | Pedro | newcomer     |
        | Ana   | moderator    |
      And the following resources exist:
        | title                         | url                              | format  |
        | A Terra Dá, a Terra Quer      | https://example.com/a-terra-da   | book    |
        | Agroecologia não é mercadoria | https://example.com/agro-podcast | podcast |

    Scenario: Person with community access creates a resource
      Then "Maria" can access the resource "A Terra Dá, a Terra Quer"

    Scenario: Person awaiting access cannot create resources
      Then "Pedro" can access the resource "A Terra Dá, a Terra Quer"

    Scenario: Visitors can access a resource
      Then visitors can access the resource "A Terra Dá, a Terra Quer"

  Rule: Only people with community access can contribute to the library

    Background:
      Given the following people exist:
        | name     | access_level |
        | Maria    | trusted      |
        | Pedro    | newcomer     |
        | Gusttavo | blocked      |

    Scenario: Person with community access creates a resource
      When "Maria" creates a resource with url "https://example.com/novo", format "book", and title "Manual de Compostagem"
      Then the resource is created
      And the resource is public

    Scenario: Person awaiting access cannot create resources
      When "Pedro" tries to create a resource
      Then access is denied

    Scenario: Blocked person cannot create resources
      When "Gusttavo" tries to create a resource
      Then access is denied

  Rule: All edits create revisions that need evaluation

    Background:
      Given the following people exist:
        | name  | access_level |
        | Maria | trusted      |
        | João  | trusted      |
      And the resource "A Terra Dá, a Terra Quer" exists

    Scenario: Trusted participant submits an edit for review
      When "Maria" edits resource "A Terra Dá, a Terra Quer" title to "A Terra Dá, a Terra Quer (Edição Revisada)"
      Then a revision is created with "pending" evaluation, created by "Maria"
      And the resource title remains "A Terra Dá, a Terra Quer"

    Scenario: Multiple pending revisions can coexist
      Given "Maria" has submitted an edit to resource "A Terra Dá, a Terra Quer"
      And "João" has submitted an edit to resource "A Terra Dá, a Terra Quer"
      Then there are 2 pending revisions for resource "A Terra Dá, a Terra Quer"

  Rule: Moderators and admins evaluate revisions

    Background:
      Given the following people exist:
        | name   | access_level |
        | Maria  | trusted      |
        | Ana    | moderator    |
        | Ailton | admin        |
      And the resource "A Terra Dá, a Terra Quer" exists

    Scenario: Moderator approves a revision
      Given "Maria" has submitted an edit changing resource "A Terra Dá, a Terra Quer" title to "A Terra Dá, a Terra Quer (Edição Revisada)"
      When "Ana" approves the revision
      Then the revision evaluation becomes "approved"
      And the revision shows evaluated by "Ana"
      And the resource title becomes "A Terra Dá, a Terra Quer (Edição Revisada)"

    Scenario: Admin approves a revision
      Given "Maria" has submitted an edit changing resource "A Terra Dá, a Terra Quer" title to "A Terra Dá, a Terra Quer (Edição Revisada)"
      When "Ailton" approves the revision
      Then the revision evaluation becomes "approved"
      And the revision shows evaluated by "Ailton"
      And the resource title becomes "A Terra Dá, a Terra Quer (Edição Revisada)"

    Scenario: Moderator rejects a revision
      Given "Maria" has submitted an edit changing resource "A Terra Dá, a Terra Quer" title to "Título incorreto"
      When "Ana" rejects the revision
      Then the revision evaluation becomes "rejected"
      And the resource title remains "A Terra Dá, a Terra Quer"

    Scenario: Trusted participant cannot evaluate revisions
      Given "Maria" has submitted an edit to resource "A Terra Dá, a Terra Quer"
      When "Maria" tries to approve the revision
      Then access is denied

  Rule: Resources support translations

    Background:
      Given "Maria" has community access
      And the resource "A Terra Dá, a Terra Quer" exists with Portuguese title "A Terra Dá, a Terra Quer"

    Scenario: Add translation to another locale
      Given "Maria" has submitted a Spanish translation for resource "A Terra Dá, a Terra Quer" with title "La Tierra Da, La Tierra Quiere"
      When the revision is approved
      Then resource "A Terra Dá, a Terra Quer" has Spanish title "La Tierra Da, La Tierra Quiere"

    Scenario: Viewing resource in unsupported locale falls back to original
      Given resource "A Terra Dá, a Terra Quer" has only Portuguese title "A Terra Dá, a Terra Quer"
      When a user with Spanish locale views resource "A Terra Dá, a Terra Quer"
      Then they see title "A Terra Dá, a Terra Quer"
      And they see an indicator that Spanish translation is unavailable

  Rule: Resources can be categorized with tags

    Background:
      Given "Maria" has community access
      And the following tags exist:
        | handle       |
        | agroecologia |
        | soberania    |
      And the resource "A Terra Dá, a Terra Quer" exists

    Scenario: Add tags to a resource
      When "Maria" tags resource "A Terra Dá, a Terra Quer" with "agroecologia" and "soberania"
      Then resource "A Terra Dá, a Terra Quer" is tagged with "agroecologia" and "soberania"

    Scenario: Tagging uses only predefined tags
      When "Maria" tries to tag resource "A Terra Dá, a Terra Quer" with "tag-inexistente"
      Then access is denied

  Rule: Resources can be linked to vegetables

    Background:
      Given "Maria" has community access
      And the vegetable "Mandioca" exists
      And the resource "A Terra Dá, a Terra Quer" exists

    Scenario: Link a resource to vegetables
      When "Maria" links resource "A Terra Dá, a Terra Quer" to vegetables "Mandioca"
      Then resource "A Terra Dá, a Terra Quer" is linked to vegetables "Mandioca"

  Rule: Resources have comments

    Background:
      Given the following people exist:
        | name  | access_level |
        | Maria | trusted      |
        | Pedro | newcomer     |
        | Ana   | moderator    |
      And the resource "Agroecologia não é mercadoria" exists

    Scenario: Person with community access comments on a resource
      When "Maria" comments on resource "Agroecologia não é mercadoria" with "Excelente episódio"
      Then the comment is visible on the resource

    Scenario: Person awaiting community access cannot comment on a resource
      When "Pedro" tries to comment on resource "Agroecologia não é mercadoria"
      Then access is denied

    Scenario: Moderator can censor a comment
      Given "Maria" has commented on resource "Agroecologia não é mercadoria"
      When "Ana" censors the comment
      Then the comment becomes hidden on the resource

  Rule: Following external links uses the redirect endpoint

    Background:
      Given the resource "A Terra Dá, a Terra Quer" exists with url "https://example.com/a-terra-da"

    Scenario: User follows a working resource link
      Given the resource link is working
      When they click the resource link
      Then they are redirected to "https://example.com/a-terra-da"

    Scenario: User follows a broken resource link
      Given the resource link is broken
      When they click the resource link
      Then they see a warning that the link may be broken
      And they can choose to proceed anyway
