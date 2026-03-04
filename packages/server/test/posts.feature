Feature: Posts
  People can share posts that can be as short as a tweet or as large as an essay.
  Posts are tied to a specific profile: a person or an organization.
  Posts are either notes or events, for when they have a date and location.

  Rule: Note posts visibility

    Background:
      Given the following people exist:
        | name     | access_level |
        | Ailton   | ADMIN        |
        | Ana      | MODERATOR    |
        | Irene    | COMMUNITY    |
        | Pedro    | NEWCOMER     |
        | Gusttavo | BLOCKED      |

    Scenario: Person with community access creates truly public note posts
      Given "Ailton" is logged in
      When they create a "PUBLIC" note post under their profile
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
      When they create a "COMMUNITY" note post under their profile
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
      When they create a "PRIVATE" note post under their profile
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
      When they create a "PUBLIC" note post under their profile
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
      When they try to create a "PUBLIC" note post under their profile
      Then access is denied

    Scenario: Visitors cannot create note posts
      Given a visitor is browsing
      When they try to create a "PUBLIC" note post
      Then access is denied

  Rule: Event posts exist and follow the same rules as note posts

    Background:
      Given the following people exist:
        | name  | access_level |
        | Maria | COMMUNITY    |
        | Irene | COMMUNITY    |

    Scenario: Person with community access creates a public event post with date and location
      Given "Maria" is logged in
      When they create a "PUBLIC" event post under their profile starting "2026-02-01" ending "2026-02-02" at "Sítio Semente, Brasília"
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
        | name     | access_level |
        | Maria    | COMMUNITY    |
        | Joao     | COMMUNITY    |
        | Teresa   | COMMUNITY    |
        | Xavier   | COMMUNITY    |
        | Pedro    | NEWCOMER     |
        | Gusttavo | BLOCKED      |
      And the following members exist for "Sítio Semente":
        | name   | role    |
        | Maria  | MANAGER |
        | Joao   | EDITOR  |
        | Teresa | VIEWER  |

      Scenario: Editor publishes a community-only note
      Given "Joao" is logged in
      When they create a "COMMUNITY" note post under "Sítio Semente" profile
      Then the note post should have the following visibility:
        | viewer   | visible |
        | Maria    | yes     |
        | Joao     | yes     |
        | Teresa   | yes     |
        | Xavier   | yes     |
        | Pedro    | no      |
        | Gusttavo | no      |
        | visitors | no      |

    Scenario: Editor publishes an internal note (Private)
      Given "Joao" is logged in
      When they create a "PRIVATE" note post under "Sítio Semente" profile
      Then the note post should have the following visibility:
        | viewer   | visible |
        | Maria    | yes     |
        | Joao     | yes     |
        | Teresa   | yes     |
        | Xavier   | no      |
        | Pedro    | no      |
        | Gusttavo | no      |
        | visitors | no      |

    Scenario: Non-member cannot create notes under organization
      Given "Xavier" is logged in
      When they try to create a "COMMUNITY" note post under "Sítio Semente" profile
      Then access is denied

  Rule: Organization note editing and deletion

    Background:
      Given the organization "Sítio Semente" exists
      And the following people exist:
        | name   | access_level |
        | Maria  | COMMUNITY    |
        | Joao   | COMMUNITY    |
        | Teresa | COMMUNITY    |
        | Xavier | COMMUNITY    |
      And the following members exist for "Sítio Semente":
        | name   | role    |
        | Maria  | MANAGER |
        | Joao   | EDITOR  |
        | Teresa | VIEWER  |
      And a note exists on "Sítio Semente" created by "Maria" with content "Mutirão Sábado"

    Scenario: Editor edits an existing note
      Given "Joao" is logged in
      When they edit the note post content to "Mutirão Domingo"
      Then the note post content should be "Mutirão Domingo"

    Scenario: Viewer cannot edit notes
      Given "Teresa" is logged in
      When they try to edit the note post content to "Tentativa"
      Then access is denied
      And the note post content should be "Mutirão Sábado"

    Scenario: Non-member cannot edit notes
      Given "Xavier" is logged in
      When they try to edit the note post content to "Tentativa"
      Then access is denied
      And the note post content should be "Mutirão Sábado"

    Scenario: Manager deletes note
      Given "Maria" is logged in
      When they delete the note post
      Then the note post should be deleted

    Scenario: Editor deletes note
      Given "Joao" is logged in
      When they delete the note post
      Then the note post should be deleted

    Scenario: Viewer cannot delete notes
      Given "Teresa" is logged in
      When they try to delete the note post
      Then access is denied

  Rule: Note history tracks changes with author attribution

    Background:
      Given the organization "Sítio Semente" exists
      And the following people exist:
        | name  | access_level |
        | Maria | COMMUNITY    |
        | Joao  | COMMUNITY    |
      And the following members exist for "Sítio Semente":
        | name  | role    |
        | Maria | MANAGER |
        | Joao  | EDITOR  |
      And "Maria" has created a note under "Sítio Semente" with content "Reunião cancelada"

    Scenario: Note history shows all edits with authors
      Given "Joao" is logged in
      When they edit the note post content to "Reunião adiada para amanhã"
      Then the note post history should contain 2 versions
      And the note post history should match:
        | version | author | content                    |
        |       1 | Maria  | Reunião cancelada          |
        |       2 | Joao   | Reunião adiada para amanhã |

  Rule: Notes have comments

    Background:
      Given the following people exist:
        | name  | access_level |
        | Maria | COMMUNITY    |
        | Pedro | NEWCOMER     |
        | Ana   | MODERATOR    |
      And "Maria" has created a "PUBLIC" note with content "Canteiro novo"
      And "Pedro" is logged in

    Scenario: Trusted person can comment on a note
      Given "Maria" is logged in
      When they comment on the note post with "Que massa!"
      Then the comment is visible on the note post
      And the comment has moderation_status "APPROVED_BY_DEFAULT"

    Scenario: Newcomer cannot comment on a note
      When "Pedro" tries to comment on the note post
      Then access is denied

    Scenario: Moderator can censor a comment
      Given "Maria" is logged in
      And they have commented on the note post with "Comentário polêmico"
      When "Ana" censors the comment
      Then the comment becomes hidden on the note post
      And the comment has moderation_status "CENSORED"

  Rule: Member visibility affects public attribution

    Background:
      Given the organization "Gororobas" exists
      And the following people exist:
        | name   | access_level |
        | Maria  | COMMUNITY    |
        | Joao   | COMMUNITY    |
        | Xavier | COMMUNITY    |
        | Pedro  | NEWCOMER     |
      And the following members exist for "Gororobas":
        | name  | role    |
        | Maria | MANAGER |
        | Joao  | EDITOR  |
      And a "PUBLIC" note exists on "Gororobas" with contributors "Maria" and "Joao"

    Scenario: Members see contributors when visibility is private
      Given "Gororobas" displays members in "PRIVATE"
      Then note contributors are visible to:
        | viewer   |
        | Maria    |
        | Joao     |

    Scenario: Community sees contributors when visibility is community
      Given "Gororobas" displays members in "COMMUNITY"
      Then note contributors are visible to:
        | viewer |
        | Xavier |
        | Maria  |
        | Joao   |

    Scenario: Everyone sees contributors when visibility is public
      Given "Gororobas" displays members in "PUBLIC"
      Then note contributors are visible to:
        | viewer   |
        | visitors |
        | Pedro    |
        | Xavier   |
        | Maria    |
        | Joao     |
