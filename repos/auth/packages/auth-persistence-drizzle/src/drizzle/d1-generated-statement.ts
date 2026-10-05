import { sql, type SQL } from "drizzle-orm";
import { Schema } from "effect";
import type { Statement } from "effect/sql/Statement";

// oxlint-disable-next-line no-restricted-properties -- Statement.compile exposes untyped native SQL parameters.
const valuesJson = Schema.encodeUnknownSync(
  Schema.fromJsonString(
    Schema.Array(Schema.Union([Schema.String, Schema.Finite, Schema.Boolean, Schema.Null])),
  ),
);

const hex = Schema.encodeSync(Schema.Uint8ArrayFromHex);
// oxlint-disable-next-line no-restricted-properties -- D1 binding parameters are untyped native views.
const viewElements = Schema.decodeUnknownSync(Schema.Array(Schema.Finite));

// oxlint-disable-next-line no-restricted-properties -- D1 also accepts untyped byte-array parameters.
const byteElements = Schema.decodeUnknownSync(
  Schema.Array(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThan(256))),
);

/** Private compiler boundary for generated statements only. SQLite numbered
 * parameters let every JSON lookup share one binding without a CTE name. */
export const compactD1GeneratedStatement = <A extends object>(
  client: {
    readonly unsafe: <Row extends object>(
      sql: string,
      params?: ReadonlyArray<unknown>,
    ) => Statement<Row>;
  },
  statement: Statement<A>,
  invalid: () => unknown,
): Statement<A> => {
  const [source, parameters] = statement.compile();

  if (parameters.length <= 100 && new TextEncoder().encode(source).length <= 100_000)
    return statement;
  const blobs = new Set<number>();
  const numbers = new Set<number>();

  const values = parameters.map((value, index) => {
    if (typeof value === "number" || typeof value === "boolean") numbers.add(index);

    const bytes =
      value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : ArrayBuffer.isView(value)
          ? // Match D1's Array.from(view) conversion, including empty DataView.
            Uint8Array.from(viewElements(Array.from(value as unknown as ArrayLike<unknown>)))
          : Array.isArray(value)
            ? Uint8Array.from(byteElements(value))
            : undefined;

    if (bytes === undefined) return value;
    blobs.add(index);

    return hex(bytes);
  });

  const encoded = valuesJson(values);

  let index = 0,
    result = "";

  let quote: "'" | '"' | "`" | "]" | undefined;
  let comment: "line" | "block" | undefined;

  for (let offset = 0; offset < source.length; offset++) {
    const char = source[offset]!,
      next = source[offset + 1];

    if (comment !== undefined) {
      result += char;
      if (comment === "line" && char === "\n") comment = undefined;
      else if (comment === "block" && char === "*" && next === "/") {
        result += next;
        offset++;
        comment = undefined;
      }
    } else if (quote !== undefined) {
      result += char;
      if (char === quote) {
        if (next === quote && quote !== "]") {
          result += next;
          offset++;
        } else quote = undefined;
      }
    } else if (char === "'" || char === '"' || char === "`" || char === "[") {
      quote = char === "[" ? "]" : char;
      result += char;
    } else if ((char === "-" && next === "-") || (char === "/" && next === "*")) {
      comment = char === "-" ? "line" : "block";
      result += char + next;
      offset++;
    } else if (char === "?") {
      if (next !== undefined && next >= "0" && next <= "9") throw invalid();
      const lookup = `json_extract(?1, '$[${index}]')`;

      result += blobs.has(index)
        ? `unhex(${lookup})`
        : numbers.has(index)
          ? `cast(${lookup} as real)`
          : lookup;
      index++;
    } else result += char;
  }
  if (
    index !== parameters.length ||
    quote !== undefined ||
    comment === "block" ||
    new TextEncoder().encode(result).length > 100_000
  )
    throw invalid();

  return client.unsafe<A>(result, [encoded]);
};

/** Keep bounded credential vectors below D1's expression-tree depth ceiling. */
export const balancedD1And = (...conditions: ReadonlyArray<SQL | undefined>): SQL | undefined => {
  const parts = conditions.filter((condition) => condition !== undefined);

  const join = (start: number, end: number): SQL => {
    if (end - start === 1) return sql`(${parts[start]!})`;
    const middle = start + Math.floor((end - start) / 2);

    return sql`(${join(start, middle)} and ${join(middle, end)})`;
  };

  return parts.length === 0 ? undefined : join(0, parts.length);
};
