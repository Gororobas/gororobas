import * as Schema from "effect/Schema";

export const headerName = Schema.String.check(Schema.isPattern(/^x-[a-z0-9-]{1,61}$/));
