import { Schema } from "effect";

export const headerName = Schema.String.check(Schema.isPattern(/^x-[a-z0-9-]{1,61}$/));
