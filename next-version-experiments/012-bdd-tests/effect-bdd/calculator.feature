Feature: Calculator
  As a math user
  I want to perform basic calculations
  So that I can get correct results

  Background:
    Given the calculator is reset

  Scenario: Adding two numbers
    Given I have entered 5 into the calculator
    And I have entered 3 into the calculator
    When I press add
    Then the result should be 8

  Scenario Outline: Subtracting numbers
    Given I have entered <first> into the calculator
    And I have entered <second> into the calculator
    When I press subtract
    Then the result should be <result>

    Examples:
      | first | second | result |
      | 10    | 3      | 7      |
      | 5     | 5      | 0      |
      | 0     | 5      | -5     |
