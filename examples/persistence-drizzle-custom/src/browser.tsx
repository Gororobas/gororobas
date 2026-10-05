import { KeyValueStore } from "effect/persistence";

import { mountAccountApp } from "../../shared/account/browser";
import { minimumPasswordLength } from "../../shared/account/contract";
import { makeClient } from "./client";

const client = makeClient(
  { baseUrl: window.location.origin },
  KeyValueStore.layerStorage(() => window.sessionStorage),
);

mountAccountApp(client, {
  number: "02",
  description: "Application schema example",
  minimumPasswordLength,
});
