@documentation-only
Feature: Sync
  The mobile app supports a limited offline experience and syncs local-first data when online.
  Some data is partially synced based on what is relevant to a person or an organization.

  The tests for this aren't actually implemented.
  This is merely for documentation of intended behavior and may not reflect how the app works.

  Rule: Offline behavior is explicit

    Scenario: Offline sections show warnings
      Given a person is offline
      When they open the app
      Then sections that require a connection show an offline warning

  Rule: Vegetables are synced to support offline reading

    Scenario: Vegetables are available offline
      Given a person was previously online
      And vegetables have been synced to the device
      When the person is offline
      Then they can still access vegetables

  Rule: Posts are partially synced based on relevance

    Scenario: Person can access their own posts offline
      Given "Maria" is logged in
      And "Maria" has created posts under their profile
      And posts relevant to "Maria" have been synced to the device
      When "Maria" is offline
      Then "Maria" can still access their own synced posts

    Scenario: Person has offline access posts of the organizations they're members of
      Given "Maria" is logged in
      And "Maria" is part of "Gororobas"
      And posts relevant to "Gororobas" have been synced to the device
      When "Maria" is offline
      Then "Maria" can still access synced posts from "Gororobas"

    Scenario: Person cannot access unrelated posts offline
      Given "Maria" is logged in
      And posts unrelated to "Maria" exist
      When "Maria" is offline
      Then "Maria" cannot access unrelated posts

  Rule: Sync resolves conflicts automatically

    Scenario: Offline edits sync without losing data
      Given "Maria" edits a post while offline
      And another edit exists on the server for the same post
      When "Maria" goes online and sync runs
      Then both edits are preserved according to an algorithm (CRDT)
