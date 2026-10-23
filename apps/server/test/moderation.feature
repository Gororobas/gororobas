Feature: Moderation queue
  Moderators and admins share one queue of pending reviews: anything waiting on their decision,
  oldest first. Reviews aren't assigned to anyone, and resolving one removes it for everyone.

  Background:
    Given the following people exist:
      | name   | accessLevel |
      | Ailton | ADMIN       |
      | Ana    | MODERATOR   |
      | Irene  | COMMUNITY   |
      | Pedro  | NEWCOMER    |
    And the wiki article "Mandioca" is published
    And "Irene" proposed the new wiki article "Taioba"
    And "Irene" proposed an edit to the wiki article "Mandioca"

  Scenario: Moderators see every pending review, oldest first
    When "Ana" opens the moderation queue
    Then the moderation queue lists:
      | review                           | subject  |
      | newcomer awaiting approval       | Pedro    |
      | revision proposing a new article | Taioba   |
      | revision awaiting evaluation     | Mandioca |

  Scenario: Resolving a review removes it from everyone's queue
    Given "Ana" promoted "Pedro" to COMMUNITY
    And "Ana" approved the pending revision of "Mandioca"
    When "Ailton" opens the moderation queue
    Then the moderation queue lists:
      | review                           | subject |
      | revision proposing a new article | Taioba  |

  Scenario Outline: Only moderators and admins can open the moderation queue
    When "<viewer>" tries to open the moderation queue
    Then access is denied

    Examples:
      | viewer   |
      | Irene    |
      | Pedro    |
      | visitors |
