import * as WorkerdServices from "@yielded/auth-platform-workerd";
import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";

import { AuthRoutes } from "./auth-server";

// Supply application-owned storage, account services, and keys separately.
// Bundle this entrypoint with Wrangler and enable nodejs_compat.
export const Routes = AuthRoutes.pipe(
  Layer.provide([WorkerdServices.layer, FetchHttpClient.layer]),
);
