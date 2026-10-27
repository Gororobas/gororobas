Feature: Wiki articles
  The wiki article encyclopedia is a collaborative wiki of hundreds of species.
  Community members contribute knowledge about agroecological properties.
  Creation, revision evaluation, and audit history are specified in wiki-revisions.feature.

  Rule: Wiki articles support multiple translations

    Background:
      Given the wiki article "Mandioca" exists with pt content "Raiz tuberosa"

    Scenario: Viewing wiki article in unsupported language falls back to original
      Given "Mandioca" has only pt content "Raiz tuberosa"
      When a user with es language views "Mandioca"
      Then they see content "Raiz tuberosa"
      And they see an indicator that Spanish translation is unavailable

  Rule: Plant cultivars reference parent plants and preserve authored property states
    Cultivar properties have three states: Unknown, Inherit, and Value.
    Omitted properties default to Unknown. Only Inherit resolves the parent's current value.
    Parent information can be displayed alongside Unknown without changing the authored state.

    Background:
      Given "Maria" has COMMUNITY access
      And "Ana" is a MODERATOR
      And the published plant article "Banana" exists

    Scenario: Create a plant cultivar linked to its parent
      When "Maria" proposes a plant cultivar article for "Banana" with:
        | field       | value        |
        | commonNames | Banana Prata |
      Then a creation revision is created with "PENDING" evaluation, created by "Maria"
      And "Banana Prata" is not visible in "Banana"'s cultivars list
      When "Ana" approves the creation revision
      Then "Banana Prata" is published with kind "PLANT_CULTIVAR"
      And "Banana Prata" appears in "Banana"'s cultivars list

    Scenario: Omitted cultivar properties remain Unknown
      Given "Banana" has lifecycles "PERENNIAL"
      When "Maria" proposes "Banana Prata" without specifying lifecycles
      And "Ana" approves the creation revision
      Then "Banana Prata"'s lifecycles property has state "Unknown"
      And parent lifecycles "PERENNIAL" do not become "Banana Prata"'s authored lifecycles

    Scenario: Explicit inheritance resolves the parent property
      Given "Banana" has lifecycles "PERENNIAL"
      When "Maria" proposes "Banana Prata" with lifecycles state "Inherit"
      And "Ana" approves the creation revision
      Then "Banana Prata"'s lifecycles property has state "Inherit"
      And "Banana Prata"'s resolved lifecycles are "PERENNIAL"

    Scenario: Explicit cultivar values override parent values
      Given "Banana" has development cycle 300-400 days
      When "Maria" proposes "Banana Nanica" with developmentCycle state "Value" and range 270-330 days
      And "Ana" approves the creation revision
      Then "Banana Nanica"'s developmentCycle property has state "Value" and range 270-330 days
      And "Banana Nanica"'s resolved development cycle is 270-330 days

    Scenario: Parent edits change inherited values without changing authored cultivar states
      Given "Banana" has development cycle 300-400 days
      And published cultivar "Banana Prata" has developmentCycle state "Inherit"
      And published cultivar "Banana Nanica" has developmentCycle state "Value" and range 270-330 days
      And published cultivar "Banana Maçã" has developmentCycle state "Unknown"
      When an approved revision changes "Banana" development cycle to 310-410 days
      Then "Banana Prata"'s resolved development cycle is 310-410 days
      And "Banana Prata"'s developmentCycle property remains in state "Inherit"
      And "Banana Nanica"'s developmentCycle property remains in state "Value" with range 270-330 days
      And "Banana Maçã"'s developmentCycle property remains in state "Unknown"

    Scenario: Viewing a plant article lists its published cultivars
      Given "Banana" has published cultivars "Banana Prata" and "Banana Nanica"
      When viewing "Banana"
      Then the cultivars section lists "Banana Prata" and "Banana Nanica"

  Rule: Wiki articles can have categorized photos

    Background:
      Given "Maria" has COMMUNITY access
      And the wiki article "Mandioca" exists

    Scenario: Add photo with category
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
    Each bookmark has one of four states: INTERESTED, ACTIVE, PREVIOUSLY_ACTIVE, or INDIFFERENT.
    For plant articles, these mean "I want to plant", "Am planting", "Have planted", and "Not interested".
    Bookmarking without selecting a state defaults to INTERESTED.
    INDIFFERENT remains a bookmark; only removing a bookmark removes it from the list.

    Background:
      Given "Maria" has COMMUNITY access
      And the wiki article "Mandioca" exists

    Scenario: Bookmark a wiki article with the default state
      When "Maria" bookmarks "Mandioca" without selecting a state
      Then "Mandioca" appears in "Maria"'s bookmarked wiki articles with state "INTERESTED"

    Scenario Outline: Bookmark a wiki article with an explicit state
      When "Maria" bookmarks "Mandioca" with state "<state>"
      Then "Mandioca" appears in "Maria"'s bookmarked wiki articles with state "<state>"
      Examples:
        | state             |
        | INTERESTED        |
        | ACTIVE            |
        | PREVIOUSLY_ACTIVE |
        | INDIFFERENT       |

    Scenario: Changing to INDIFFERENT retains the bookmark
      Given "Maria" has bookmarked "Mandioca" with state "ACTIVE"
      When "Maria" changes the bookmark state to "INDIFFERENT"
      Then "Mandioca" appears in "Maria"'s bookmarked wiki articles with state "INDIFFERENT"
      And "Maria" has exactly one bookmark for "Mandioca"

    Scenario: Remove bookmark
      Given "Maria" has bookmarked "Mandioca" with state "INDIFFERENT"
      When "Maria" removes the bookmark
      Then "Mandioca" no longer appears in "Maria"'s bookmarked wiki articles

  Rule: Anyone can see the public profiles that bookmarked an article
    Readers see each bookmark's state, such as who is planting a plant.
    INDIFFERENT bookmarks and profiles visible only to the community are left out, as in profile search.

    Background:
      Given "Maria" has COMMUNITY access
      And the wiki article "Mandioca" exists

    Scenario: A bookmark lists its profile with the bookmark state
      Given "Maria" has bookmarked "Mandioca" with state "ACTIVE"
      Then "Maria" is listed among "Mandioca"'s bookmarkers with state "ACTIVE"

    Scenario: INDIFFERENT bookmarks are not listed
      Given "Maria" has bookmarked "Mandioca" with state "INDIFFERENT"
      Then "Maria" is not listed among "Mandioca"'s bookmarkers

    Scenario: Profiles visible only to the community are not listed
      Given "Maria"'s profile is only visible to the community
      And "Maria" has bookmarked "Mandioca" with state "ACTIVE"
      Then "Maria" is not listed among "Mandioca"'s bookmarkers

  Rule: Anyone can see the public profiles that contributed to an article
    Each approved revision a person authored counts as a contribution. Pending and rejected ones don't.

    Background:
      Given "Maria" has COMMUNITY access
      And "Ana" is a MODERATOR
      And the wiki article "Mandioca" exists

    Scenario: Approved edits count as contributions
      Given "Maria" has 2 edits to "Mandioca" evaluated as "APPROVED"
      Then "Maria" is listed among "Mandioca"'s contributors with 2 revisions

    Scenario: Rejected edits don't count as contributions
      Given "Maria" has 1 edit to "Mandioca" evaluated as "REJECTED"
      Then "Maria" is not listed among "Mandioca"'s contributors

  Rule: Wiki articles relate to the articles their content references, names or is about
    Relations are derived, never edited by hand: entity references contributors place in the content,
    and the articles link inference finds named in it or infers it is about. Readers see relations from both ends.

    Background:
      Given "Maria" has COMMUNITY access
      And "Ana" is a MODERATOR
      And the wiki article "Agrofloresta" exists
      And the wiki article "Feijão" exists
      And the wiki article "Mandioca" exists

    Scenario: Referencing an article relates both articles
      When an approved revision makes "Mandioca"'s content reference "Agrofloresta"
      Then "Mandioca"'s related articles are:
        | title        |
        | Agrofloresta |
      And "Agrofloresta"'s related articles are:
        | title    |
        | Mandioca |

    Scenario: Removing a reference removes its relation
      Given an approved revision makes "Mandioca"'s content reference "Agrofloresta"
      When an approved revision makes "Mandioca"'s content reference "Feijão"
      Then "Mandioca"'s related articles are:
        | title  |
        | Feijão |

    Scenario: Naming an article in the content relates them
      Given an approved revision makes "Mandioca"'s content say "Plantamos mandioca entre os feijões."
      When links are inferred from "Mandioca"'s content
      Then "Mandioca"'s related articles are:
        | title  |
        | Feijão |

    Scenario: Inferring what the content is about relates the articles
      Given link inference infers "Agrofloresta" from "Mandioca"'s content
      When links are inferred from "Mandioca"'s content
      Then "Mandioca"'s related articles are:
        | title        |
        | Agrofloresta |

    Scenario: Link inference keeps the relations from references
      Given link inference infers "Agrofloresta" from "Mandioca"'s content
      And an approved revision makes "Mandioca"'s content reference "Feijão"
      When links are inferred from "Mandioca"'s content
      Then "Mandioca"'s related articles are:
        | title        |
        | Agrofloresta |
        | Feijão       |

    Scenario: Readers see which article's content established a relation
      When an approved revision makes "Mandioca"'s content reference "Agrofloresta"
      Then "Agrofloresta" is related to "Mandioca" through:
        | source           | direction | text         |
        | ENTITY_REFERENCE | INCOMING  | Agrofloresta |
      And "Mandioca" is related to "Agrofloresta" through:
        | source           | direction | text         |
        | ENTITY_REFERENCE | OUTGOING  | Agrofloresta |

    Scenario: Each article's content keeps its own evidence for the same relation
      Given an approved revision makes "Mandioca"'s content reference "Agrofloresta"
      And an approved revision makes "Agrofloresta"'s content say "Plantamos mandioca entre as árvores."
      When links are inferred from "Agrofloresta"'s content
      Then "Mandioca" is related to "Agrofloresta" through:
        | source           | direction | text         |
        | ENTITY_REFERENCE | OUTGOING  | Agrofloresta |
        | MENTION          | INCOMING  | mandioca     |
      And every piece of evidence in "Mandioca"'s relations points at the node holding it
