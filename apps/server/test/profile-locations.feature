Feature: Profile locations
  People keep a timeline of where they grow, have lived or are passing through. Each entry is a
  phrase in their own words or a place from the gazetteer: a municipality, state or country, with an
  optional label and elevation. Entries are public, community-only or private. Coordinates are
  never stored: a device's position only finds the municipality around it. Profile cards show the
  latest entry, and only when it's public.

  Background:
    Given the following people exist:
      | name | accessLevel |
      | Cora | COMMUNITY   |
      | Davi | COMMUNITY   |

  Scenario: Searching ranks places in the person's country first, without hiding the others
    When "Cora" searches places for "Madrid" from "CO"
    Then the places found are "Madrid · Cundinamarca · Colômbia" and "Madrid · Comunidad de Madrid · Espanha"
    When "Cora" searches places for "Madrid" from "ES"
    Then the places found are "Madrid · Comunidad de Madrid · Espanha" and "Madrid · Cundinamarca · Colômbia"

  Scenario: A town's name finds the municipality it's in
    When "Cora" searches places for "Salto y Bandera" from "CO"
    Then the place found is "Villa de Leyva · Boyacá · Colômbia", matched as "Salto y Bandera"

  Scenario: A device's position finds its municipality, and nothing is saved
    When "Cora" looks up the municipality at latitude 5.6348 and longitude -73.549
    Then the place found is "Villa de Leyva · Boyacá · Colômbia"
    And "Cora" has no locations
    And there are no PLACE articles
    When "Cora" looks up the municipality at latitude -30 and longitude -20
    Then no municipality is found

  Scenario: Choosing a place creates articles for it and its ancestors once, attributed to no one
    Given "Cora" has these locations:
      | place          | label                        | from | until | visibility |
      | Villa de Leyva | Sítio na estrada para Sáchica | 2025 |       | PUBLIC     |
    And "Davi" has these locations:
      | place          | label | from | until | visibility |
      | Villa de Leyva |       |      |       | PRIVATE    |
    Then there are PLACE articles for "Colômbia", "Boyacá" and "Villa de Leyva", without contributors

  Scenario: Entries go from where people are now to where they've been
    Given "Cora" has these locations:
      | place            | label | from | until | visibility |
      | Viçosa           |       | 2015 | 2019  | PUBLIC     |
      | Viajando por aí  |       | 2019 | 2024  | COMMUNITY  |
      | Villa de Leyva   |       | 2025 |       | PUBLIC     |
    Then "Cora"'s locations are "Villa de Leyva", "Viajando por aí" and "Viçosa"

  Scenario: Cards show the latest location only while it's public
    Given "Cora" has these locations:
      | place          | label                        | from | until | visibility |
      | Villa de Leyva | Sítio na estrada para Sáchica | 2025 |       | PUBLIC     |
    Then profile search shows "Cora" in "Sítio na estrada para Sáchica"
    When "Cora" adds "Algum lugar novo" privately, from 2026
    Then profile search shows "Cora" without a location
    And "Cora"'s locations are "Algum lugar novo" and "Villa de Leyva"

  Scenario: A location can't end before it starts
    When "Cora" adds "Viajando por aí" from 2024 until 2020
    Then the location is refused for its dates
    And "Cora" has no locations

  Scenario: People remove locations from their timeline, and only their own
    Given "Cora" has these locations:
      | place           | label | from | until | visibility |
      | Viajando por aí |       |      |       | PUBLIC     |
    When "Davi" tries to remove "Cora"'s location "Viajando por aí"
    Then "Cora"'s locations are "Viajando por aí"
    When "Cora" removes their location "Viajando por aí"
    Then "Cora" has no locations
