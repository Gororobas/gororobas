Feature: Publications
  People can share publications that can be as short as a tweet or as large as an essay.
  Publications are tied to a specific profile: a person or an organization.
  Publications are either posts or events, for when they have a date and location.

  Rule: Post publications visibility

    Background:
      Given the following people exist:
        | name     | accessLevel |
        | Ailton   | ADMIN        |
        | Ana      | MODERATOR    |
        | Irene    | COMMUNITY    |
        | Pedro    | NEWCOMER     |
        | Gusttavo | BLOCKED      |

    Scenario: Person with community access creates truly public post publications
      Given "Ailton" is logged in
      When they create a "PUBLIC" post publication under their profile
      Then the post publication is created in "Ailton"'s profile
      And the post publication should have the following visibility:
        | viewer   | visible |
        | Irene    | yes     |
        | Ailton   | yes     |
        | Pedro    | yes     |
        | Gusttavo | yes     |
        | visitors | yes     |

    Scenario: Person with community access creates community-only post publications
      Given "Ailton" is logged in
      When they create a "COMMUNITY" post publication under their profile
      Then the post publication is created in "Ailton"'s profile
      And the post publication should have the following visibility:
        | viewer   | visible |
        | Ailton   | yes     |
        | Ana      | yes     |
        | Irene    | yes     |
        | Pedro    | no      |
        | Gusttavo | no      |
        | visitors | no      |

    Scenario: Person with community access creates private post publications
      Given "Irene" is logged in
      When they create a "PRIVATE" post publication under their profile
      Then the post publication is created in "Irene"'s profile
      And the post publication should have the following visibility:
        | viewer   | visible |
        | Irene    | yes     |
        | Ailton   | no      |
        | Ana      | no      |
        | Pedro    | no      |
        | Gusttavo | no      |
        | visitors | no      |

    Scenario: Person awaiting access creates a public post publication
      Given "Pedro" is logged in
      When they create a "PUBLIC" post publication under their profile
      Then the post publication is created in "Pedro"'s profile
      And the post publication should have the following visibility:
        | viewer   | visible |
        | Pedro    | yes     |
        | Ailton   | yes     |
        | Ana      | yes     |
        | Irene    | no      |
        | Gusttavo | no      |
        | visitors | no      |

    Scenario: Blocked person cannot create post publications
      Given "Gusttavo" is logged in
      When they try to create a "PUBLIC" post publication under their profile
      Then access is denied

    Scenario: Visitors cannot create post publications
      Given a visitor is browsing
      When they try to create a "PUBLIC" post publication
      Then access is denied

  Rule: Event publications exist and follow the same rules as post publications

    Background:
      Given the following people exist:
        | name  | accessLevel |
        | Maria | COMMUNITY    |
        | Irene | COMMUNITY    |

    Scenario: Person with community access creates a public event publication with date and location
      Given "Maria" is logged in
      When they create a "PUBLIC" event publication under their profile starting "2026-02-01" ending "2026-02-02" at "Sítio Semente, Brasília"
      Then the event publication is created in "Maria"'s profile
      And the event publication has start date "2026-02-01"
      And the event publication has end date "2026-02-02"
      And the event publication has location "Sítio Semente, Brasília"
      And the event publication should have the following visibility:
        | viewer   | visible |
        | Maria    | yes     |
        | Irene    | yes     |
        | visitors | yes     |

  Rule: Organization post publications visibility

    Background:
      Given the organization "Sítio Semente" exists
      And the following people exist:
        | name     | accessLevel |
        | Maria    | COMMUNITY    |
        | Carlos   | COMMUNITY    |
        | Teresa   | COMMUNITY    |
        | Xavier   | COMMUNITY    |
        | Pedro    | NEWCOMER     |
        | Gusttavo | BLOCKED      |
      And the following members exist for "Sítio Semente":
        | name   | organizationAccessLevel |
        | Maria  | MANAGER                 |
        | Carlos | EDITOR                  |
        | Teresa | VIEWER                  |

      Scenario: Editor publishes a community-only post
      Given "Carlos" is logged in
      When they create a "COMMUNITY" post publication under "Sítio Semente" profile
      Then the post publication should have the following visibility:
        | viewer   | visible |
        | Maria    | yes     |
        | Carlos   | yes     |
        | Teresa   | yes     |
        | Xavier   | yes     |
        | Pedro    | no      |
        | Gusttavo | no      |
        | visitors | no      |

    Scenario: Editor publishes an internal post (Private)
      Given "Carlos" is logged in
      When they create a "PRIVATE" post publication under "Sítio Semente" profile
      Then the post publication should have the following visibility:
        | viewer   | visible |
        | Maria    | yes     |
        | Carlos   | yes     |
        | Teresa   | yes     |
        | Xavier   | no      |
        | Pedro    | no      |
        | Gusttavo | no      |
        | visitors | no      |

    Scenario: Non-member cannot create posts under organization
      Given "Xavier" is logged in
      When they try to create a "COMMUNITY" post publication under "Sítio Semente" profile
      Then access is denied

  Rule: Organization post editing and deletion

    Background:
      Given the organization "Sítio Semente" exists
      And the following people exist:
        | name   | accessLevel |
        | Maria  | COMMUNITY    |
        | Carlos | COMMUNITY    |
        | Teresa | COMMUNITY    |
        | Xavier | COMMUNITY    |
      And the following members exist for "Sítio Semente":
        | name   | organizationAccessLevel |
        | Maria  | MANAGER                 |
        | Carlos | EDITOR                  |
        | Teresa | VIEWER                  |
      And a post exists on "Sítio Semente" created by "Maria" with content "Mutirão Sábado"

    Scenario: Editor edits an existing post
      Given "Carlos" is logged in
      When they edit the post publication content to "Mutirão Domingo"
      Then the post publication content should be "Mutirão Domingo"

    Scenario: Viewer cannot edit posts
      Given "Teresa" is logged in
      When they try to edit the post publication content to "Tentativa"
      Then access is denied
      And the post publication content should be "Mutirão Sábado"

    Scenario: Non-member cannot edit posts
      Given "Xavier" is logged in
      When they try to edit the post publication content to "Tentativa"
      Then access is denied
      And the post publication content should be "Mutirão Sábado"

    Scenario: Manager deletes post
      Given "Maria" is logged in
      When they delete the post publication
      Then the post publication should be deleted

    Scenario: Editor deletes post
      Given "Carlos" is logged in
      When they delete the post publication
      Then the post publication should be deleted

    Scenario: Viewer cannot delete posts
      Given "Teresa" is logged in
      When they try to delete the post publication
      Then access is denied

  Rule: Post history tracks changes with author attribution

    Background:
      Given the organization "Sítio Semente" exists
      And the following people exist:
        | name  | accessLevel |
        | Maria | COMMUNITY    |
        | Carlos | COMMUNITY    |
      And the following members exist for "Sítio Semente":
        | name   | organizationAccessLevel |
        | Maria  | MANAGER                 |
        | Carlos | EDITOR                  |
      And "Maria" has created a post under "Sítio Semente" with content "Reunião cancelada"

    Scenario: Post history shows all edits with authors
      Given "Carlos" is logged in
      When they edit the post publication content to "Reunião adiada para amanhã"
      Then the post publication history should contain 2 versions
      And the post publication history should match:
        | version | author | content                    |
        |       1 | Maria  | Reunião cancelada          |
        |       2 | Carlos | Reunião adiada para amanhã |

  Rule: Posts have comments

    Background:
      Given the following people exist:
        | name  | accessLevel |
        | Maria | COMMUNITY    |
        | Pedro | NEWCOMER     |
        | Ana   | MODERATOR    |
      And "Maria" has created a "PUBLIC" post with content "Canteiro novo"
      And "Pedro" is logged in

    Scenario: Person with community access can comment on a post
      Given "Maria" is logged in
      When they comment on the post publication with "Que massa!"
      Then the comment is visible on the post publication
      And the comment has moderation_status "APPROVED_BY_DEFAULT"

    Scenario: Newcomer cannot comment on a post
      When "Pedro" tries to comment on the post publication
      Then access is denied

    Scenario: Moderator can censor a comment
      Given "Maria" is logged in
      And they have commented on the post publication with "Comentário polêmico"
      When "Ana" censors the comment
      Then the comment becomes hidden on the post publication
      And the comment has moderation_status "CENSORED"

  Rule: Member visibility affects public attribution

    Background:
      Given the organization "Gororobas" exists
      And the following people exist:
        | name   | accessLevel |
        | Maria  | COMMUNITY    |
        | Carlos | COMMUNITY    |
        | Xavier | COMMUNITY    |
        | Pedro  | NEWCOMER     |
      And the following members exist for "Gororobas":
        | name   | organizationAccessLevel |
        | Maria  | MANAGER                 |
        | Carlos | EDITOR                  |
      And a "PUBLIC" post exists on "Gororobas" with contributors "Maria" and "Carlos"

    Scenario: Members see contributors when visibility is private
      Given "Gororobas" displays members in "PRIVATE"
      Then post contributors are visible to:
        | viewer   |
        | Maria    |
        | Carlos   |

    Scenario: Community sees contributors when visibility is community
      Given "Gororobas" displays members in "COMMUNITY"
      Then post contributors are visible to:
        | viewer |
        | Xavier |
        | Maria  |
        | Carlos |

    Scenario: Everyone sees contributors when visibility is public
      Given "Gororobas" displays members in "PUBLIC"
      Then post contributors are visible to:
        | viewer   |
        | visitors |
        | Pedro    |
        | Xavier   |
        | Maria    |
        | Carlos   |
