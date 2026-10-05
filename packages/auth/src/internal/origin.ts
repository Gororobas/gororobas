import { Schema } from "effect";

export const origin = Schema.String.check(
  Schema.makeFilter((value) => {
    try {
      const url = new URL(value);

      return (
        url.origin === value &&
        (url.protocol === "https:" ||
          (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
      );
    } catch {
      return false;
    }
  }),
);
