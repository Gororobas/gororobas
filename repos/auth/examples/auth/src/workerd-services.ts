import * as WorkerdServices from "@yielded/auth/WorkerdServices";
import { Layer } from "effect";

import { AuthRoutes } from "./auth-server";

// Supply application-owned storage, account services, and keys separately.
// Bundle this entrypoint with Wrangler and enable nodejs_compat.
export const Routes = AuthRoutes.pipe(Layer.provide(WorkerdServices.layer));
