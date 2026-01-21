---
title: BDD Feature File Guidelines
impact: CRITICAL
tags: bdd, gherkin, feature, testing
---

# Skill: BDD Feature File Guidelines

> **BDD (Behavior-Driven Development)**: A collaborative approach where stakeholders and developers define system behavior through structured natural-language scenarios before implementation.

`.feature` files are written conforming to the Gherkin language.

## Core Principles

1. **Behavior over implementation** — Describe *what* the system does, not *how*
2. **Stakeholder-readable** — Non-technical team members must understand every scenario
3. **Single source of truth** — The feature file is the canonical specification

## Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Feature | Noun phrase | `Notes`, `User Authentication` |
| Rule | Complete sentence | `Organizational notes management` |
| Scenario | Outcome-focused phrase | `Editor publishes community note` |
| Step parameters | Quoted strings for values | `"Maria"`, `"public"` |

## Anti-Patterns to Avoid

1. **Implementation leakage**
   ```gherkin
   # Bad
   When the POST /api/notes endpoint is called
   Then the response status is 201
   ```

2. **Compound steps**
   ```gherkin
   # Bad
   When they log in and create a note and publish it
   ```

3. **Vague outcomes**
   ```gherkin
   # Bad
   Then it works correctly
   ```

4. **Technical jargon**
   ```gherkin
   # Bad
   Given the JWT token is valid and the user_id foreign key exists
   ```

5. **Redundant scenarios** — If two scenarios only differ by one parameter, use Scenario Outline

## Background Usage

- Keep backgrounds minimal (setup only)
- If a Background exceeds 5 lines, consider splitting the Rule
- Backgrounds apply to ALL scenarios in the Rule—don't include optional setup

```gherkin
# Good - minimal shared context
Background:
  Given the following people exist:
    | name  | access   |
    | Maria | approved |
    | João  | approved |

# Bad - too specific, won't apply to all scenarios
Background:
  Given Maria is logged in
  And she has created 3 notes
  And João has commented on one
```

## File Organization

```
features/
├── notes/
│   ├── personal-notes.feature    # Personal note behaviors
│   └── organization-notes.feature # Org note behaviors
├── visibility-rules.feature       # All visibility policies
└── authentication.feature         # Auth behaviors
```

Prefer smaller, focused files over monolithic ones. One Rule per major policy area.
