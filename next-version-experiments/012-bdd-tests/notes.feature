Feature: Notes
      People can share notes that can be as short as a tweet or as large as an essay.
      Notes are tied to a specific profile: a person or an organization.

  Rule: Personal notes visibility

    Background:
      Given the following people exist:
        | name     | role        | approval_status |
        | Ailton   | admin       | approved        |
        | Ana      | moderator   | approved        |
        | Irene    | participant | approved        |
        | Pedro    | participant | pending         |
        | Gusttavo | participant | disapproved     |

    Scenario: Approved person creates truly public notes
      Given "Ailton" is logged in
      When they create a "public" note under their profile
      Then the note is created in "Ailton"'s profile
      And the note should have the following visibility:
        | viewer   | visible |
        | Irene    | yes     |
        | Ailton   | yes     |
        | Pedro    | yes     |
        | Gusttavo | yes     |
        | visitors | yes     |

    Scenario: Approved person creates community-only notes
      Given "Ailton" is logged in
      When they create a "community" note under their profile
      Then the note is created in "Ailton"'s profile
      And the note should have the following visibility:
        | viewer   | visible |
        | Ailton   | yes     |
        | Ana      | yes     |
        | Irene    | yes     |
        | Pedro    | no      |
        | Gusttavo | no      |
        | visitors | no      |

    Scenario: Approved person creates private note
      Given "Irene" is logged in
      When they create a "private" note under their profile
      Then the note is created in "Irene"'s profile
      And the note should have the following visibility:
        | viewer   | visible |
        | Irene    | yes     |
        | Ailton   | no      |
        | Ana      | no      |
        | Pedro    | no      |
        | Gusttavo | no      |
        | visitors | no      |

    Scenario: Pending person creates a public note
      Given "Pedro" is logged in
      When they create a "public" note under their profile
      Then the note is created in "Pedro"'s profile
      And the note should have the following visibility:
        | viewer   | visible |
        | Pedro    | yes     |
        | Ailton   | yes     |
        | Ana      | yes     |
        | Irene    | no      |
        | Gusttavo | no      |
        | visitors | no      |

    Scenario: Disapproved person cannot create notes
      Given "Gusttavo" is logged in
      When they try to create a "public" note under their profile
      Then access is denied

    Scenario: Disapproved person cannot create notes
      Given a visitor is browsing
      When they try to create a "public" note
      Then access is denied

  Rule: Organization notes visibility

    Background:
      Given the organization "Sítio Semente" exists
      And the following people exist:
        | name     | role        | approval_status |
        | Maria    | participant | approved        |
        | Joao     | participant | approved        |
        | Teresa   | participant | approved        |
        | Xavier   | participant | approved        |
        | Pedro    | participant | pending         |
        | Gusttavo | participant | disapproved     |
      And the following memberships exist for "Sítio Semente":
        | name   | permissions |
        | Maria  | full        |
        | Joao   | edit        |
        | Teresa | view        |
          # Xavier is not a member

    Scenario: Editor publishes a community-only organization note
      Given "Joao" is logged in
      When they create a "community" note under "Sítio Semente" profile
      Then the note should have the following visibility:
        | viewer   | visible |
        | Maria    | yes     |
        | Joao     | yes     |
        | Teresa   | yes     |
        | Xavier   | yes     |
        | Pedro    | no      |
        | Gusttavo | no      |
        | visitors | no      |

    Scenario: Editor publishes an internal organization note (Private)
      Given "Joao" is logged in
      When they create a "private" note under "Sítio Semente" profile
      Then the note should have the following visibility:
        | viewer   | visible |
        | Maria    | yes     |
        | Joao     | yes     |
        | Teresa   | yes     |
        | Xavier   | no      |
        | Pedro    | no      |
        | Gusttavo | no      |
        | visitors | no      |

    Scenario: Non-member cannot create a note under an organization profile
      Given "Xavier" is logged in
      When they try to create a "community" note under "Sítio Semente" profile
      Then access is denied

  Rule: Organization notes editing and deletion permissions

    Background:
      Given the organization "Sítio Semente" exists
      And the following people exist:
        | name   | role        | approval_status |
        | Maria  | participant | approved        |
        | Joao   | participant | approved        |
        | Teresa | participant | approved        |
        | Xavier | participant | approved        |
      And the following memberships exist for "Sítio Semente":
        | name   | permissions |
        | Maria  | full        |
        | Joao   | edit        |
        | Teresa | view        |
      And a note exists on "Sítio Semente" profile created by "Maria" with content "Mutirão Sábado"

    Scenario: Editor edits an existing organization note
      Given "Joao" is logged in
      When they edit the note content to "Mutirão Domingo"
      Then the note content should be "Mutirão Domingo"

    Scenario: Viewer cannot edit organization notes
      Given "Teresa" is logged in
      When they try to edit the note content to "Tentativa"
      Then access is denied
      And the note content should be "Mutirão Sábado"

    Scenario: Non-member cannot edit organization notes
      Given "Xavier" is logged in
      When they try to edit the note content to "Tentativa"
      Then access is denied
      And the note content should be "Mutirão Sábado"

    Scenario: Full permission member deletes any organization note
      Given "Maria" is logged in
      When they delete the note
      Then the note should be deleted

    Scenario: Editor deletes an organization note
      Given "Joao" is logged in
      When they delete the note
      Then the note should be deleted

    Scenario: Viewer cannot delete organization notes
      Given "Teresa" is logged in
      When they try to delete the note
      Then access is denied

  Rule: Note history provides auditability

    Background:
      Given the organization "Sítio Semente" exists
      And the following people exist:
        | name  | role        | approval_status |
        | Maria | participant | approved        |
        | Joao  | participant | approved        |
      And the following memberships exist for "Sítio Semente":
        | name  | permissions |
        | Maria | full        |
        | Joao  | edit        |
      And "Maria" has created a "community" note under "Sítio Semente" profile with content "Reunião cancelada"

    Scenario: Organization keeps history of edits with author attribution
      Given "Joao" is logged in
      When they edit the note content to "Reunião adiada para amanhã"
      Then the note history should contain 2 versions
      And the note history should match:
        | version | author | content                    |
        |       1 | Maria  | Reunião cancelada          |
        |       2 | Joao   | Reunião adiada para amanhã |

  Rule: Notes have comments

    Background:
      Given the following people exist:
        | name  | role        | approval_status |
        | Maria | participant | approved        |
        | Pedro | participant | pending         |
        | Ana   | moderator   | approved        |
      And "Maria" has created a "public" note under their profile with content "Canteiro novo"
      And "Pedro" is logged in

    Scenario: Approved member comments on a note
      Given "Maria" is logged in
      When they comment on the note with "Que massa!"
      Then the comment is visible on the note
      And the comment has moderation_status "approved_by_default"

    Scenario: Pending member cannot comment on a note
      When "Pedro" tries to comment on the note
      Then access is denied

    Scenario: Moderator can censor a comment
      Given "Maria" is logged in
      And they have commented on the note with "Comentário polêmico"
      When "Ana" censors the comment
      Then the comment becomes hidden on the note
      And the comment has moderation_status "censored"

  Rule: Organization member display behavior affects public attribution

    Background:
      Given the organization "Gororobas" exists
      And the following people exist:
        | name   | role        | approval_status |
        | Maria  | participant | approved        |
        | Joao   | participant | approved        |
        | Xavier | participant | approved        |
        | Pedro  | participant | pending         |
      And the following memberships exist for "Gororobas":
        | name  | permissions |
        | Maria | full        |
        | Joao  | edit        |
      And a "public" note exists on "Gororobas" profile with contributors "Maria" and "Joao"

    Scenario: Only organization members can see editors when members are private
      Given "Gororobas" only displays members in "private"
      Then the note contributors should have the following visibility:
        | viewer   | visible |
        | visitors | no      |
        | Pedro    | no      |
        | Xavier   | no      |
        | Maria    | yes     |
        | Joao     | yes     |

    Scenario: Only approved participants can see editors when members are community-only
      Given "Gororobas" only displays members in "community"
      Then the note contributors should have the following visibility:
        | viewer   | visible |
        | visitors | no      |
        | Pedro    | no      |
        | Xavier   | yes     |
        | Maria    | yes     |
        | Joao     | yes     |

    Scenario: Anyone can see editors when members are public
      Given "Gororobas" only displays members in "public"
      Then the note contributors should have the following visibility:
        | viewer   | visible |
        | visitors | yes     |
        | Pedro    | yes     |
        | Xavier   | yes     |
        | Maria    | yes     |
        | Joao     | yes     |
