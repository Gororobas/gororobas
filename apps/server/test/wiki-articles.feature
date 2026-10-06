Feature: Wiki articles
  The wiki article encyclopedia is a collaborative wiki of hundreds of species.
  Community members contribute knowledge about agroecological properties.

  Rule: Only approved members can contribute to the encyclopedia

    Background:
      Given the following people exist:
        | name     | accessLevel |
        | Maria    | COMMUNITY    |
        | Pedro    | NEWCOMER     |
        | Gusttavo | BLOCKED      |

    Scenario: Person with community access creates a new wiki article
      When "Maria" creates a wiki article
      Then the wiki article is created
      And the wiki article is immediately visible in the encyclopedia

    Scenario: Person awaiting community access cannot create wiki articles
      When "Pedro" tries to create a wiki article
      Then access is denied

    Scenario: Blocked person cannot create wiki articles
      When "Gusttavo" tries to create a wiki article
      Then access is denied

  Rule: All edits create revisions that need evaluation

    Background:
      Given the following people exist:
        | name  | accessLevel |
        | Maria | COMMUNITY    |
        | Carlos | COMMUNITY   |
      And the wiki article "Mandioca" exists with content "Raiz tuberosa"

    Scenario: Member with community access submits an edit for review
      When "Maria" edits "Mandioca" content to "Raiz tuberosa rica em amido"
      Then a revision is created with:
        | field      | value   |
        | evaluation | PENDING |
        | created_by | Maria   |
      And the wiki article content remains "Raiz tuberosa"

    Scenario: Multiple pending revisions can coexist
      Given "Maria" has submitted an edit to "Mandioca"
      When "Carlos" has submitted an edit to "Mandioca"
      Then there are 2 PENDING revisions for "Mandioca"
      And the wiki article content remains "Raiz tuberosa"

  Rule: Moderators and admins evaluate revisions

    Background:
      Given the following people exist:
        | name   | accessLevel |
        | Maria  | COMMUNITY    |
        | Ana    | MODERATOR    |
        | Ailton | ADMIN        |
      And the wiki article "Mandioca" exists with content "Raiz tuberosa"

    Scenario: Moderator approves a revision
      Given "Maria" has submitted an edit changing "Mandioca" content to "Raiz rica em amido"
      When "Ana" approves the revision
      Then the revision evaluation becomes "APPROVED"
      And the revision shows evaluated by "Ana"
      And the wiki article content becomes "Raiz rica em amido"

    Scenario: Admin approves a revision
      Given "Maria" has submitted an edit changing "Mandioca" content to "Raiz rica em amido"
      When "Ailton" approves the revision
      Then the revision evaluation becomes "APPROVED"
      And the revision shows evaluated by "Ailton"
      And the wiki article content becomes "Raiz rica em amido"

    Scenario: Moderator rejects a revision
      Given "Maria" has submitted an edit changing "Mandioca" content to "Informação incorreta"
      When "Ana" rejects the revision
      Then the revision evaluation becomes "REJECTED"
      And the wiki article content remains "Raiz tuberosa"

    Scenario: Member with community access cannot evaluate revisions
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
        | name   | accessLevel |
        | Ana    | MODERATOR    |
        | Ailton | ADMIN        |
      And the wiki article "Mandioca" exists with content "Raiz tuberosa"

    Scenario: Moderator can approve their own revision
      Given "Ana" has submitted an edit changing "Mandioca" content to "Raiz rica em amido"
      When "Ana" approves the revision
      Then the wiki article content becomes "Raiz rica em amido"
      And the revision shows "Ana" as both editor and evaluator

    Scenario: Admin can approve their own revision
      Given "Ailton" has submitted an edit changing "Mandioca" content to "Raiz rica em amido"
      When "Ailton" approves the revision
      Then the wiki article content becomes "Raiz rica em amido"

  Rule: Wiki articles support multiple translations

    Background:
      Given "Maria" has COMMUNITY access
      And the wiki article "Mandioca" exists with pt content "Raiz tuberosa"

    Scenario: Add translation to another locale
      Given "Maria" has submitted a es translation for "Mandioca" with content "Raíz rica en almidón"
      When the revision is APPROVED
      Then "Mandioca" has es content "Raíz rica en almidón"

    Scenario: Viewing wiki article in unsupported locale falls back to original
      Given "Mandioca" has only pt content "Raiz tuberosa"
      When a user with es locale views "Mandioca"
      Then they see content "Raiz tuberosa"
      And they see an indicator that Spanish translation is unavailable

    Scenario: Edit existing translation
      Given "Mandioca" has es content "Raíz"
      And "Maria" has submitted an edit to "Mandioca" es content "Raíz tuberosa"
      When the revision is APPROVED
      Then "Mandioca" es content becomes "Raíz tuberosa"

  Rule: Wiki articles can be categorized by kind

    Background:
      Given "Maria" has COMMUNITY access
      And the wiki article "Banana" exists

    Scenario: Create a categorized article
      When "Maria" creates a kind for "Banana" with:
        | field        | value        |
        | handle       | banana-prata |
        | common_names | Banana Prata |
      Then the kind "Banana Prata" is created under "Banana"

    Scenario: A categorized article inherits parent properties by default
      Given "Banana" has lifecycle "PERENNIAL"
      When "Maria" creates a kind "Banana Prata" without specifying lifecycle
      Then "Banana Prata" shows lifecycle "PERENNIAL"

    Scenario: A categorized article can override parent properties
      Given "Banana" has development cycle 300-400 days
      When "Maria" creates a kind "Banana Nanica" with development cycle 270-330 days
      Then "Banana Nanica" shows development cycle 270-330 days

    Scenario: Viewing a wiki article lists its categorized entries
      Given "Banana" has kinds "Banana Prata" and "Banana Nanica"
      When viewing "Banana"
      Then the kinds section lists "Banana Prata" and "Banana Nanica"

  Rule: Wiki articles can have categorized photos

    Background:
      Given "Maria" has COMMUNITY access
      And the wiki article "Mandioca" exists

    Scenario: Add photo with category
      # @TODO modify "raiz" to the actual category we include in the end
      When "Maria" adds a photo to "Mandioca" with category "raiz"
      Then the photo appears in "Mandioca"'s gallery under "raiz"

    Scenario: Photos are approved by default
      When "Maria" adds a photo to "Mandioca"
      Then the photo is visible in the encyclopedia

    Scenario: Moderator can censor a photo
      Given "Maria" has added a photo to "Mandioca"
      And "Ana" is a MODERATOR
      When "Ana" censors the photo
      Then the photo becomes hidden in "Mandioca"'s gallery

    Scenario: Moderators can set main photo for wiki article
      Given "Mandioca" has approved photos
      And "Ana" is a MODERATOR
      When "Ana" sets a photo as the main photo
      Then that photo appears as "Mandioca"'s thumbnail in listings

    Scenario: Member with community access can't set main photo for wiki article
      Given "Mandioca" has approved photos
      When "Maria" sets a photo as the main photo
      Then access is denied

  Rule: People can bookmark wiki articles
    Each bookmark has 4 possible states: 'interested', 'active', 'previously-active', 'indifferent'.
    For wiki articles, that's "I want to plant", "Am planting", "Have planted" and "Not interested", respectively.

    Background:
      Given "Maria" has COMMUNITY access
      And the wiki article "Mandioca" exists

    Scenario: Bookmark a wiki article
      When "Maria" bookmarks "Mandioca"
      Then "Mandioca" appears in "Maria"'s bookmarked wiki articles

    Scenario: Remove bookmark
      Given "Maria" has bookmarked "Mandioca"
      When "Maria" removes the bookmark
      Then "Mandioca" no longer appears in "Maria"'s bookmarked wiki articles

  Rule: Revision history provides auditability

    Background:
      Given the wiki article "Mandioca" exists with the following revision history:
        | editor | action                       | evaluation | evaluated_by |
        | Maria  | created with "Raiz tuberosa" | APPROVED   | Ana          |
        | Carlos | changed to "Raiz rica"       | APPROVED   | Ana          |
        | Maria  | changed to "Info incorreta"  | REJECTED   | Ailton       |

    Scenario: View complete revision history
      When viewing "Mandioca" revision history
      Then 3 revisions are shown in chronological order
      And each revision shows the editor, change, and evaluation status

    Scenario: Filter revision history by evaluation status
      When viewing "Mandioca" revision history filtered to "APPROVED"
      Then 2 revisions are shown
