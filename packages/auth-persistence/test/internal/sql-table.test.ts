import { expect, it } from "vite-plus/test";

import { AuthPersistence } from "../../src/index";

it("decodes native PostgreSQL int8 values without losing integer precision", () => {
  const table = AuthPersistence.table({
    name: "integers",
    columns: { value: { name: "value", type: "integer" } },
    unique: [],
  });

  const column = table.columns.value;

  expect(column.decode(9_007_199_254_740_991n)).toBe(Number.MAX_SAFE_INTEGER);

  expect(() => column.decode(9_007_199_254_740_992n)).toThrow(
    expect.objectContaining({ _tag: "PersistenceMappingError" }),
  );
});
