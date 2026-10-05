import { type PasskeyKernel, makePasskeyKernel } from "@yielded/auth-persistence/Adapter";

import { drizzleQueryOperations } from "./query-operations";
export const passkeyKernel: PasskeyKernel = makePasskeyKernel(drizzleQueryOperations);
