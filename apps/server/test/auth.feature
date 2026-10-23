Feature: Authentication
  Signing up and signing in are one email flow: a person requests a code, which arrives by email
  both as six digits and inside a sign-in link. Only the browser that requested the code can redeem
  it. New addresses get welcome wording and stay visitors until they complete onboarding, which
  makes them newcomers.

  Background:
    Given the following people exist:
      | name  | accessLevel |
      | Maria | COMMUNITY   |

  Scenario: Someone new signs up and completes onboarding
    When "lia@example.com" requests a sign-in code
    Then a welcome email with the code is sent to "lia@example.com"
    When they enter the code in the same browser
    Then they are signed in without a profile
    When they complete onboarding as "Lia Semente"
    Then they are signed in as a NEWCOMER with the handle "lia-semente"

  Scenario: A person with an account signs back in
    When "Maria" requests a sign-in code
    Then a sign-in email with the code is sent to "Maria"
    When they enter the code in the same browser
    Then they are signed in as "Maria"

  Scenario: A wrong code doesn't sign anyone in
    Given "Maria" has requested a sign-in code
    When they enter a wrong code
    Then they are not signed in
    When they enter the code in the same browser
    Then they are signed in as "Maria"

  Scenario: Codes only work in the browser that requested them
    Given "Maria" has requested a sign-in code
    When they enter the code in another browser
    Then they are not signed in

  Scenario: Signing out ends the session
    Given "Maria" has signed in
    When they sign out
    Then they are not signed in
