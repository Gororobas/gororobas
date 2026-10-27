---
'foldkit': patch
---

Reject statically visible callbacks nested inside ViewInput records and collections when declaring a view. Keep callbacks at the top level, such as `toView: () => Html`; nested event handlers inside the returned Html remain supported. Runtime validation still protects dynamically typed input.

Block assembly rejects a view that has not been authored through its Composition's `makeView`. The authored view retains its precise Model, Message, child and Mount capabilities; Program hosting separately checks whether it returns a Document or Html.

Malformed Steps supplied through unchecked JavaScript now report when a Step returns another Step instead of its result. Ordinary standalone Steps must return results; a Definition-owned Step may defer connected operations until its Composition executes them. Valid combined child and Command-producing initialization Steps retain their inferred requirements.

Clarify that `Update.combineSteps` applies Steps sequentially to the Model, then returns their Commands as a batch. Command collection order does not sequence effect execution or completion.
