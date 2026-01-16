Feature: Revisions
  Revisions allow community members to propose edits to shared knowledge.
  Proposed edits must be evaluated by moderators or admins before becoming visible.
  These workflows apply to vegetables and resources.
  Posts and comments are edited through commits and follow a different set of rules.

  Rule: Only approved members can propose revisions

    Background:
      Given the following people exist:
        | name     | role        | approval_status |
        | Maria    | participant | approved        |
        | Ana      | moderator   | approved        |
        | Ailton   | admin       | approved        |
        | Pedro    | participant | pending         |
        | Gusttavo | participant | disapproved     |

    Scenario Outline: Approved member can propose a revision
      Given a <entity> "<title>" exists
      When "Maria" proposes an edit to <entity> "<title>"
      Then a revision is created with "pending" evaluation, created by "Maria"
      And the <entity> "<title>" remains unchanged

      Examples:
        | entity    | title                    |
        | vegetable | Mandioca                 |
        | resource  | A Terra Dá, a Terra Quer |

    Scenario Outline: Pending member cannot propose a revision
      Given a <entity> "<title>" exists
      When "Pedro" tries to propose an edit to <entity> "<title>"
      Then access is denied

      Examples:
        | entity    | title                    |
        | vegetable | Mandioca                 |
        | resource  | A Terra Dá, a Terra Quer |

    Scenario Outline: Disapproved member cannot propose a revision
      Given a <entity> "<title>" exists
      When "Gusttavo" tries to propose an edit to <entity> "<title>"
      Then access is denied

      Examples:
        | entity    | title                    |
        | vegetable | Mandioca                 |
        | resource  | A Terra Dá, a Terra Quer |

    Scenario Outline: Visitors cannot propose a revision
      Given a <entity> "<title>" exists
      When visitors try to propose an edit to <entity> "<title>"
      Then access is denied

      Examples:
        | entity    | title                    |
        | vegetable | Mandioca                 |
        | resource  | A Terra Dá, a Terra Quer |

  Rule: Revisions must be evaluated by moderators or admins

    Background:
      Given the following people exist:
        | name   | role        | approval_status |
        | Maria  | participant | approved        |
        | Ana    | moderator   | approved        |
        | Ailton | admin       | approved        |

    Scenario Outline: Participant cannot evaluate a revision
      Given a <entity> "<title>" exists
      And "Maria" has proposed a revision to <entity> "<title>"
      When "Maria" tries to approve the revision
      Then access is denied

      Examples:
        | entity    | title                    |
        | vegetable | Mandioca                 |
        | resource  | A Terra Dá, a Terra Quer |

    Scenario Outline: Moderator approves a revision
      Given a <entity> "<title>" exists
      And "Maria" has proposed a revision to <entity> "<title>"
      When "Ana" approves the revision
      Then the revision evaluation becomes "approved"
      And the revision shows evaluated by "Ana"
      And the <entity> "<title>" reflects the approved edit

      Examples:
        | entity    | title                    |
        | vegetable | Mandioca                 |
        | resource  | A Terra Dá, a Terra Quer |

    Scenario Outline: Admin approves a revision
      Given a <entity> "<title>" exists
      And "Maria" has proposed a revision to <entity> "<title>"
      When "Ailton" approves the revision
      Then the revision evaluation becomes "approved"
      And the revision shows evaluated by "Ailton"
      And the <entity> "<title>" reflects the approved edit

      Examples:
        | entity    | title                    |
        | vegetable | Mandioca                 |
        | resource  | A Terra Dá, a Terra Quer |

    Scenario Outline: Moderator rejects a revision
      Given a <entity> "<title>" exists
      And "Maria" has proposed a revision to <entity> "<title>"
      When "Ana" rejects the revision
      Then the revision evaluation becomes "rejected"
      And the <entity> "<title>" remains unchanged

      Examples:
        | entity    | title                    |
        | vegetable | Mandioca                 |
        | resource  | A Terra Dá, a Terra Quer |

  Rule: Evaluators can self-approve their own revisions

    Background:
      Given the following people exist:
        | name   | role      | approval_status |
        | Ana    | moderator | approved        |
        | Ailton | admin     | approved        |

    Scenario Outline: Moderator can approve their own revision
      Given a <entity> "<title>" exists
      And "Ana" has proposed a revision to <entity> "<title>"
      When "Ana" approves the revision
      Then the revision evaluation becomes "approved"
      And the revision shows "Ana" as both editor and evaluator
      And the <entity> "<title>" reflects the approved edit

      Examples:
        | entity    | title                    |
        | vegetable | Mandioca                 |
        | resource  | A Terra Dá, a Terra Quer |

    Scenario Outline: Admin can approve their own revision
      Given a <entity> "<title>" exists
      And "Ailton" has proposed a revision to <entity> "<title>"
      When "Ailton" approves the revision
      Then the revision evaluation becomes "approved"
      And the revision shows "Ailton" as both editor and evaluator
      And the <entity> "<title>" reflects the approved edit

      Examples:
        | entity    | title                    |
        | vegetable | Mandioca                 |
        | resource  | A Terra Dá, a Terra Quer |

  Rule: Rejected revisions remain visible in history

    Background:
      Given the following people exist:
        | name  | role        | approval_status |
        | Maria | participant | approved        |
        | Ana   | moderator   | approved        |

    Scenario Outline: Rejected revision remains visible in revision history
      Given a <entity> "<title>" exists
      And "Maria" has proposed a revision to <entity> "<title>"
      And "Ana" has rejected the revision
      When viewing <entity> "<title>" revision history
      Then the rejected revision is visible with its rejection status

      Examples:
        | entity    | title                    |
        | vegetable | Mandioca                 |
        | resource  | A Terra Dá, a Terra Quer |
