import { readFileSync } from "node:fs";

import { expect, it } from "vite-plus/test";

// Requested security regression: privileged review dependencies must not change
// when a mutable tag moves. Check the policy without fixing a particular release.
it("pins external actions in the privileged review workflow to full commit SHAs", () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/pr-review.yml", import.meta.url),
    "utf8",
  );

  const actions = Array.from(workflow.matchAll(/^\s*(?:-\s*)?uses:\s*([^#\r\n]+)/gm), (match) =>
    match[1].trim().replace(/^["']|["']$/g, ""),
  ).filter((action) => !action.startsWith("./"));

  expect(actions.length).toBeGreaterThan(0);
  expect(actions.filter((action) => !/^[^@\s]+@[a-f0-9]{40}$/.test(action))).toEqual([]);
});
