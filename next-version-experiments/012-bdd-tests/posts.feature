Feature: Posts
  People can share posts that can be as short as a tweet or as large as an essay.
  Posts are tied to a specific profile: a person or an organization.
  Posts are either notes or events, for when they have a date and location.

  Rule: Note posts visibility

    Background:
      Given the following people exist:
        | name     | role        | community_access |
        | Ailton   | admin       | allowed          |
        | Ana      | moderator   | allowed          |
        | Irene    | participant | allowed          |
        | Pedro    | participant | awaiting_access  |
        | Gusttavo | participant | blocked          |

    Scenario: Person with community access creates truly public note posts
      Given "Ailton" is logged in
      When they create a "public" note post under their profile
      Then the note post is created in "Ailton"'s profile
      And the note post should have the following visibility:
        | viewer   | visible |
        | Irene    | yes     |
        | Ailton   | yes     |
        | Pedro    | yes     |
        | Gusttavo | yes     |
        | visitors | yes     |

    Scenario: Person with community access creates community-only note posts
      Given "Ailton" is logged in
      When they create a "community" note post under their profile
      Then the note post is created in "Ailton"'s profile
      And the note post should have the following visibility:
        | viewer   | visible |
        | Ailton   | yes     |
        | Ana      | yes     |
        | Irene    | yes     |
        | Pedro    | no      |
        | Gusttavo | no      |
        | visitors | no      |

    Scenario: Person with community access creates private note posts
      Given "Irene" is logged in
      When they create a "private" note post under their profile
      Then the note post is created in "Irene"'s profile
      And the note post should have the following visibility:
        | viewer   | visible |
        | Irene    | yes     |
        | Ailton   | no      |
        | Ana      | no      |
        | Pedro    | no      |
        | Gusttavo | no      |
        | visitors | no      |

    Scenario: Person awaiting access creates a public note post
      Given "Pedro" is logged in
      When they create a "public" note post under their profile
      Then the note post is created in "Pedro"'s profile
      And the note post should have the following visibility:
        | viewer   | visible |
        | Pedro    | yes     |
        | Ailton   | yes     |
        | Ana      | yes     |
        | Irene    | no      |
        | Gusttavo | no      |
        | visitors | no      |

    Scenario: Blocked person cannot create note posts
      Given "Gusttavo" is logged in
      When they try to create a "public" note post under their profile
      Then access is denied

    Scenario: Visitors cannot create note posts
      Given a visitor is browsing
      When they try to create a "public" note post
      Then access is denied

  Rule: Event posts exist and follow the same rules as note posts

    Background:
      Given the following people exist:
        | name     | role        | community_access |
        | Maria    | participant | allowed          |
        | Irene    | participant | allowed          |
        | visitors | visitor     | allowed          |

    Scenario: Person with community access creates a public event post with date and location
      Given "Maria" is logged in
      When they create a "public" event post under their profile starting "2026-02-01" ending "2026-02-02" at "Sítio Semente, Brasília"
      Then the event post is created in "Maria"'s profile
      And the event post has start date "2026-02-01"
      And the event post has end date "2026-02-02"
      And the event post has location "Sítio Semente, Brasília"
      And the event post should have the following visibility:
        | viewer   | visible |
        | Maria    | yes     |
        | Irene    | yes     |
        | visitors | yes     |

  Rule: Organization note posts visibility

    Background:
      Given the organization "Sítio Semente" exists
      And the following people exist:
        | name     | role        | community_access |
        | Maria    | participant | allowed          |
        | Joao     | participant | allowed          |
        | Teresa   | participant | allowed          |
        | Xavier   | participant | allowed          |
        | Pedro    | participant | awaiting_access  |
        | Gusttavo | participant | blocked          |
      And the following memberships exist for "Sítio Semente":
        | name   | permissions |
        | Maria  | full        |
        | Joao   | edit        |
        | Teresa | view        |

    Scenario: Editor publishes a community-only organization note post
      Given "Joao" is logged in
      When they create a "community" note post under "Sítio Semente" profile
      Then the note post should have the following visibility:
        | viewer   | visible |
        | Maria    | yes     |
        | Joao     | yes     |
        | Teresa   | yes     |
        | Xavier   | yes     |
        | Pedro    | no      |
        | Gusttavo | no      |
        | visitors | no      |

    Scenario: Editor publishes an internal organization note post (Private)
      Given "Joao" is logged in
      When they create a "private" note post under "Sítio Semente" profile
      Then the note post should have the following visibility:
        | viewer   | visible |
        | Maria    | yes     |
        | Joao     | yes     |
        | Teresa   | yes     |
        | Xavier   | no      |
        | Pedro    | no      |
        | Gusttavo | no      |
        | visitors | no      |

    Scenario: Non-member cannot create a note post under an organization profile
      Given "Xavier" is logged in
      When they try to create a "community" note post under "Sítio Semente" profile
      Then access is denied

  Rule: Organization note posts editing and deletion permissions

    Background:
      Given the organization "Sítio Semente" exists
      And the following people exist:
        | name   | role        | community_access |
        | Maria  | participant | allowed          |
        | Joao   | participant | allowed          |
        | Teresa | participant | allowed          |
        | Xavier | participant | allowed          |
      And the following memberships exist for "Sítio Semente":
        | name   | permissions |
        | Maria  | full        |
        | Joao   | edit        |
        | Teresa | view        |
      And a note post exists on "Sítio Semente" profile created by "Maria" with content "Mutirão Sábado"

    Scenario: Editor edits an existing organization note post
      Given "Joao" is logged in
      When they edit the note post content to "Mutirão Domingo"
      Then the note post content should be "Mutirão Domingo"

    Scenario: Viewer cannot edit organization note posts
      Given "Teresa" is logged in
      When they try to edit the note post content to "Tentativa"
      Then access is denied
      And the note post content should be "Mutirão Sábado"

    Scenario: Non-member cannot edit organization note posts
      Given "Xavier" is logged in
      When they try to edit the note post content to "Tentativa"
      Then access is denied
      And the note post content should be "Mutirão Sábado"

    Scenario: Full permission member deletes any organization note post
      Given "Maria" is logged in
      When they delete the note post
      Then the note post should be deleted

    Scenario: Editor deletes an organization note post
      Given "Joao" is logged in
      When they delete the note post
      Then the note post should be deleted

    Scenario: Viewer cannot delete organization note posts
      Given "Teresa" is logged in
      When they try to delete the note post
      Then access is denied

  Rule: Note post history provides auditability

    Background:
      Given the organization "Sítio Semente" exists
      And the following people exist:
        | name  | role        | community_access |
        | Maria | participant | allowed          |
        | Joao  | participant | allowed          |
      And the following memberships exist for "Sítio Semente":
        | name  | permissions |
        | Maria | full        |
        | Joao  | edit        |
      And "Maria" has created a "community" note post under "Sítio Semente" profile with content "Reunião cancelada"

    Scenario: Organization keeps history of edits with author attribution
      Given "Joao" is logged in
      When they edit the note post content to "Reunião adiada para amanhã"
      Then the note post history should contain 2 versions
      And the note post history should match:
        | version | author | content                    |
        |       1 | Maria  | Reunião cancelada          |
        |       2 | Joao   | Reunião adiada para amanhã |

  Rule: Note posts have comments

    Background:
      Given the following people exist:
        | name  | role        | community_access |
        | Maria | participant | allowed          |
        | Pedro | participant | awaiting_access  |
        | Ana   | moderator   | allowed          |
      And "Maria" has created a "public" note post under their profile with content "Canteiro novo"
      And "Pedro" is logged in

    Scenario: Person with community access comments on a note post
      Given "Maria" is logged in
      When they comment on the note post with "Que massa!"
      Then the comment is visible on the note post
      And the comment has moderation_status "approved_by_default"

    Scenario: Person awaiting access cannot comment on a note post
      When "Pedro" tries to comment on the note post
      Then access is denied

    Scenario: Moderator can censor a comment
      Given "Maria" is logged in
      And they have commented on the note post with "Comentário polêmico"
      When "Ana" censors the comment
      Then the comment becomes hidden on the note post
      And the comment has moderation_status "censored"

  Rule: Organization members visibility affects public attribution

    Background:
      Given the organization "Gororobas" exists
      And the following people exist:
        | name   | role        | community_access |
        | Maria  | participant | allowed          |
        | Joao   | participant | allowed          |
        | Xavier | participant | allowed          |
        | Pedro  | participant | awaiting_access  |
      And the following memberships exist for "Gororobas":
        | name  | permissions |
        | Maria | full        |
        | Joao  | edit        |
      And a "public" note post exists on "Gororobas" profile with contributors "Maria" and "Joao"

    Scenario: Only organization members can see editors when members are private
      Given "Gororobas" only displays members in "private"
      Then the note post contributors should have the following visibility:
        | viewer   | visible |
        | visitors | no      |
        | Pedro    | no      |
        | Xavier   | no      |
        | Maria    | yes     |
        | Joao     | yes     |

    Scenario: Only allowed people can see editors when members are community-only
      Given "Gororobas" only displays members in "community"
      Then the note post contributors should have the following visibility:
        | viewer   | visible |
        | visitors | no      |
        | Pedro    | no      |
        | Xavier   | yes     |
        | Maria    | yes     |
        | Joao     | yes     |

    Scenario: Anyone can see editors when members are public
      Given "Gororobas" only displays members in "public"
      Then the note post contributors should have the following visibility:
        | viewer   | visible |
        | visitors | yes     |
        | Pedro    | yes     |
        | Xavier   | yes     |
        | Maria    | yes     |
        | Joao     | yes     |
