Where I've stopped:

- need to enforce type safety for layers in Background, Scenario and ScenarioOutline
  - the issue is that the layer is optional, meaning TS doesn't infer ROut from it and hence it gets extracted from the steps.
  - steps can then include requirements that aren't provided
  - if I provide Layer.empty, then it fails properly
- need to refactor tests to use more data tables. See conversation with Claude in Raycast
- fix or ignore type errors
