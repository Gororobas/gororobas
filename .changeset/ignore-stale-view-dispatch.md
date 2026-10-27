---
'foldkit': patch
---

Ignore DOM events fired by a removed Block view after focus cleanup while keeping events from the active view instance routed through its current Message boundary. Retired view dispatchers no longer remain strongly cached by an active Model occurrence across repeated remounts.

Cached lazy views retain their exact event dispatchers when reinserted. Replacing or rolling back a cached view preserves the correct dispatcher ownership and retires only the displaced view's handlers.
