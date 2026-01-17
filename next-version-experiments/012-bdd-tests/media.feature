Feature: Media
  People can upload media (images, audio, video).
  Media can be uploaded inside posts or attached to vegetables.

  Rule: Media uploaded inside posts inherits the post visibility

    Background:
      Given the following people exist:
        | name     | role        | community_access |
        | Ailton   | admin       | allowed          |
        | Ana      | moderator   | allowed          |
        | Irene    | participant | allowed          |
        | Pedro    | participant | awaiting_access  |
        | Gusttavo | participant | blocked          |

    Scenario: Public post media is visible to the same audience as the post
      Given "Irene" is logged in
      When they create a "public" post under their profile
      And they upload media to the post
      Then the media should have the following visibility:
        | viewer   | visible |
        | Irene    | yes     |
        | Pedro    | yes     |
        | Gusttavo | yes     |
        | visitors | yes     |

    Scenario: Community post media is visible to the same audience as the post
      Given "Irene" is logged in
      When they create a "community" post under their profile
      And they upload media to the post
      Then the media should have the following visibility:
        | viewer   | visible |
        | Irene    | yes     |
        | Pedro    | no      |
        | Gusttavo | no      |
        | visitors | no      |

    Scenario: Private post media is visible to the same audience as the post
      Given "Irene" is logged in
      When they create a "private" post under their profile
      And they upload media to the post
      Then the media should have the following visibility:
        | viewer   | visible |
        | Irene    | yes     |
        | Ailton   | no      |
        | Ana      | no      |
        | Pedro    | no      |
        | visitors | no      |

    Scenario: Person awaiting access can upload media inside posts
      Given "Pedro" is logged in
      When they create a "public" post under their profile
      And they upload media to the post
      Then the post is created in "Pedro"'s profile

    Scenario: Blocked person cannot upload media inside posts
      Given "Gusttavo" is logged in
      When they try to upload media to a post
      Then access is denied

    Scenario: Visitors cannot upload media inside posts
      Given a visitor is browsing
      When they try to upload media to a post
      Then access is denied

  Rule: Vegetable media is always public and can be moderated

    Background:
      Given the following people exist:
        | name     | role        | community_access |
        | Maria    | participant | allowed          |
        | Pedro    | participant | awaiting_access  |
        | Gusttavo | participant | blocked          |
        | Ana      | moderator   | allowed          |
      And the vegetables "Mandioca" and "Banana" exist

    Scenario: Allowed person attaches media to a vegetable
      Given "Maria" is logged in
      When they upload media attached to vegetable "Mandioca"
      Then the media is visible on vegetable "Mandioca"
      And visitors can access the media

    Scenario: Allowed person can attach the same media to multiple vegetables
      Given "Maria" is logged in
      When they upload media attached to vegetables "Mandioca" and "Banana"
      Then the media is visible on vegetable "Mandioca"
      And the media is visible on vegetable "Banana"

    Scenario: Vegetable media is approved by default
      Given "Maria" is logged in
      When they upload media attached to vegetable "Mandioca"
      Then the media is visible to everyone

    Scenario: Moderator can censor vegetable media
      Given "Maria" is logged in
      And they have uploaded media attached to vegetable "Mandioca"
      When "Ana" censors the media
      Then the media has moderation_status "censored"
      And visitors cannot access the media
      And the media is hidden on vegetable "Mandioca"

    Scenario: Censoring hides media everywhere it is attached
      Given "Maria" is logged in
      And they have uploaded media attached to vegetables "Mandioca" and "Banana"
      When "Ana" censors the media
      Then the media is hidden on vegetable "Mandioca"
      And the media is hidden on vegetable "Banana"

    Scenario: Person awaiting access cannot attach media to vegetables
      Given "Pedro" is logged in
      When they try to upload media attached to vegetable "Mandioca"
      Then access is denied

    Scenario: Blocked person cannot attach media to vegetables
      Given "Gusttavo" is logged in
      When they try to upload media attached to vegetable "Mandioca"
      Then access is denied

    Scenario: Visitors cannot attach media to vegetables
      Given a visitor is browsing
      When they try to upload media attached to vegetable "Mandioca"
      Then access is denied
