Feature: Wiki article revisions
  Wiki articles are collaborative knowledge pages for plants, animals, tools, concepts, and other subjects.

  Rule: Wiki article creation requires an approved revision
    Creation and subsequent edits both begin with PENDING evaluation.
    Only an approved creation makes an article visible in the encyclopedia.

    Background:
      Given the following people exist:
        | name     | accessLevel |
        | Maria    | COMMUNITY   |
        | Ana      | MODERATOR   |
        | Ailton   | ADMIN       |
        | Pedro    | NEWCOMER    |
        | Gusttavo | BLOCKED     |

    Scenario: Community member proposes a new article for review
      When "Maria" proposes a new wiki article "Mandioca" with content "Raiz tuberosa"
      Then a creation revision is created with "PENDING" evaluation, created by "Maria"
      And "Mandioca" is not visible in the encyclopedia
      And visitors cannot access wiki article "Mandioca"

    Scenario Outline: Approval publishes the new article
      Given "Maria" has proposed a new wiki article "Mandioca" with content "Raiz tuberosa"
      When "<evaluator>" approves the creation revision
      Then the creation revision evaluation becomes "APPROVED"
      And the creation revision shows evaluated by "<evaluator>"
      And "Mandioca" is visible in the encyclopedia with content "Raiz tuberosa"
      And visitors can access wiki article "Mandioca"
      Examples:
        | evaluator |
        | Ana       |
        | Ailton    |

    Scenario: Rejected creation remains unpublished
      Given "Maria" has proposed a new wiki article "Mandioca" with content "Informação incorreta"
      When "Ana" rejects the creation revision
      Then the creation revision evaluation becomes "REJECTED"
      And the creation revision shows evaluated by "Ana"
      And "Mandioca" is not visible in the encyclopedia
      And visitors cannot access wiki article "Mandioca"
      And the rejected creation revision remains in revision history

    Scenario: Community member cannot approve their own creation
      Given "Maria" has proposed a new wiki article "Mandioca" with content "Raiz tuberosa"
      When "Maria" tries to approve the creation revision
      Then access is denied
      And the creation revision evaluation remains "PENDING"
      And "Mandioca" is not visible in the encyclopedia

    Scenario Outline: Evaluators can approve their own creations
      Given "<evaluator>" has proposed a new wiki article "Mandioca" with content "Raiz tuberosa"
      When "<evaluator>" approves the creation revision
      Then the creation revision evaluation becomes "APPROVED"
      And the creation revision shows "<evaluator>" as both editor and evaluator
      And "Mandioca" is visible in the encyclopedia with content "Raiz tuberosa"
      Examples:
        | evaluator |
        | Ana       |
        | Ailton    |

    Scenario Outline: People without community access cannot propose new articles
      When "<person>" tries to create a wiki article
      Then access is denied
      And no creation revision is created
      Examples:
        | person   |
        | Pedro    |
        | Gusttavo |

    Scenario: Visitors cannot propose new articles
      When a visitor tries to create a wiki article
      Then access is denied
      And no creation revision is created

  Rule: Only people with community access can propose revisions
    Background:
      Given the following people exist:
        | name     | accessLevel |
        | Maria    | COMMUNITY   |
        | Ana      | MODERATOR   |
        | Ailton   | ADMIN       |
        | Pedro    | NEWCOMER    |
        | Gusttavo | BLOCKED     |

    Scenario Outline: Person with community access can propose a revision
      Given a wiki article "<title>" exists
      When "Maria" proposes an edit to wiki article "<title>"
      Then a revision is created with "PENDING" evaluation, created by "Maria"
      And the wiki article "<title>" remains unchanged
      Examples:
        | title        |
        | Permaculture |

    Scenario Outline: Person awaiting access cannot propose a revision
      Given a wiki article "<title>" exists
      When "Pedro" tries to propose an edit to wiki article "<title>"
      Then access is denied
      Examples:
        | title        |
        | Permaculture |

    Scenario Outline: Blocked person cannot propose a revision
      Given a wiki article "<title>" exists
      When "Gusttavo" tries to propose an edit to wiki article "<title>"
      Then access is denied
      Examples:
        | title        |
        | Permaculture |

    Scenario Outline: Visitors cannot propose a revision
      Given a wiki article "<title>" exists
      When visitors try to propose an edit to wiki article "<title>"
      Then access is denied
      Examples:
        | title        |
        | Permaculture |

  Rule: Revisions must be evaluated by moderators or admins
    Background:
      Given the following people exist:
        | name   | accessLevel |
        | Maria  | COMMUNITY   |
        | Ana    | MODERATOR   |
        | Ailton | ADMIN       |

    Scenario Outline: Member with community access cannot evaluate a revision
      Given a wiki article "<title>" exists
      And "Maria" has proposed a revision to wiki article "<title>"
      When "Maria" tries to approve the revision
      Then access is denied
      Examples:
        | title        |
        | Permaculture |

    Scenario Outline: Moderator approves a revision
      Given a wiki article "<title>" exists
      And "Maria" has proposed a revision to wiki article "<title>"
      When "Ana" approves the revision
      Then the revision evaluation becomes "APPROVED"
      And the revision shows evaluated by "Ana"
      And the wiki article "<title>" reflects the approved edit
      Examples:
        | title        |
        | Permaculture |

    Scenario Outline: Admin approves a revision
      Given a wiki article "<title>" exists
      And "Maria" has proposed a revision to wiki article "<title>"
      When "Ailton" approves the revision
      Then the revision evaluation becomes "APPROVED"
      And the revision shows evaluated by "Ailton"
      And the wiki article "<title>" reflects the approved edit
      Examples:
        | title        |
        | Permaculture |

    Scenario Outline: Moderator rejects a revision
      Given a wiki article "<title>" exists
      And "Maria" has proposed a revision to wiki article "<title>"
      When "Ana" rejects the revision
      Then the revision evaluation becomes "REJECTED"
      And the wiki article "<title>" remains unchanged
      Examples:
        | title        |
        | Permaculture |

  Rule: Evaluators can self-approve their own revisions
    Background:
      Given the following people exist:
        | name   | accessLevel |
        | Ana    | MODERATOR   |
        | Ailton | ADMIN       |

    Scenario Outline: Moderator can approve their own revision
      Given a wiki article "<title>" exists
      And "Ana" has proposed a revision to wiki article "<title>"
      When "Ana" approves the revision
      Then the revision evaluation becomes "APPROVED"
      And the revision shows "Ana" as both editor and evaluator
      And the wiki article "<title>" reflects the approved edit
      Examples:
        | title        |
        | Permaculture |

    Scenario Outline: Admin can approve their own revision
      Given a wiki article "<title>" exists
      And "Ailton" has proposed a revision to wiki article "<title>"
      When "Ailton" approves the revision
      Then the revision evaluation becomes "APPROVED"
      And the revision shows "Ailton" as both editor and evaluator
      And the wiki article "<title>" reflects the approved edit
      Examples:
        | title        |
        | Permaculture |

  Rule: Rejected revisions remain visible in history
    Background:
      Given the following people exist:
        | name  | accessLevel |
        | Maria | COMMUNITY   |
        | Ana   | MODERATOR   |

    Scenario Outline: Rejected revision remains visible in revision history
      Given a wiki article "<title>" exists
      And "Maria" has proposed a revision to wiki article "<title>"
      And "Ana" has rejected the revision
      When viewing wiki article "<title>" revision history
      Then the rejected revision is visible with its rejection status
      Examples:
        | title        |
        | Permaculture |

  Rule: Concurrent pending revisions converge regardless of approval order

    Background:
      Given the following people exist:
        | name   | accessLevel |
        | Maria  | COMMUNITY   |
        | Carlos | COMMUNITY   |
        | Ana    | MODERATOR   |
      And the published wiki article "Mandioca" exists with content "Raiz tuberosa"

    Scenario: Multiple pending revisions can coexist without changing published content
      Given "Maria" has proposed a revision changing "Mandioca" content to "Raiz rica em amido"
      When "Carlos" proposes a revision changing "Mandioca" content to "Raiz cultivada nos trópicos"
      Then there are 2 PENDING revisions for "Mandioca"
      And "Mandioca"'s published content remains "Raiz tuberosa"

    Scenario: Approving the same concurrent revisions in either order produces the same content
      Given "Maria" and "Carlos" have proposed concurrent revisions from the same published CRDT version of "Mandioca"
      And both revisions edit the same content
      When "Ana" approves the same revisions on two identical copies of that CRDT version in opposite orders
      Then both copies have identical published content
      And both revisions have "APPROVED" evaluation in each copy

  Rule: Translation changes require approved revisions

    Background:
      Given "Maria" has COMMUNITY access
      And "Ana" is a MODERATOR
      And the wiki article "Mandioca" exists with pt content "Raiz tuberosa"

    Scenario: Add translation to another language
      Given "Maria" has submitted a es translation for "Mandioca" with content "Raíz rica en almidón"
      When "Ana" approves the revision
      Then "Mandioca" has es content "Raíz rica en almidón"
      And "Mandioca" still has pt content "Raiz tuberosa"

    Scenario: Edit existing translation
      Given "Mandioca" has es content "Raíz"
      And "Maria" has submitted an edit to "Mandioca" es content "Raíz tuberosa"
      When "Ana" approves the revision
      Then "Mandioca" es content becomes "Raíz tuberosa"
      And "Mandioca" still has pt content "Raiz tuberosa"

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
      And each revision shows the editor, change, evaluation status, and evaluator

    Scenario: Filter revision history by evaluation status
      When viewing "Mandioca" revision history filtered to "APPROVED"
      Then 2 revisions are shown
