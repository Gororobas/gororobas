import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: ["./src/tables.ts", "./src/passkey-tables.ts"],
  out: "./drizzle",
});
