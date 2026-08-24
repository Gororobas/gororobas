Feature: Wiki article revisions
  Wiki articles are collaborative knowledge pages for plants, animals, tools, concepts, and other subjects.

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
