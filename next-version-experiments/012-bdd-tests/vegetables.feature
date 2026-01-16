Feature: Vegetables
  The vegetable encyclopedia is a collaborative wiki of hundreds of species.
  Community members contribute knowledge about agroecological properties.

  Rule: Only approved members can contribute to the encyclopedia

    Background:
      Given the following people exist:
        | name     | role        | approval_status |
        | Maria    | participant | approved        |
        | Pedro    | participant | pending         |
        | Gusttavo | participant | disapproved     |

    Scenario: Approved member creates a new vegetable
      When "Maria" creates a vegetable
      Then the vegetable is created
      And the vegetable is immediately visible in the encyclopedia

    Scenario: Pending member cannot create vegetables
      When "Pedro" tries to create a vegetable
      Then access is denied

    Scenario: Disapproved member cannot create vegetables
      When "Gusttavo" tries to create a vegetable
      Then access is denied

  Rule: All edits create revisions that need evaluation

    Background:
      Given the following people exist:
        | name  | role        | approval_status |
        | Maria | participant | approved        |
        | João  | participant | approved        |
      And the vegetable "Mandioca" exists with content "Raiz tuberosa"

    Scenario: Participant submits an edit for review
      When "Maria" edits "Mandioca" content to "Raiz tuberosa rica em amido"
      Then a revision is created with:
        | field      | value   |
        | evaluation | pending |
        | created_by | Maria   |
      And the vegetable content remains "Raiz tuberosa"

    Scenario: Multiple pending revisions can coexist
      Given "Maria" has submitted an edit to "Mandioca"
      And "João" has submitted an edit to "Mandioca"
      Then there are 2 pending revisions for "Mandioca"
      And the vegetable content remains "Raiz tuberosa"

  Rule: Moderators and admins evaluate revisions

    Background:
      Given the following people exist:
        | name   | role        | approval_status |
        | Maria  | participant | approved        |
        | Ana    | moderator   | approved        |
        | Ailton | admin       | approved        |
      And the vegetable "Mandioca" exists with content "Raiz tuberosa"

    Scenario: Moderator approves a revision
      Given "Maria" has submitted an edit changing "Mandioca" content to "Raiz rica em amido"
      When "Ana" approves the revision
      Then the revision evaluation becomes "approved"
      And the revision shows evaluated by "Ana"
      And the vegetable content becomes "Raiz rica em amido"

    Scenario: Admin approves a revision
      Given "Maria" has submitted an edit changing "Mandioca" content to "Raiz rica em amido"
      When "Ailton" approves the revision
      Then the revision evaluation becomes "approved"
      And the revision shows evaluated by "Ailton"
      And the vegetable content becomes "Raiz rica em amido"

    Scenario: Moderator rejects a revision
      Given "Maria" has submitted an edit changing "Mandioca" content to "Informação incorreta"
      When "Ana" rejects the revision
      Then the revision evaluation becomes "rejected"
      And the vegetable content remains "Raiz tuberosa"

    Scenario: Participant cannot evaluate revisions
      Given "Maria" has submitted an edit to "Mandioca"
      When "Maria" tries to approve the revision
      Then access is denied

    Scenario: Rejected revisions remain in history
      Given "Maria" has submitted an edit to "Mandioca"
      And "Ana" has rejected the revision
      When viewing "Mandioca" revision history
      Then the rejected revision is visible with its rejection status

  Rule: Moderators and admins can self-approve their edits

    Background:
      Given the following people exist:
        | name   | role      | approval_status |
        | Ana    | moderator | approved        |
        | Ailton | admin     | approved        |
      And the vegetable "Mandioca" exists with content "Raiz tuberosa"

    Scenario: Moderator can approve their own revision
      Given "Ana" has submitted an edit changing "Mandioca" content to "Raiz rica em amido"
      When "Ana" approves the revision
      Then the vegetable content becomes "Raiz rica em amido"
      And the revision shows "Ana" as both editor and evaluator

    Scenario: Admin can approve their own revision
      Given "Ailton" has submitted an edit changing "Mandioca" content to "Raiz rica em amido"
      When "Ailton" approves the revision
      Then the vegetable content becomes "Raiz rica em amido"

  Rule: Vegetables support multiple translations

    Background:
      Given "Maria" is an approved member
      And the vegetable "Mandioca" exists with Portuguese content "Raiz tuberosa"

    Scenario: Add translation to another locale
      Given "Maria" has submitted a Spanish translation for "Mandioca" with content "Raíz rica en almidón"
      When the revision is approved
      Then "Mandioca" has Spanish content "Raíz rica en almidón"

    Scenario: Viewing vegetable in unsupported locale falls back to original
      Given "Mandioca" has only Portuguese content "Raiz tuberosa"
      When a user with Spanish locale views "Mandioca"
      Then they see content "Raiz tuberosa"
      And they see an indicator that Spanish translation is unavailable

    Scenario: Edit existing translation
      Given "Mandioca" has Spanish content "Raíz"
      And "Maria" has submitted an edit to "Mandioca" Spanish content "Raíz tuberosa"
      When the revision is approved
      Then "Mandioca" Spanish content becomes "Raíz tuberosa"

  Rule: Vegetables can have varieties

    Background:
      Given "Maria" is an approved member
      And the vegetable "Banana" exists

    Scenario: Create a variety
      When "Maria" creates a variety for "Banana" with:
        | field        | value        |
        | handle       | banana-prata |
        | common_names | Banana Prata |
      Then the variety "Banana Prata" is created under "Banana"

    Scenario: Variety inherits parent properties by default
      Given "Banana" has lifecycle "perene"
      When "Maria" creates a variety "Banana Prata" without specifying lifecycle
      Then "Banana Prata" shows lifecycle "perene"

    Scenario: Variety can override parent properties
      Given "Banana" has development cycle 300-400 days
      When "Maria" creates a variety "Banana Nanica" with development cycle 270-330 days
      Then "Banana Nanica" shows development cycle 270-330 days

    Scenario: Viewing a vegetable lists its varieties
      Given "Banana" has varieties "Banana Prata" and "Banana Nanica"
      When viewing "Banana"
      Then the varieties section lists "Banana Prata" and "Banana Nanica"

  Rule: Vegetables can have categorized photos

    Background:
      Given "Maria" is an approved member
      And the vegetable "Mandioca" exists

    Scenario: Add photo with category
      # @TODO modify "raiz" to the actual category we include in the end
      When "Maria" adds a photo to "Mandioca" with category "raiz"
      Then the photo appears in "Mandioca"'s gallery under "raiz"

    Scenario: Photos are approved by default
      When "Maria" adds a photo to "Mandioca"
      Then the photo is visible in the encyclopedia

    Scenario: Moderator can censor a photo
      Given "Maria" has added a photo to "Mandioca"
      And "Ana" is a moderator
      When "Ana" censors the photo
      Then the photo becomes hidden in "Mandioca"'s gallery

    Scenario: Moderators can set main photo for vegetable
      Given "Mandioca" has approved photos
      And "Ana" is a moderator
      When "Ana" sets a photo as the main photo
      Then that photo appears as "Mandioca"'s thumbnail in listings

    Scenario: Participant can't set main photo for vegetable
      Given "Mandioca" has approved photos
      When "Maria" sets a photo as the main photo
      Then access is denied

  Rule: People can bookmark vegetables
    Each bookmark has 4 possible states: 'interested', 'active', 'previously-active', 'indifferent'.
    For vegetables, that's "I want to plant", "Am planting", "Have planted" and "Not interested", respectively.

    Background:
      Given "Maria" is an approved member
      And the vegetable "Mandioca" exists

    Scenario: Bookmark a vegetable
      When "Maria" bookmarks "Mandioca"
      Then "Mandioca" appears in "Maria"'s bookmarked vegetables

    Scenario: Remove bookmark
      Given "Maria" has bookmarked "Mandioca"
      When "Maria" removes the bookmark
      Then "Mandioca" no longer appears in "Maria"'s bookmarked vegetables

  Rule: Revision history provides auditability

    Background:
      Given the vegetable "Mandioca" exists with the following revision history:
        | editor | action                       | evaluation | evaluated_by |
        | Maria  | created with "Raiz tuberosa" | approved   | Ana          |
        | João   | changed to "Raiz rica"       | approved   | Ana          |
        | Maria  | changed to "Info incorreta"  | rejected   | Ailton       |

    Scenario: View complete revision history
      When viewing "Mandioca" revision history
      Then 3 revisions are shown in chronological order
      And each revision shows the editor, change, and evaluation status

    Scenario: Filter revision history by evaluation status
      When viewing "Mandioca" revision history filtered to "approved"
      Then 2 revisions are shown
